import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data';
import type { HealthMetric, Workout } from '@/lib/data';
import { addMetricToSupabase, addWorkoutToSupabase } from '@/lib/supabase';

// Health Auto Export REST API sends health data via HTTP POST.
// Supported formats:
//   1. { data: { metrics: [...], workouts: [...] } } — structured Health Auto Export
//   2. Array of flat metric/workout records
//   3. Single flat record

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function verifyAuth(request: Request): boolean {
  const expected = process.env.WEBHOOK_TOKEN;
  if (!expected) return true; // no token set → open
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return !!(match && match[1] === expected);
}

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------
let recentIds = new Set<string>();
const recentMax = 2000;

function makeDedupKey(itemType: string, date: string, subKey: string): string {
  // group by minute for dedup tolerance
  const d = new Date(date);
  d.setSeconds(0, 0);
  return `${itemType}::${d.toISOString()}::${subKey}`;
}

function isDuplicate(key: string): boolean {
  if (recentIds.has(key)) return true;
  recentIds.add(key);
  if (recentIds.size > recentMax) {
    // prune oldest half
    const arr = Array.from(recentIds);
    recentIds = new Set(arr.slice(Math.floor(recentMax / 2)));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Process incoming payload
// ---------------------------------------------------------------------------
interface ProcessResult {
  metrics: number;
  workouts: number;
  skipped: number;
  errors: string[];
}

export function detectAndStore(body: unknown): ProcessResult {
  const result: ProcessResult = { metrics: 0, workouts: 0, skipped: 0, errors: [] };

  if (!body || typeof body !== 'object') {
    result.errors.push('Body is not an object');
    return result;
  }

  const obj = body as Record<string, unknown>;

  // --- Format 1: structured HAE wrapper ---
  if (obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>;

    if (Array.isArray(data.metrics)) {
      for (const group of data.metrics) {
        const r = storeHaeMetricGroup(group as Record<string, unknown>);
        result.metrics += r.stored;
        result.skipped += r.skipped;
      }
    }

    if (Array.isArray(data.workouts)) {
      for (const w of data.workouts) {
        const ok = storeHaeWorkout(w as Record<string, unknown>);
        if (ok) result.workouts++;
      }
    }
    return result;
  }

  // --- Format 2: array of flat records ---
  if (Array.isArray(body)) {
    for (const item of body) {
      const r = detectAndStoreSingle(item);
      if (r.type === 'metric') result.metrics++;
      if (r.type === 'workout') result.workouts++;
      if (r.skipped) result.skipped++;
      if (r.error) result.errors.push(r.error);
    }
    return result;
  }

  // --- Format 3: single flat record ---
  const r = detectAndStoreSingle(obj);
  if (r.type === 'metric') result.metrics++;
  if (r.type === 'workout') result.workouts++;
  if (r.skipped) result.skipped++;
  if (r.error) result.errors.push(r.error);
  return result;
}

// ---------------------------------------------------------------------------
// Health Auto Export metric group → { name, units, data: [...] }
// ---------------------------------------------------------------------------
function storeHaeMetricGroup(group: Record<string, unknown>): { stored: number; skipped: number } {
  let stored = 0;
  let skipped = 0;

  const metricType = mapHaeMetricName(String(group.name || ''));
  if (!metricType) return { stored, skipped };

  const dataArray = group.data;
  if (!Array.isArray(dataArray)) return { stored, skipped };

  const unit = String(group.units || 'count');

  for (const point of dataArray) {
    if (!point || typeof point !== 'object') continue;
    const pt = point as Record<string, unknown>;

    let value: number | undefined;
    if (metricType === 'heartRate' && pt.Avg !== undefined) {
      value = parseFloatAny(pt.Avg);
    } else {
      value = parseFloatAny(pt.qty);
    }
    if (value === undefined) continue;

    const date = parseDate(pt.date) || new Date().toISOString();
    const source = String(pt.source || 'Health Auto Export').split('|')[0].trim();

    const dedupKey = makeDedupKey(metricType, date, source);
    if (isDuplicate(dedupKey)) {
      skipped++;
      continue;
    }

    const metric: Omit<HealthMetric, 'id' | 'createdAt'> = {
      date,
      metricType,
      value,
      unit,
      source,
    };
    dataStore.addMetric(metric);
    addMetricToSupabase(metric).catch(() => {}); // background persist
    stored++;
  }

  return { stored, skipped };
}

function extractValue(field: unknown): number | undefined {
  if (field === null || field === undefined) return undefined;
  if (typeof field === 'number') return field;
  if (typeof field === 'object' && field && 'qty' in field) {
    return parseFloatAny((field as Record<string, unknown>).qty);
  }
  return parseFloatAny(field);
}

function storeHaeWorkout(item: Record<string, unknown>): boolean {
  const date = parseDate(item.startDate || item.date || item.creationDate) || new Date().toISOString();
  const workoutType = String(item.name || item.workoutType || item.type || 'Unknown');
  const dedupKey = makeDedupKey('workout', date, workoutType);
  if (isDuplicate(dedupKey)) return false;

  const workout: Omit<Workout, 'id' | 'createdAt'> = {
    date,
    workoutType,
    duration: parseDuration(item.duration),
    distance: extractValue(item.distance),
    elevationGain: extractValue(item.totalElevationGain) || extractValue(item.elevationAscended),
    activeEnergy: extractValue(item.activeEnergyBurned) || extractValue(item.activeEnergy) || extractValue(item.calories),
    avgHeartRate: extractValue(item.averageHeartRate) || extractValue(item.heartRate),
    maxHeartRate: extractValue(item.maximumHeartRate) || extractValue(item.maxHeartRate),
    notes: item.notes ? String(item.notes) : undefined,
  };
  dataStore.addWorkout(workout);
  addWorkoutToSupabase(workout).catch(() => {}); // background persist
  return true;
}

function detectAndStoreSingle(item: Record<string, unknown>): { type: string; skipped?: boolean; error?: string } {
  // Detect flat workout records more aggressively
  const isWorkout = 
    item.workoutType || 
    item.type === 'Workout' || 
    (item.duration !== undefined && (item.distance !== undefined || item.activeEnergyBurned !== undefined || item.calories !== undefined)) ||
    (item.startDate !== undefined && item.endDate !== undefined && (item.activeEnergyBurned !== undefined || item.averageHeartRate !== undefined));
  
  if (isWorkout) {
    const ok = storeHaeWorkout(item);
    return ok ? { type: 'workout' } : { type: 'workout', skipped: true };
  }

  const metricType = detectMetricType(item);
  if (metricType) {
    const date = parseDate(item.startDate || item.date || item.creationDate || item.endDate) || new Date().toISOString();
    const source = String(item.sourceName || item.source || 'Health Auto Export');
    const dedupKey = makeDedupKey(metricType, date, source);
    if (isDuplicate(dedupKey)) {
      return { type: 'metric', skipped: true };
    }

    const metric: Omit<HealthMetric, 'id' | 'createdAt'> = {
      date,
      metricType,
      value: parseFloatAny(item.quantity || item.value || item.count || item.avg) || 0,
      unit: String(item.unit || 'count'),
      source,
    };
    dataStore.addMetric(metric);
    addMetricToSupabase(metric).catch(() => {}); // background persist
    return { type: 'metric' };
  }

  return { type: 'unknown', error: `Could not identify metric type: ${JSON.stringify(item).slice(0, 200)}` };
}

// ---------------------------------------------------------------------------
// Mappings / Parsers
// ---------------------------------------------------------------------------
function mapHaeMetricName(name: string): HealthMetric['metricType'] | null {
  const n = name.toLowerCase();
  if (n.includes('step')) return 'steps';
  if (n.includes('distance') && !n.includes('elevation')) return 'distance';
  if (n.includes('active_energy') || n.includes('calorie')) return 'activeEnergy';
  if (n.includes('resting') && n.includes('heart')) return 'restingHeartRate';
  if (n.includes('heart_rate') && !n.includes('resting') && !n.includes('variability')) return 'heartRate';
  if (n.includes('sleep')) return 'sleep';
  if (n.includes('weight') || n.includes('mass')) return 'weight';
  if (n.includes('elevation') || n.includes('flights')) return 'elevation';
  return null;
}

function detectMetricType(item: Record<string, unknown>): HealthMetric['metricType'] | null {
  const typeField = String(item.type || item.dataType || item.metricType || item.name || '').toLowerCase();

  if (typeField.includes('step')) return 'steps';
  if (typeField.includes('distance') && !typeField.includes('elevation')) return 'distance';
  if (typeField.includes('activeenergy') || typeField.includes('calorie')) return 'activeEnergy';
  if (typeField.includes('resting') && typeField.includes('heart')) return 'restingHeartRate';
  if (typeField.includes('heart') && typeField.includes('rate')) return 'heartRate';
  if (typeField.includes('sleep')) return 'sleep';
  if (typeField.includes('weight') || typeField.includes('mass')) return 'weight';
  if (typeField.includes('elevation') || typeField.includes('flights')) return 'elevation';

  const unit = String(item.unit || '').toLowerCase();
  if (unit.includes('step')) return 'steps';
  if (unit.includes('km') || unit.includes('mile')) return 'distance';
  if (unit.includes('kcal') || unit.includes('cal')) return 'activeEnergy';
  if (unit.includes('bpm') || unit.includes('count/min')) return 'heartRate';
  if (unit.includes('kg') || unit.includes('lb')) return 'weight';
  if (unit.includes('m') && !unit.includes('km')) return 'elevation';

  return null;
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseDuration(val: unknown): number {
  if (typeof val === 'number') {
    return val > 100 ? Math.round(val / 60) : val;
  }
  if (typeof val === 'string') {
    const num = parseFloat(val);
    if (!isNaN(num)) return num > 100 ? Math.round(num / 60) : num;
  }
  return 0;
}

function parseFloatAny(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? undefined : num;
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';
  let body: unknown;

  try {
    if (contentType.includes('multipart/form-data') && contentType.includes('boundary=')) {
      // Health Auto Export sends CSV as multipart/form-data.
      // We won't support CSV in this route; reject gracefully.
      return NextResponse.json(
        { success: false, error: 'CSV multipart not supported. Set Export Format to JSON in Health Auto Export.' },
        { status: 415 }
      );
    }
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  // Health Auto Export v2 can send batched requests. Each batch is a
  // standalone POST but the payload shape is the same.
  const result = detectAndStore(body);

  console.log('Webhook received:', {
    metrics: result.metrics,
    workouts: result.workouts,
    skipped: result.skipped,
    errors: result.errors.length,
  });

  // 207 Multi-Status if we had partial failures; 200 on success
  const hasErrors = result.errors.length > 0;
  return NextResponse.json(
    {
      success: !hasErrors,
      stored: { metrics: result.metrics, workouts: result.workouts },
      skipped: result.skipped,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: hasErrors ? 207 : 200 }
  );
}

// GET for quick debugging
export async function GET() {
  const data = dataStore.getAllData();
  return NextResponse.json({
    metrics: data.metrics.length,
    workouts: data.workouts.length,
    preview: {
      lastMetrics: data.metrics.slice(-3),
      lastWorkouts: data.workouts.slice(-3),
    },
  });
}
