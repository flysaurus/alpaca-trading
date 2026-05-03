'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Footprints,
  Heart,
  Mountain,
  Clock,
  TrendingUp,
  Activity,
  Flame,
  Download,
  Trash2,
  RefreshCw,
  Moon,
  Dumbbell,
} from 'lucide-react';
import DashboardCharts from '@/components/DashboardCharts';

interface Stats {
  avgSteps: number;
  totalWorkouts: number;
  totalDuration: number;
  totalElevation: number;
  avgWorkoutDuration: number;
}

interface DataResponse {
  metrics: Array<{
    date: string;
    value: number;
    metricType: string;
    unit: string;
  }>;
  workouts: Array<{
    date: string;
    workoutType: string;
    duration: number;
    distance?: number;
    elevationGain?: number;
    activeEnergy?: number;
    avgHeartRate?: number;
  }>;
  stats: Stats;
  summary: {
    metricCount: number;
    workoutCount: number;
    dateRange: number;
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-slate-800">{value}</p>
          {sub && <p className="text-xs text-slate-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/data?days=${days}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [days]);

  const handleExport = () => {
    if (!data) return;
    const blob = new Blob(
      [JSON.stringify({ metrics: data.metrics, workouts: data.workouts }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-data-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = async () => {
    if (!confirm('Clear all data? This cannot be undone.')) return;
    await fetch('/api/data', { method: 'DELETE' });
    fetchData();
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  const stats = data?.stats;
  const hasWorkouts = (data?.workouts.length || 0) > 0;
  const lastWorkout = hasWorkouts ? data!.workouts[data!.workouts.length - 1] : null;

  // Additional metrics
  const sleepMetrics = data?.metrics.filter(m => m.metricType === 'sleep') || [];
  const avgSleep = sleepMetrics.length
    ? sleepMetrics.reduce((a, b) => a + b.value, 0) / sleepMetrics.length / 60
    : 0;

  const exerciseMinutes = (data?.workouts || []).reduce((sum, w) => sum + w.duration, 0);
  const exerciseHours = Math.round((exerciseMinutes / 60) * 10) / 10;

  const restingHRs = data?.metrics.filter(m => m.metricType === 'restingHeartRate') || [];
  const avgRestingHR = restingHRs.length
    ? Math.round(restingHRs.reduce((a, b) => a + b.value, 0) / restingHRs.length)
    : 0;

  const activeEnergy = data?.metrics.filter(m => m.metricType === 'activeEnergy') || [];
  const totalEnergy = Math.round(activeEnergy.reduce((a, b) => a + b.value, 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Kilimanjaro Training Dashboard</h1>
          <p className="text-sm text-slate-500">Track your fitness journey to the summit</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={fetchData}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleExport}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            title="Export data"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={handleClear}
            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
            title="Clear all data"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Webhook URL */}
      {(!data?.metrics.length && !data?.workouts.length) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="font-semibold text-amber-800 mb-2">Getting Started</h3>
          <p className="text-sm text-amber-700 mb-2">
            Set up Health Auto Export to send data to this webhook URL:
          </p>
          <code className="block bg-white border border-amber-200 rounded-lg p-3 text-xs font-mono text-slate-700 mb-2 break-all">
            {typeof window !== 'undefined'
              ? `${window.location.origin}/api/webhook/health`
              : '/api/webhook/health'}
          </code>
          <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
            <li>Open Health Auto Export app on your iPhone</li>
            <li>Go to Automated Exports → New Automation → REST API</li>
            <li>Paste the webhook URL above</li>
            <li>Select data types: Health Metrics + Workouts</li>
            <li>Set sync cadence (e.g., Every 6 hours)</li>
            <li>Tap &quot;Manual Export&quot; to test</li>
          </ol>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Footprints}
          label="Avg Steps"
          value={stats?.avgSteps.toLocaleString() || '0'}
          sub="per day"
          color="bg-emerald-500"
        />
        <StatCard
          icon={Activity}
          label="Workouts"
          value={stats?.totalWorkouts.toString() || '0'}
          sub={`Last ${days} ${days === 1 ? 'day' : 'days'}`}
          color="bg-amber-500"
        />
        <StatCard
          icon={Clock}
          label="Total Duration"
          value={`${Math.round((stats?.totalDuration || 0) / 60)}h`}
          sub={`${stats?.avgWorkoutDuration || 0} min avg`}
          color="bg-blue-500"
        />
        <StatCard
          icon={Mountain}
          label="Elevation"
          value={`${(stats?.totalElevation || 0).toLocaleString()}m`}
          sub="total gain"
          color="bg-violet-500"
        />
        <StatCard
          icon={Dumbbell}
          label="Exercise"
          value={`${exerciseHours}h`}
          sub="total"
          color="bg-orange-500"
        />
        <StatCard
          icon={Moon}
          label="Avg Sleep"
          value={avgSleep > 0 ? `${avgSleep.toFixed(1)}h` : '—'}
          sub="per night"
          color="bg-indigo-500"
        />
        <StatCard
          icon={Heart}
          label="Resting HR"
          value={avgRestingHR > 0 ? `${avgRestingHR} bpm` : '—'}
          sub="average"
          color="bg-rose-500"
        />
        <StatCard
          icon={TrendingUp}
          label="Active Energy"
          value={totalEnergy > 0 ? `${totalEnergy.toLocaleString()} kJ` : '—'}
          sub="total"
          color="bg-teal-500"
        />
      </div>

      {/* Recent Activity */}
      {lastWorkout && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-slate-800">Latest Workout</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase">Type</p>
              <p className="font-medium text-slate-700">{lastWorkout.workoutType}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Date</p>
              <p className="font-medium text-slate-700">
                {format(parseISO(lastWorkout.date), 'MMM d')}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Duration</p>
              <p className="font-medium text-slate-700">{lastWorkout.duration} min</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Calories</p>
              <p className="font-medium text-slate-700">
                {lastWorkout.activeEnergy ? `${Math.round(lastWorkout.activeEnergy)} kcal` : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Workouts Table */}
      <RecentWorkouts workouts={data?.workouts || []} />

      {/* Charts */}
      {data && <DashboardCharts metrics={data.metrics} workouts={data.workouts} />}

      {/* Data Summary */}
      <div className="text-center text-xs text-slate-400">
        {data?.summary.metricCount} metrics · {data?.summary.workoutCount} workouts synced · Last {days} {days === 1 ? 'day' : 'days'}
      </div>
    </div>
  );
}

interface RecentWorkoutsProps {
  workouts: DataResponse['workouts'];
}

function RecentWorkouts({ workouts }: RecentWorkoutsProps) {
  if (workouts.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-amber-500" />
        <h3 className="font-semibold text-slate-800">Workout Details</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs uppercase tracking-wide border-b border-slate-100">
              <th className="pb-2 pr-4">Date</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Duration</th>
              <th className="pb-2 pr-4">Distance</th>
              <th className="pb-2 pr-4">Elevation</th>
              <th className="pb-2 pr-4">Calories</th>
              <th className="pb-2">Avg HR</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {[...workouts].reverse().slice(0, 10).map((w) => (
              <tr key={w.date + w.workoutType + w.duration} className="border-b border-slate-50 last:border-0">
                <td className="py-2 pr-4 whitespace-nowrap">{format(parseISO(w.date), 'MMM d')}</td>
                <td className="py-2 pr-4 font-medium">{w.workoutType}</td>
                <td className="py-2 pr-4">{w.duration} min</td>
                <td className="py-2 pr-4">{w.distance ? `${w.distance.toFixed(2)} km` : '—'}</td>
                <td className="py-2 pr-4">{w.elevationGain ? `${Math.round(w.elevationGain)} m` : '—'}</td>
                <td className="py-2 pr-4">{w.activeEnergy ? `${Math.round(w.activeEnergy)} kcal` : '—'}</td>
                <td className="py-2">{w.avgHeartRate ? `${Math.round(w.avgHeartRate)} bpm` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
