import { NextResponse } from 'next/server';
import {
  addMetricToSupabase,
  addWorkoutToSupabase,
  getMetricsFromSupabase,
  getWorkoutsFromSupabase,
} from './supabase';
import { getCutoffDate } from './date-utils';

export type HealthMetric = {
  id: string;
  date: string;
  metricType: 'steps' | 'distance' | 'activeEnergy' | 'restingHeartRate' | 'heartRate' | 'sleep' | 'weight' | 'elevation';
  value: number;
  unit: string;
  source: string;
  createdAt: string;
};

export type Workout = {
  id: string;
  date: string;
  workoutType: string;
  duration: number; // minutes
  distance?: number;
  elevationGain?: number;
  activeEnergy?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  notes?: string;
  createdAt: string;
};

// Import static JSON at build time (historical data)
import staticJson from './data.json';

const staticData = (staticJson || { metrics: [], workouts: [] }) as {
  metrics: HealthMetric[];
  workouts: Workout[];
};

function hasSupabase(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

function dedupeItems<T extends { date: string } & Record<string, unknown>>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.date}-${JSON.stringify(item).slice(0, 200)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeData<T extends { date: string } & Record<string, unknown>>(
  remote: T[],
  local: T[]
): T[] {
  const cutoff = getCutoffDate(90); // keep last 90 days
  const all = [...remote, ...local].filter(item => new Date(item.date) >= cutoff);
  return dedupeItems(all).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// In-memory storage with Supabase persistence
class DataStore {
  private metrics: HealthMetric[] = [...staticData.metrics];
  private workouts: Workout[] = [...staticData.workouts];
  private maxItems = 5000;
  private useSupabase = hasSupabase();

  async addMetric(metric: Omit<HealthMetric, 'id' | 'createdAt'>) {
    const newMetric: HealthMetric = {
      ...metric,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    this.metrics.push(newMetric);
    if (this.metrics.length > this.maxItems) {
      this.metrics = this.metrics.slice(-this.maxItems);
    }
    let supabaseOk = false;
    if (this.useSupabase) {
      supabaseOk = await addMetricToSupabase(metric);
    }
    return { metric: newMetric, supabaseOk };
  }

  async addWorkout(workout: Omit<Workout, 'id' | 'createdAt'>) {
    const newWorkout: Workout = {
      ...workout,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    this.workouts.push(newWorkout);
    if (this.workouts.length > this.maxItems / 2) {
      this.workouts = this.workouts.slice(-Math.floor(this.maxItems / 2));
    }
    let supabaseOk = false;
    if (this.useSupabase) {
      supabaseOk = await addWorkoutToSupabase(workout);
    }
    return { workout: newWorkout, supabaseOk };
  }

  async getMetrics(type?: string, days = 90): Promise<HealthMetric[]> {
    const cutoff = getCutoffDate(days);
    let remote: HealthMetric[] = [];
    if (this.useSupabase) {
      remote = await getMetricsFromSupabase(type, days);
    }

    // Merge remote + local static data, dedupe
    const all = mergeData(remote, this.metrics).filter(m => new Date(m.date) >= cutoff);

    if (type) return all.filter(m => m.metricType === type);
    return all;
  }

  async getWorkouts(days = 90): Promise<Workout[]> {
    const cutoff = getCutoffDate(days);
    let remote: Workout[] = [];
    if (this.useSupabase) {
      remote = await getWorkoutsFromSupabase(days);
    }
    return mergeData(remote, this.workouts)
      .filter(w => new Date(w.date) >= cutoff)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  getAllData() {
    return {
      metrics: this.metrics,
      workouts: this.workouts,
    };
  }

  exportData() {
    return JSON.stringify({ metrics: this.metrics, workouts: this.workouts }, null, 2);
  }

  importData(data: string) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.metrics) this.metrics = parsed.metrics;
      if (parsed.workouts) this.workouts = parsed.workouts;
      return { success: true, metrics: this.metrics.length, workouts: this.workouts.length };
    } catch (e) {
      return { success: false, error: 'Invalid JSON' };
    }
  }

  async getStats(days = 30) {
    const metrics = await this.getMetrics(undefined, days);
    const workouts = await this.getWorkouts(days);

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
    const totalElevation = workouts.reduce((a, b) => a + (b.elevationGain || 0), 0);

    return {
      avgSteps,
      totalWorkouts,
      totalDuration,
      totalElevation: Math.round(totalElevation),
      avgWorkoutDuration: totalWorkouts ? Math.round(totalDuration / totalWorkouts) : 0,
      dailySteps,
      workouts: workouts.slice(0, 20),
    };
  }
}

export const dataStore = new DataStore();
