'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { DEFAULT_APP_NAME } from '@/lib/branding';
import { apiFetch } from '@/lib/client/api-fetch';

type HomepageLockProps = {
  appName?: string;
};

export function HomepageLock({ appName = DEFAULT_APP_NAME }: HomepageLockProps) {
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const wasAuthed = window.localStorage.getItem('vaultmail_homepage_authed');
    if (wasAuthed) {
      toast.error('Your session has expired, please relogin again.');
      window.localStorage.removeItem('vaultmail_homepage_authed');
    }
  }, []);


  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password.trim()) {
      toast.error('Password is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await apiFetch('/api/homepage-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || 'Invalid password');
      }
      window.localStorage.setItem('vaultmail_homepage_authed', '1');
      toast.success('Access granted. Reloading...');
      window.location.reload();
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : 'Invalid password or access denied.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-background/50 relative overflow-hidden flex flex-col items-center justify-center px-4">
      <div className="absolute top-0 left-1/4 w-64 h-64 md:w-96 md:h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--accent, #3b82f6)', opacity: 0.1 }} />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 md:w-96 md:h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--accent, #8b5cf6)', opacity: 0.1 }} />

      <div className="glass-card w-full max-w-md rounded-3xl border border-white/10 bg-black/40 backdrop-blur-lg p-6 md:p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="h-12 w-12 md:h-14 md:w-14 rounded-2xl flex items-center justify-center" style={{ backgroundImage: 'linear-gradient(to bottom right, var(--accent, #3b82f6), var(--accent, #8b5cf6))' }}>
            <Shield className="h-6 w-6 md:h-7 md:w-7 text-white" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-white">
            {appName} Private
          </h1>
          <p className="text-sm text-white/60">
            Homepage is locked. Contact the owner for access.
          </p>
          <p className="text-xs text-white/50">
            Enter the password if you have been granted access.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-white/60">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pl-10 bg-white/10 border-white/10 text-white placeholder:text-white/40"
                placeholder="Enter password"
              />
            </div>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Unlock'
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}
