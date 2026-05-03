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

// ---------------------------------------------------------------------------
// Per-request dedup context (avoids false positives across warm containers)
// ---------------------------------------------------------------------------
interface DedupContext {
  recentIds: Set<string>;
}

function createDedupContext(): DedupContext {
  return { recentIds: new Set<string>() };
}

const recentMax = 2000;

function makeDedupKey(itemType: string, date: string, subKey: string): string {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return `${itemType}::${d.toISOString()}::${subKey}`;
}

function isDuplicate(ctx: DedupContext, key: string): boolean {
  if (ctx.recentIds.has(key)) return true;
  ctx.recentIds.add(key);
  if (ctx.recentIds.size > recentMax) {
    const arr = Array.from(ctx.recentIds);
    ctx.recentIds = new Set(arr.slice(Math.floor(recentMax / 2)));
  }
  return false;
}

interface ProcessResult {
  metrics: number;
  workouts: number;
  skipped: number;
  errors: string[];
}

export async function detectAndStore(body: unknown, ctx: DedupContext): Promise<ProcessResult> {
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
        const r = await storeHaeMetricGroup(group as Record<string, unknown>, ctx);
        result.metrics += r.stored;
        result.skipped += r.skipped;
        result.errors.push(...r.errors);
      }
    }

    if (Array.isArray(data.workouts)) {
      for (const w of data.workouts) {
        const res = await storeHaeWorkout(w as Record<string, unknown>, ctx);
        if (res.ok) result.workouts++;
        if (res.skipped) result.skipped++;
        if (res.error) result.errors.push(res.error);
      }
    }
    return result;
  }

  if (Array.isArray(body)) {
    for (const item of body) {
      const r = await detectAndStoreSingle(item, ctx);
      if (r.type === 'metric') result.metrics++;
      if (r.type === 'workout') result.workouts++;
      if (r.skipped) result.skipped++;
      if (r.error) result.errors.push(r.error);
    }
    return result;
  }

  const r = await detectAndStoreSingle(obj, ctx);
  if (r.type === 'metric') result.metrics++;
  if (r.type === 'workout') result.workouts++;
  if (r.skipped) result.skipped++;
  if (r.error) result.errors.push(r.error);
  return result;
}

async function storeHaeMetricGroup(group: Record<string, unknown>, ctx: DedupContext): Promise<{ stored: number; skipped: number; errors: string[] }> {
  let stored = 0;
  let skipped = 0;
  const errors: string[] = [];

  const metricType = mapHaeMetricName(String(group.name || ''));
  if (!metricType) return { stored, skipped, errors };

  const dataArray = group.data;
  if (!Array.isArray(dataArray)) return { stored, skipped, errors };

  let rawUnit = String(group.units || 'count');
  const lowerUnit = rawUnit.toLowerCase();
  // Normalize kJ → kcal for energy metrics
  let unit = rawUnit;
  let unitFactor = 1;
  if (metricType === 'activeEnergy' && lowerUnit.includes('j') && !lowerUnit.includes('cal')) {
    unitFactor = 4.184;
    unit = 'kcal';
  }

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

    if (unitFactor !== 1) {
      value = Math.round(value / unitFactor);
    }

    const date = parseDate(pt.date) || new Date().toISOString();
    const source = String(pt.source || 'Health Auto Export').split('|')[0].trim();

    const dedupKey = makeDedupKey(metricType, date, source);
    if (isDuplicate(ctx, dedupKey)) {
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
  if (typeof field === 'object' && field) {
    const obj = field as Record<string, unknown>;
    if ('qty' in obj) {
      const val = parseFloatAny(obj.qty);
      if (val === undefined) return undefined;
      const units = String(obj.units || '').toLowerCase();
      // Apple Health may send kJ instead of kcal — normalize everything to kcal
      if (units.includes('j') && !units.includes('cal')) {
        return Math.round(val / 4.184);
      }
      return val;
    }
  }
  return parseFloatAny(field);
}

function extractWithUnits(field: unknown): { value: number | undefined; unit: string } {
  if (field === null || field === undefined) return { value: undefined, unit: '' };
  if (typeof field === 'object' && field && 'qty' in field) {
    const obj = field as Record<string, unknown>;
    const rawVal = parseFloatAny(obj.qty);
    const rawUnit = String(obj.units || '');
    const lowerUnit = rawUnit.toLowerCase();
    if (rawVal !== undefined && lowerUnit.includes('j') && !lowerUnit.includes('cal')) {
      return { value: Math.round(rawVal / 4.184), unit: 'kcal' };
    }
    return { value: rawVal, unit: rawUnit };
  }
  if (typeof field === 'number') return { value: field, unit: 'count' };
  return { value: parseFloatAny(field), unit: '' };
}

async function storeHaeWorkout(item: Record<string, unknown>, ctx: DedupContext): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  // HAE v2 uses "start" / "end", older versions use "startDate" / "date" / "creationDate"
  const date = parseDate(item.start || item.startDate || item.date || item.creationDate) || new Date().toISOString();
  const workoutType = String(item.name || item.workoutType || item.type || 'Unknown');
  const dedupKey = makeDedupKey('workout', date, workoutType);
  if (isDuplicate(ctx, dedupKey)) return { ok: false, skipped: true };

  let ae = extractWithUnits(item.activeEnergyBurned);
  if (ae.value === undefined) ae = extractWithUnits(item.activeEnergy);
  if (ae.value === undefined) ae = extractWithUnits(item.calories);

  let dist = extractWithUnits(item.distance);
  let eg = extractWithUnits(item.totalElevationGain);
  if (eg.value === undefined) eg = extractWithUnits(item.elevationAscended);

  let hr = extractWithUnits(item.averageHeartRate);
  if (hr.value === undefined) hr = extractWithUnits(item.heartRate);
  let maxHr = extractWithUnits(item.maximumHeartRate);
  if (maxHr.value === undefined) maxHr = extractWithUnits(item.maxHeartRate);

  const workout: Omit<Workout, 'id' | 'createdAt'> = {
    date,
    workoutType,
    duration: parseDuration(item.duration),
    distance: dist.value,
    elevationGain: eg.value,
    activeEnergy: ae.value,
    avgHeartRate: hr.value,
    maxHeartRate: maxHr.value,
    notes: item.notes ? String(item.notes) : undefined,
  };
  const { supabaseOk } = await dataStore.addWorkout(workout);
  if (!supabaseOk) return { ok: true, error: 'supabase-workout-failed' };
  return { ok: true };
}

