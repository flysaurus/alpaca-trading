'use client';

import { useDashboard } from '@/lib/dashboard-context';
import EnhancedPositions from '@/components/EnhancedPositions';
import SettingsPanel from '@/components/SettingsPanel';

export default function AccountPage() {
  const { account, refreshAll } = useDashboard();
  const positions = account?.positions || [];
  const cash = account?.account?.cash;
  const portfolioValue = account?.account?.portfolioValue;

  return (
    <div className="space-y-3">
      <EnhancedPositions positions={positions} cash={cash} portfolioValue={portfolioValue} onRefresh={refreshAll} />
      <SettingsPanel account={account as any} />
    </div>
  );
}
