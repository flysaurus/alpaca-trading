'use client';

import { useRouter } from 'next/navigation';
import { RadioTower, Bell } from 'lucide-react';
import { useDashboard } from '@/lib/dashboard-context';

export default function TopBar() {
  const { account, marketOpen } = useDashboard();
  const router = useRouter();
  const portfolioValue = account?.account?.portfolioValue || 0;

  const fmt = (n: number) =>
    '$' + (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n.toFixed(0));

  return (
    <header className="sticky top-0 z-40 bg-[#0d1117]/90 backdrop-blur-xl border-b border-[#1f2937]">
      <div className="flex items-center justify-between h-12 px-4">
        {/* Logo */}
        <button onClick={() => router.push('/')} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#f59e0b] flex items-center justify-center">
            <RadioTower className="w-4 h-4 text-black" />
          </div>
          <span className="text-sm font-bold text-[#f9fafb]">Alpaca</span>
        </button>

        {/* Portfolio Value */}
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-[#6b7280] uppercase tracking-wider">Portfolio</span>
          <span className="text-sm font-bold font-mono text-[#f9fafb]">{fmt(portfolioValue)}</span>
        </div>

        {/* Market Status + Notifications */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${marketOpen ? 'bg-[#34d399] animate-pulse' : 'bg-[#f43f5e]'}`} />
            <span className="text-[10px] text-[#6b7280] hidden sm:inline">
              {marketOpen ? 'Open' : 'Closed'}
            </span>
          </div>
          <button
            onClick={() => router.push('/account?notifications=true')}
            className="relative p-1.5 rounded-lg hover:bg-[#1f2937] transition"
          >
            <Bell className="w-4 h-4 text-[#6b7280]" />
          </button>
        </div>
      </div>
    </header>
  );
}