async function detectAndStoreSingle(item: Record<string, unknown>, ctx: DedupContext): Promise<{ type: string; skipped?: boolean; error?: string }> {
  const isWorkout = 
    item.workoutType || 
    item.type === 'Workout' || 
    item.name ||                // HAE v2 uses "name" for workout type
    (item.start !== undefined && item.end !== undefined) || // HAE v2 start/end
    (item.duration !== undefined && (item.distance !== undefined || item.activeEnergyBurned !== undefined || item.calories !== undefined)) ||
    (item.startDate !== undefined && item.endDate !== undefined && (item.activeEnergyBurned !== undefined || item.averageHeartRate !== undefined));
  
  if (isWorkout) {
    const res = await storeHaeWorkout(item, ctx);
    return res.ok ? { type: 'workout' } : { type: 'workout', skipped: true, error: res.error };
  }

  const metricType = detectMetricType(item);
  if (metricType) {
    const date = parseDate(item.start || item.startDate || item.date || item.creationDate || item.endDate) || new Date().toISOString();
    const source = String(item.sourceName || item.source || 'Health Auto Export');
    const dedupKey = makeDedupKey(metricType, date, source);
    if (isDuplicate(ctx, dedupKey)) {
      return { type: 'metric', skipped: true };
    }

    let value = parseFloatAny(item.quantity || item.value || item.count || item.avg) || 0;
    let unit = String(item.unit || 'count').toLowerCase();
    if (metricType === 'activeEnergy' && unit.includes('j') && !unit.includes('cal')) {
      value = Math.round(value / 4.184);
      unit = 'kcal';
    }
    const metric: Omit<HealthMetric, 'id' | 'createdAt'> = {
      date,
      metricType,
      value,
      unit,
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

  const result = await detectAndStore(body, createDedupContext());
  const hasErrors = result.errors.length > 0;

  // Diagnostic: show what date the first workout parsed to
  let firstWorkoutDate: { raw: string; parsed: string | null } | undefined;
  if (result.workouts > 0 && Array.isArray((body as Record<string, unknown>).data)) {
    const data = (body as Record<string, unknown>).data as Record<string, unknown>;
    if (Array.isArray(data.workouts) && data.workouts[0]) {
      const w = data.workouts[0] as Record<string, unknown>;
      const rawDate = String(w.start || w.startDate || w.date || w.creationDate || 'NOT FOUND');
      firstWorkoutDate = { raw: rawDate, parsed: parseDate(rawDate) };
    }
  }

  return NextResponse.json(
    {
      success: !hasErrors,
      stored: { metrics: result.metrics, workouts: result.workouts },
      skipped: result.skipped,
      errors: result.errors.length > 0 ? result.errors : undefined,
      diagnostic: firstWorkoutDate,
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
