'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X, Cloud, Server, CircleCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { apiFetch } from '@/lib/client/api-fetch';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface RequestDomainModalProps {
  onClose: () => void;
  nameservers?: string[];
}

export function RequestDomainModal({ onClose, nameservers }: RequestDomainModalProps) {
  const [domain, setDomain] = useState('');
  const [requestType, setRequestType] = useState<'add' | 'remove'>('add');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ nameservers: string[] | null; alreadyExists: boolean } | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error('Please complete the bot verification.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/domain-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.trim(),
          type: requestType,
          turnstileToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');
      setResult({
        nameservers: data.nameservers || nameservers || null,
        alreadyExists: data.alreadyExists || false,
      });
      setDomain('');
      setTurnstileToken('');
      toast.success(data.alreadyExists ? 'Request already exists' : 'Request submitted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (typeof document === 'undefined') return null;

  const displayNameservers = result?.nameservers || nameservers;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl p-4 md:p-6 text-white shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base md:text-lg font-semibold">Request a New Domain</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-white/70">
              {result.alreadyExists
                ? 'A request for this domain already exists. The admin will review it soon.'
                : 'Your request has been submitted! The admin will review it and start Cloudflare onboarding.'}
            </p>

            {displayNameservers && displayNameservers.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
                  Cloudflare Nameservers
                </p>
                <p className="text-[11px] text-white/50 mb-2">
                  Set these at your registrar once the admin approves your domain.
                </p>
                <div className="flex flex-col gap-1">
                  {displayNameservers.map((ns) => (
                    <code key={ns} className="rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white/70">
                      {ns}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={onClose} variant="secondary" size="sm" className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <>
            <p className="text-xs md:text-sm text-white/70 mb-4">
              Vaultmail domains must be connected through Cloudflare Email Routing. Submit a domain request and the admin will set it up.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                  Domain
                </label>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                  Request Type
                </label>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRequestType('add')}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-xs ${
                      requestType === 'add'
                        ? 'border-green-500/30 bg-green-500/10 text-green-300'
                        : 'border-white/10 bg-black/30 text-white/60'
                    }`}
                  >
                    Add Domain
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestType('remove')}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-xs ${
                      requestType === 'remove'
                        ? 'border-orange-500/30 bg-orange-500/10 text-orange-300'
                        : 'border-white/10 bg-black/30 text-white/60'
                    }`}
                  >
                    Remove Domain
                  </button>
                </div>
              </div>

              {TURNSTILE_SITE_KEY && (
                <div className="flex justify-center">
                  <TurnstileWidget
                    siteKey={TURNSTILE_SITE_KEY}
                    action="domain-request"
                    onVerify={(token) => setTurnstileToken(token)}
                    onExpire={() => setTurnstileToken('')}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !domain.trim()}
                className="w-full rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Submit Request'}
              </button>
            </form>

            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">How it works</p>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Cloud className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/50">Submit the domain name you want to use.</p>
                </div>
                <div className="flex gap-2">
                  <Server className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/50">Admin starts Cloudflare onboarding — nameservers assigned.</p>
                </div>
                {displayNameservers && displayNameservers.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {displayNameservers.map((ns) => (
                      <code key={ns} className="rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] text-white/60">
                        {ns}
                      </code>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <CircleCheck className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/50">Once NS active, domain appears in the dropdown automatically.</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-yellow-300/70">
                Don&apos;t add MX records manually — Cloudflare handles it.
              </p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

