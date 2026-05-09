'use client';

import { useDashboard } from '@/lib/dashboard-context';
import SettingsPanel from '@/components/SettingsPanel';

export default function AccountPage() {
  const { account } = useDashboard();

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="px-1">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Account</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Settings, risk controls & connection status
        </p>
      </div>

      <SettingsPanel account={account as any} />
    </div>
  );
}
