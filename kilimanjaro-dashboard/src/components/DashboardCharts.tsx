'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from 'recharts';
import { format, parseISO, subDays } from 'date-fns';

interface Metric {
  date: string;
  value: number;
  metricType: string;
  unit: string;
}

interface Workout {
  date: string;
  workoutType: string;
  duration: number;
  distance?: number;
  elevationGain?: number;
  activeEnergy?: number;
  avgHeartRate?: number;
}

interface Props {
  metrics: Metric[];
  workouts: Workout[];
}

function groupByDayAvg(items: { date: string; value: number }[]) {
  const map = new Map<string, { sum: number; count: number }>();
  for (const item of items) {
    const day = format(parseISO(item.date), 'yyyy-MM-dd');
    const prev = map.get(day) || { sum: 0, count: 0 };
    prev.sum += item.value;
    prev.count += 1;
    map.set(day, prev);
  }
  return Array.from(map.entries())
    .map(([date, { sum, count }]) => ({ date, value: count > 0 ? Math.round(sum / count) : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function groupByDaySum(items: { date: string; value: number }[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const day = format(parseISO(item.date), 'yyyy-MM-dd');
    map.set(day, (map.get(day) || 0) + item.value);
  }
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function StepsChart({ metrics }: { metrics: Metric[] }) {
  const steps = metrics.filter(m => m.metricType === 'steps');
  const data = groupByDaySum(steps);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No step data yet. Sync with Health Auto Export to see your steps here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">Daily Steps</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="stepsColor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => format(parseISO(d), 'MMM d')}
            stroke="#94a3b8"
            fontSize={12}
          />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(d) => format(parseISO(d as string), 'MMM d, yyyy')}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#10b981"
            fill="url(#stepsColor)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HeartRateChart({ metrics }: { metrics: Metric[] }) {
  const hr = metrics.filter(m => m.metricType === 'heartRate' || m.metricType === 'restingHeartRate');
  const resting = hr.filter(m => m.metricType === 'restingHeartRate');
  const all = hr.filter(m => m.metricType === 'heartRate');

  const restingData = groupByDayAvg(resting.map(r => ({ date: r.date, value: r.value })));
  const allData = groupByDayAvg(all.map(r => ({ date: r.date, value: r.value })));

  if (restingData.length === 0 && allData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No heart rate data yet.
      </div>
    );
  }

  const merged = new Map<string, { date: string; resting?: number; avg?: number }>();
  for (const d of restingData) merged.set(d.date, { ...merged.get(d.date), date: d.date, resting: d.value });
  for (const d of allData) merged.set(d.date, { ...merged.get(d.date), date: d.date, avg: d.value });
  const data = Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">Heart Rate</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => format(parseISO(d), 'MMM d')}
            stroke="#94a3b8"
            fontSize={12}
          />
          <YAxis domain={['dataMin - 5', 'dataMax + 5']} stroke="#94a3b8" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(d) => format(parseISO(d as string), 'MMM d, yyyy')}
          />
          {restingData.length > 0 && (
            <Line type="monotone" dataKey="resting" stroke="#3b82f6" strokeWidth={2} dot={false} name="Resting" />
          )}
          {allData.length > 0 && (
            <Line type="monotone" dataKey="avg" stroke="#ef4444" strokeWidth={2} dot={false} name="Avg" strokeDasharray="4 4" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WorkoutChart({ workouts }: { workouts: Workout[] }) {
  if (workouts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No workout data yet. Sync with Health Auto Export to see your workouts here.
      </div>
    );
  }

  // Aggregate durations by day
  const dayMap = new Map<string, number>();
  for (const w of workouts) {
    const key = format(parseISO(w.date), 'yyyy-MM-dd');
    dayMap.set(key, (dayMap.get(key) || 0) + w.duration);
  }
  const data = Array.from(dayMap.entries())
    .map(([date, duration]) => ({ date, duration }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">Workout Duration (min)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => format(parseISO(d), 'MMM d')}
            stroke="#94a3b8"
            fontSize={12}
          />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(d) => format(parseISO(d as string), 'MMM d, yyyy')}
            formatter={(value, name) => [`${value} min`, 'Duration']}
          />
          <Bar dataKey="duration" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ElevationChart({ workouts }: { workouts: Workout[] }) {
  const withElevation = workouts.filter(w => (w.elevationGain || 0) > 0);

  if (withElevation.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No elevation data yet. Enable "Include Route Data" in Health Auto Export workout settings.
      </div>
    );
  }

  const data = withElevation.map(w => ({
    date: w.date,
    elevation: Math.round(w.elevationGain || 0),
    type: w.workoutType,
  }));

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">Elevation Gain (m)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => format(parseISO(d), 'MMM d')}
            stroke="#94a3b8"
            fontSize={12}
          />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(d) => format(parseISO(d as string), 'MMM d, yyyy')}
            formatter={(value) => [`${value} m`, 'Elevation']}
          />
          <Bar dataKey="elevation" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardCharts({ metrics, workouts }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <StepsChart metrics={metrics} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <HeartRateChart metrics={metrics} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <WorkoutChart workouts={workouts} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <ElevationChart workouts={workouts} />
      </div>
    </div>
  );
}
