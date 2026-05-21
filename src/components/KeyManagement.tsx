'use client';

import { useState } from 'react';
import { Key, Lock, Eye, EyeOff, Check, X, Loader2 } from 'lucide-react';
import { fetchApi } from '@/lib/api-helper';

interface KeyManagementProps {
  className?: string;
}

export default function KeyManagement({ className = '' }: KeyManagementProps) {
  // ── Keys State ──
  const [showKeysSection, setShowKeysSection] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [keysPassword, setKeysPassword] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showKeysPassword, setShowKeysPassword] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysError, setKeysError] = useState('');
  const [keysSuccess, setKeysSuccess] = useState('');

  // ── Password State ──
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const strip = (s: string) => s.replace(/\s+/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '');

  // ── Update Keys ──
  const handleUpdateKeys = async () => {
    setKeysError('');
    setKeysSuccess('');
    setKeysLoading(true);

    const cleanApiKey = strip(apiKey);
    const cleanSecretKey = strip(secretKey);

    if (!cleanApiKey || !cleanSecretKey || !keysPassword) {
      setKeysError('All fields are required');
      setKeysLoading(false);
      return;
    }

    try {
      const res = await fetchApi('/api/update-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: cleanApiKey,
          secretKey: cleanSecretKey,
          masterPassword: keysPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update keys');
      }

      setKeysSuccess('API keys updated successfully');
      setApiKey('');
      setSecretKey('');
      setKeysPassword('');
    } catch (err: any) {
      setKeysError(err.message);
    } finally {
      setKeysLoading(false);
    }
  };

  // ── Change Password ──
  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordLoading(true);

    if (!currentPassword || !newPassword) {
      setPasswordError('All fields are required');
      setPasswordLoading(false);
      return;
    }

    if (newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters');
      setPasswordLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      setPasswordLoading(false);
      return;
    }

    try {
      const res = await fetchApi('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const ToggleButton = ({ show, onClick }: { show: boolean; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
      tabIndex={-1}
    >
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ── Rotate API Keys ── */}
      <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] p-4">
        <button
          onClick={() => setShowKeysSection(!showKeysSection)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">Rotate API Keys</span>
          </div>
          <span className="text-[var(--text-muted)] text-xs">
            {showKeysSection ? '▲' : '▼'}
          </span>
        </button>

        {showKeysSection && (
          <div className="mt-4 space-y-3 border-t border-[#1e232b] pt-4">
            <p className="text-[10px] text-[var(--text-muted)]">
              Enter new Alpaca paper trading keys and confirm with your master password
            </p>

            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="New API Key (PK...)"
                className="w-full px-3 py-2 pr-10 bg-[#1e293b] border border-[#334155] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <ToggleButton show={showApiKey} onClick={() => setShowApiKey(!showApiKey)} />
            </div>

            <div className="relative">
              <input
                type={showSecretKey ? 'text' : 'password'}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="New Secret Key"
                className="w-full px-3 py-2 pr-10 bg-[#1e293b] border border-[#334155] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <ToggleButton show={showSecretKey} onClick={() => setShowSecretKey(!showSecretKey)} />
            </div>

            <div className="relative">
              <input
                type={showKeysPassword ? 'text' : 'password'}
                value={keysPassword}
                onChange={(e) => setKeysPassword(e.target.value)}
                placeholder="Master password (to confirm)"
                className="w-full px-3 py-2 pr-10 bg-[#1e293b] border border-[#334155] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <ToggleButton show={showKeysPassword} onClick={() => setShowKeysPassword(!showKeysPassword)} />
            </div>

            {keysError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <X className="w-3 h-3" /> {keysError}
              </p>
            )}
            {keysSuccess && (
              <p className="text-xs text-green-400 flex items-center gap-1">
                <Check className="w-3 h-3" /> {keysSuccess}
              </p>
            )}

            <button
              onClick={handleUpdateKeys}
              disabled={keysLoading}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {keysLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              {keysLoading ? 'Updating...' : 'Update Keys'}
            </button>
          </div>
        )}
      </div>

      {/* ── Change Master Password ── */}
      <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] p-4">
        <button
          onClick={() => setShowPasswordSection(!showPasswordSection)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">Change Master Password</span>
          </div>
          <span className="text-[var(--text-muted)] text-xs">
            {showPasswordSection ? '▲' : '▼'}
          </span>
        </button>

        {showPasswordSection && (
          <div className="mt-4 space-y-3 border-t border-[#1e232b] pt-4">
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full px-3 py-2 pr-10 bg-[#1e293b] border border-[#334155] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <ToggleButton show={showCurrentPassword} onClick={() => setShowCurrentPassword(!showCurrentPassword)} />
            </div>

            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 12 chars)"
                className="w-full px-3 py-2 pr-10 bg-[#1e293b] border border-[#334155] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <ToggleButton show={showNewPassword} onClick={() => setShowNewPassword(!showNewPassword)} />
            </div>

            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-3 py-2 pr-10 bg-[#1e293b] border border-[#334155] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <ToggleButton show={showConfirmPassword} onClick={() => setShowConfirmPassword(!showConfirmPassword)} />
            </div>

            {passwordError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <X className="w-3 h-3" /> {passwordError}
              </p>
            )}
            {passwordSuccess && (
              <p className="text-xs text-green-400 flex items-center gap-1">
                <Check className="w-3 h-3" /> {passwordSuccess}
              </p>
            )}

            <button
              onClick={handleChangePassword}
              disabled={passwordLoading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {passwordLoading ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
