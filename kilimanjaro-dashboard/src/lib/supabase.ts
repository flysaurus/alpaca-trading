import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { HealthMetric, Workout } from './data';
import { getCutoffDate } from './date-utils';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.warn('[Supabase] Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return null;
  }
  supabase = createClient(url, key);
  return supabase;
}

export async function checkSupabaseHealth(): Promise<{ ok: boolean; tables?: string[]; error?: string }> {
  const client = getSupabase();
  if (!client) return { ok: false, error: 'No Supabase client' };
  try {
    // Check if tables exist by querying metrics and workouts
    const [mRes, wRes] = await Promise.all([
      client.from('metrics').select('id', { count: 'exact', head: true }),
      client.from('workouts').select('id', { count: 'exact', head: true }),
    ]);
    return {
      ok: true,
      tables: [
        `metrics: ${mRes.error ? 'MISSING/ERROR' : 'OK'}`,
        `workouts: ${wRes.error ? 'MISSING/ERROR' : 'OK'}`,
      ],
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function addMetricToSupabase(metric: Omit<HealthMetric, 'id' | 'createdAt'>): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  try {
    // Upsert: if same metric_type + date + source exists, update the value
    const { error } = await client.from('metrics').upsert(
      {
        date: metric.date,
        metric_type: metric.metricType,
        value: metric.value,
        unit: metric.unit,
        source: metric.source,
      },
      { onConflict: 'date,metric_type,source' }
    );
    if (error) {
      // Log but don't fail — dedup collisions are expected for re-exports
      if (error.message?.includes('unique') || error.code === '23505') {
        console.log('[Supabase metric dedup] skipped duplicate metric:', metric.metricType, metric.date);
        return true; // treat as success
      }
      console.error('[Supabase insert metric]', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Supabase insert metric] exception:', e);
    return false;
  }
}

export async function addWorkoutToSupabase(workout: Omit<Workout, 'id' | 'createdAt'>): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  try {
    // Upsert: if same date + workout_type exists, skip/overwrite (handles HAE re-exports gracefully)
    const { error } = await client.from('workouts').upsert(
      {
        date: workout.date,
        workout_type: workout.workoutType,
        duration: workout.duration,
        distance: workout.distance ?? null,
        elevation_gain: workout.elevationGain ?? null,
        active_energy: workout.activeEnergy ?? null,
        avg_heart_rate: workout.avgHeartRate ?? null,
        max_heart_rate: workout.maxHeartRate ?? null,
        notes: workout.notes ?? null,
      },
      { onConflict: 'date,workout_type' }
    );
    if (error) {
      if (error.message?.includes('unique') || error.code === '23505') {
        console.log('[Supabase workout dedup] skipped duplicate workout:', workout.workoutType, workout.date);
        return true; // treat as success
      }
      console.error('[Supabase insert workout]', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Supabase insert workout] exception:', e);
    return false;
  }
}

export async function getMetricsFromSupabase(type?: string, days = 90): Promise<HealthMetric[]> {
  const client = getSupabase();
  if (!client) return [];
  try {
    const cutoff = getCutoffDate(days);
    let query = client
      .from('metrics')
      .select('*')
      .gte('date', cutoff.toISOString())
      .order('date', { ascending: true });
    if (type) {
      query = query.eq('metric_type', type);
    }
    const { data, error } = await query;
    if (error) {
      console.error('[Supabase getMetrics]', error.message);
      return [];
    }
    if (!data) return [];
    return data.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      date: String(row.date),
      metricType: String(row.metric_type) as HealthMetric['metricType'],
      value: Number(row.value),
      unit: String(row.unit),
      source: String(row.source),
      createdAt: String(row.created_at),
    }));
  } catch (e) {
    console.error('[Supabase getMetrics] exception:', e);
    return [];
  }
}

export async function getWorkoutsFromSupabase(days = 90): Promise<Workout[]> {
  const client = getSupabase();
  if (!client) return [];
  try {
    const cutoff = getCutoffDate(days);
    const { data, error } = await client
      .from('workouts')
      .select('*')
      .gte('date', cutoff.toISOString())
      .order('date', { ascending: false });
    if (error) {
      console.error('[Supabase getWorkouts]', error.message);
      return [];
    }
    if (!data) return [];
    return data.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      date: String(row.date),
      workoutType: String(row.workout_type),
      duration: Number(row.duration),
      distance: row.distance ? Number(row.distance) : undefined,
      elevationGain: row.elevation_gain ? Number(row.elevation_gain) : undefined,
      activeEnergy: row.active_energy ? Number(row.active_energy) : undefined,
      avgHeartRate: row.avg_heart_rate ? Number(row.avg_heart_rate) : undefined,
      maxHeartRate: row.max_heart_rate ? Number(row.max_heart_rate) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      createdAt: String(row.created_at),
    }));
  } catch (e) {
    console.error('[Supabase getWorkouts] exception:', e);
    return [];
  }
}

export async function getStatsFromSupabase(days = 30, metricDays = 30) {
  const [metrics, workouts] = await Promise.all([
    getMetricsFromSupabase(undefined, metricDays),
    getWorkoutsFromSupabase(days),
  ]);

  // Aggregate steps by day to get daily totals
  const stepMap = new Map<number, number[]>();
  for (const m of metrics.filter(m => m.metricType === 'steps')) {
    const dayMs = new Date(m.date).setHours(0, 0, 0, 0);
    if (!stepMap.has(dayMs)) stepMap.set(dayMs, []);
    stepMap.get(dayMs)!.push(m.value);
  }

  const dailySteps = Array.from(stepMap.entries()).map(([dayMs, vals]) => ({
    dayMs,
    steps: vals.reduce((a, b) => a + b, 0),
  }));

  const totalSteps = dailySteps.reduce((a, b) => a + b.steps, 0);
  const avgSteps = dailySteps.length ? Math.round(totalSteps / dailySteps.length) : 0;

  const totalWorkouts = workouts.length;
  const totalDuration = workouts.reduce((a, b) => a + b.duration, 0);
  const totalDistance = workouts.reduce((a, b) => a + (b.distance || 0), 0);
  const totalElevation = workouts.reduce((a, b) => a + (b.elevationGain || 0), 0);
  const totalEnergy = workouts.reduce((a, b) => a + (b.activeEnergy || 0), 0);

  return {
    avgSteps,
    totalWorkouts,
    totalDuration,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalElevation: Math.round(totalElevation),
    totalEnergy: Math.round(totalEnergy),
    avgWorkoutDuration: totalWorkouts ? Math.round(totalDuration / totalWorkouts) : 0,
    workouts: workouts.slice(0, 20), // return top 20 for detail
    dailySteps,
  };
}

export async function clearSupabaseData(): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  try {
    await client.rpc('truncate_health_tables');
    return true;
  } catch {
    return false;
  }
}
