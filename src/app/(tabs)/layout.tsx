'use client';

import { DashboardProvider } from '@/lib/dashboard-context';
import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';
import PageWrapper from '@/components/layout/PageWrapper';

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <div className="flex flex-col min-h-screen bg-[var(--app-bg)]">
        <TopBar />
        <PageWrapper>{children}</PageWrapper>
        <BottomNav />
      </div>
    </DashboardProvider>
  );
}
