import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data';
import type { HealthMetric, Workout } from '@/lib/data';
import { parseDate } from '@/lib/parse-date';

function verifyAuth(request: Request): boolean {
  const expected = process.env.WEBHOOK_TOKEN;
  if (!expected) return true;
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return !!(match && match[1] === expected);
}

let recentIds = new Set<string>();
const recentMax = 2000;

function makeDedupKey(itemType: string, date: string, subKey: string): string {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return `${itemType}::${d.toISOString()}::${subKey}`;
}

function isDuplicate(key: string): boolean {
  if (recentIds.has(key)) return true;
  recentIds.add(key);
  if (recentIds.size > recentMax) {
    const arr = Array.from(recentIds);
    recentIds = new Set(arr.slice(Math.floor(recentMax / 2)));
  }
  return false;
}

interface ProcessResult {
  metrics: number;
  workouts: number;
  skipped: number;
  errors: string[];
}

export async function detectAndStore(body: unknown): Promise<ProcessResult> {
  const result: ProcessResult = { metrics: 0, workouts: 0, skipped: 0, errors: [] };

  if (!body || typeof body !== 'object') {
    result.errors.push('Body is not an object');
    return result;
  }

  const obj = body as Record<string, unknown>;

  if (obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>;

    if (Array.isArray(data.metrics)) {
      for (const group of data.metrics) {
        const r = await storeHaeMetricGroup(group as Record<string, unknown>);
        result.metrics += r.stored;
        result.skipped += r.skipped;
        result.errors.push(...r.errors);
      }
    }

    if (Array.isArray(data.workouts)) {
      for (const w of data.workouts) {
        const res = await storeHaeWorkout(w as Record<string, unknown>);
        if (res.ok) result.workouts++;
        if (res.error) result.errors.push(res.error);
      }
    }
    return result;
  }

  if (Array.isArray(body)) {
    for (const item of body) {
      const r = await detectAndStoreSingle(item);
      if (r.type === 'metric') result.metrics++;
      if (r.type === 'workout') result.workouts++;
      if (r.skipped) result.skipped++;
      if (r.error) result.errors.push(r.error);
    }
    return result;
  }

  const r = await detectAndStoreSingle(obj);
  if (r.type === 'metric') result.metrics++;
  if (r.type === 'workout') result.workouts++;
  if (r.skipped) result.skipped++;
  if (r.error) result.errors.push(r.error);
  return result;
}

async function storeHaeMetricGroup(group: Record<string, unknown>): Promise<{ stored: number; skipped: number; errors: string[] }> {
  let stored = 0;
  let skipped = 0;
  const errors: string[] = [];

  const metricType = mapHaeMetricName(String(group.name || ''));
  if (!metricType) return { stored, skipped, errors };

  const dataArray = group.data;
  if (!Array.isArray(dataArray)) return { stored, skipped, errors };

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
    const { supabaseOk } = await dataStore.addMetric(metric);
    stored++;
    if (!supabaseOk) errors.push(`supabase-metric-fail: ${metricType}`);
  }

  return { stored, skipped, errors };
}

function extractValue(field: unknown): number | undefined {
  if (field === null || field === undefined) return undefined;
  if (typeof field === 'number') return field;
  if (typeof field === 'object' && field && 'qty' in field) {
    return parseFloatAny((field as Record<string, unknown>).qty);
  }
  return parseFloatAny(field);
}

async function storeHaeWorkout(item: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const date = parseDate(item.startDate || item.date || item.creationDate) || new Date().toISOString();
  const workoutType = String(item.name || item.workoutType || item.type || 'Unknown');
  const dedupKey = makeDedupKey('workout', date, workoutType);
  if (isDuplicate(dedupKey)) return { ok: false, error: 'duplicate' };

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
  const { supabaseOk } = await dataStore.addWorkout(workout);
  if (!supabaseOk) return { ok: true, error: 'supabase-workout-failed' };
  return { ok: true };
}

async function detectAndStoreSingle(item: Record<string, unknown>): Promise<{ type: string; skipped?: boolean; error?: string }> {
  const isWorkout = 
    item.workoutType || 
    item.type === 'Workout' || 
    (item.duration !== undefined && (item.distance !== undefined || item.activeEnergyBurned !== undefined || item.calories !== undefined)) ||
    (item.startDate !== undefined && item.endDate !== undefined && (item.activeEnergyBurned !== undefined || item.averageHeartRate !== undefined));
  
  if (isWorkout) {
    const res = await storeHaeWorkout(item);
    return res.ok ? { type: 'workout' } : { type: 'workout', skipped: true, error: res.error };
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
    const { supabaseOk } = await dataStore.addMetric(metric);
    return { type: 'metric', error: supabaseOk ? undefined : 'supabase-metric-failed' };
  }

  return { type: 'unknown', error: `unrecognized: ${JSON.stringify(item).slice(0, 200)}` };
}

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

function parseDuration(val: unknown): number {
  if (typeof val === 'number') return val > 100 ? Math.round(val / 60) : val;
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
      return NextResponse.json(
        { success: false, error: 'CSV multipart not supported. Set Export Format to JSON in Health Auto Export.' },
        { status: 415 }
      );
    }
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await detectAndStore(body);
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
