'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, BarChart3, ShoppingCart, Brain, User, Bell } from 'lucide-react';

const tabs = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/markets', icon: BarChart3, label: 'Markets' },
  { path: '/trade', icon: ShoppingCart, label: 'Trade' },
  { path: '/ai', icon: Brain, label: 'AI' },
  { path: '/account', icon: User, label: 'Account' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('alpaca-trading-notifications');
      if (stored) setCount(JSON.parse(stored).unread || 0);
    } catch { /* ignore */ }
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d1117]/95 backdrop-blur-xl border-t border-[#1f2937]">
      <div className="flex justify-around items-center h-14 pb-safe">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = pathname === t.path;
          return (
            <button
              key={t.path}
              onClick={() => router.push(t.path)}
              className={`flex flex-col items-center justify-center gap-0.5 w-16 h-full transition ${
                active ? 'text-[#f59e0b]' : 'text-[#6b7280]'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.5} />
              <span className="text-[9px] font-semibold">{t.label}</span>
              {t.path === '/account' && count > 0 && (
                <span className="absolute top-1 right-2 w-4 h-4 bg-[#f59e0b] text-black text-[8px] font-bold rounded-full flex items-center justify-center">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
