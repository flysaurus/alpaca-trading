'use client';

import AIStrategiesTab from '@/components/AIStrategiesTab';
import { useDashboard } from '@/lib/dashboard-context';

export default function AIPage() {
  const { account } = useDashboard();
  return <AIStrategiesTab positions={account?.positions || []} />;
}
