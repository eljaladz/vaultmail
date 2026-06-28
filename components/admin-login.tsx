'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/client/api-fetch';
import { TurnstileWidget } from '@/components/turnstile-widget';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function AdminLogin() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileReset, setTurnstileReset] = useState(0);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password.trim()) {
      toast.error('Enter admin password.');
      return;
    }
    setLoading(true);
    try {
      const form = event.currentTarget;
      const turnstileToken =
        form.querySelector<HTMLInputElement>(
          'input[name="cf-turnstile-response"]'
        )?.value || '';
      const response = await apiFetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, turnstileToken })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || 'Unauthorized');
      }
      toast.success('Login successful.');
      window.location.reload();
    } catch (error) {
      setTurnstileReset((prev) => prev + 1);
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : 'Incorrect password or unauthorized.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/50 relative overflow-hidden flex flex-col text-white">
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--accent, #3b82f6)', opacity: 0.1 }} />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--accent, #8b5cf6)', opacity: 0.1 }} />
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-16 relative z-10">
        <div className="glass-card w-full rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--accent, #3b82f6)', opacity: 0.1, color: 'var(--accent, #93c5fd)' }}>
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold">Admin Login</h1>
            <p className="text-sm text-white/70">
              Enter admin password to access the dashboard.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Admin password"
              className="bg-black/30 text-white placeholder:text-white/40"
            />
            {TURNSTILE_SITE_KEY && (
              <div className="flex justify-center">
                <TurnstileWidget key={turnstileReset} siteKey={TURNSTILE_SITE_KEY} />
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Login'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
