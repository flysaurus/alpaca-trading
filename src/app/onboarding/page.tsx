'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/auth';
import WelcomeScreen from '@/components/onboarding/WelcomeScreen';
import AlpacaSetupScreen from '@/components/onboarding/AlpacaSetupScreen';
import SecuritySetupScreen from '@/components/onboarding/SecuritySetupScreen';
import CompleteScreen from '@/components/onboarding/CompleteScreen';

type OnboardingStep = 'welcome' | 'alpaca' | 'security' | 'complete';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [alpacaData, setAlpacaData] = useState({ apiKey: '', secretKey: '', paper: true });

  const steps: OnboardingStep[] = ['welcome', 'alpaca', 'security', 'complete'];

  const handleAlpacaSubmit = async (apiKey: string, secretKey: string, paper: boolean) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/validate-alpaca-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, secretKey, paper }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Invalid Alpaca credentials');
      }

      setAlpacaData({ apiKey, secretKey, paper });
      setStep('security');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSecuritySubmit = async (masterPassword: string) => {
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Store encrypted keys
      const response = await fetch('/api/setup-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          apiKey: alpacaData.apiKey,
          secretKey: alpacaData.secretKey,
          masterPassword,
          paper: alpacaData.paper,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save keys');
      }

      // Create session immediately
      const authResponse = await fetch('/api/authenticate-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          masterPassword,
        }),
      });

      if (!authResponse.ok) {
        throw new Error('Failed to create session');
      }

      // Clear sensitive data from memory
      setAlpacaData({ apiKey: '', secretKey: '', paper: true });
      setStep('complete');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex gap-2 mb-4">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`flex-1 h-1 rounded-full transition ${
                  steps.indexOf(s) <= steps.indexOf(step)
                    ? 'bg-teal-500'
                    : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step indicator */}
        <p className="text-center text-xs text-gray-500 mb-6">
          Step {steps.indexOf(step) + 1} of {steps.length}
        </p>

        {/* Screens */}
        {step === 'welcome' && (
          <WelcomeScreen onNext={() => setStep('alpaca')} />
        )}

        {step === 'alpaca' && (
          <AlpacaSetupScreen
            onSubmit={handleAlpacaSubmit}
            loading={loading}
            error={error}
          />
        )}

        {step === 'security' && (
          <SecuritySetupScreen
            onSubmit={handleSecuritySubmit}
            loading={loading}
            error={error}
          />
        )}

        {step === 'complete' && (
          <CompleteScreen onNext={handleComplete} />
        )}
      </div>
    </div>
  );
}
