'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X, Key, Server, CircleCheck, Loader2 } from 'lucide-react';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { apiFetch } from '@/lib/client/api-fetch';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const STORAGE_KEY = 'apiKeyRequestTokens';

type StoredRequest = {
  token: string;
  label: string;
  requestedAt: string;
  lastKnownStatus: string;
};

type StatusResult = {
  status: 'pending' | 'approved' | 'rejected' | 'failed' | 'expired';
  label: string;
  requestedAt: string;
  updatedAt?: string;
  message?: string;
};

interface RequestApiKeyModalProps {
  onClose: () => void;
  t?: Record<string, string>;
}

const readStoredRequests = (): StoredRequest[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is StoredRequest =>
        item &&
        typeof item.token === 'string' &&
        typeof item.label === 'string' &&
        typeof item.requestedAt === 'string' &&
        typeof item.lastKnownStatus === 'string'
      )
      .slice(0, 10);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
};

const saveStoredRequests = (items: StoredRequest[]) => {
  const deduped = Array.from(new Map(items.map((item) => [item.token, item])).values())
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .slice(0, 10);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  return deduped;
};

export function RequestApiKeyModal({ onClose, t }: RequestApiKeyModalProps) {
  const [tab, setTab] = useState<'request' | 'status'>('request');
  const [label, setLabel] = useState('');
  const [purpose, setPurpose] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [storedRequests, setStoredRequests] = useState<StoredRequest[]>(() => readStoredRequests());
  const [tokenInput, setTokenInput] = useState(() => readStoredRequests()[0]?.token ?? '');
  const [statusResult, setStatusResult] = useState<StatusResult | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const selectedStored = useMemo(
    () => storedRequests.find((item) => item.token === tokenInput),
    [storedRequests, tokenInput]
  );

  const rememberRequest = useCallback((item: StoredRequest) => {
    const next = saveStoredRequests([item, ...storedRequests]);
    setStoredRequests(next);
  }, [storedRequests]);

  const removeStoredToken = useCallback((token: string) => {
    const next = saveStoredRequests(storedRequests.filter((item) => item.token !== token));
    setStoredRequests(next);
    if (tokenInput === token) setTokenInput(next[0]?.token ?? '');
  }, [storedRequests, tokenInput]);

  const checkStatus = useCallback(async (token = tokenInput) => {
    const value = token.trim();
    if (!value) return;
    setChecking(true);
    try {
      const res = await apiFetch(`/api/api-key-requests/status?token=${encodeURIComponent(value)}`);
      if (res.status === 404) {
        removeStoredToken(value);
        setStatusResult(null);
        toast.error('Request not found. Removed from recent requests.');
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to check status');
      setStatusResult(data);
      if (selectedStored) {
        rememberRequest({ ...selectedStored, lastKnownStatus: data.status });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to check status');
    } finally {
      setChecking(false);
    }
  }, [removeStoredToken, rememberRequest, selectedStored, tokenInput]);

  useEffect(() => {
    if (!statusResult || statusResult.status !== 'pending') return;
    const timer = setInterval(() => {
      void checkStatus(tokenInput);
    }, 25_000);
    return () => clearInterval(timer);
  }, [statusResult, tokenInput, checkStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    if (label.length > 50) {
      toast.error('Label must be 50 characters or less');
      return;
    }
    if (purpose.length > 255) {
      toast.error('Purpose must be 255 characters or less');
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error('Please complete the bot verification.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/api-key-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), purpose: purpose.trim(), turnstileToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');
      const item: StoredRequest = {
        token: data.token,
        label: data.label,
        requestedAt: new Date().toISOString(),
        lastKnownStatus: data.status,
      };
      rememberRequest(item);
      setTokenInput(data.token);
      setStatusResult({
        status: data.status,
        label: data.label,
        requestedAt: item.requestedAt,
        message: data.message || 'Your request is waiting for review.',
      });
      setTab('status');
      setLabel('');
      setPurpose('');
      setTurnstileToken('');
      toast.success(data.autoApproved ? 'Request approved automatically' : 'Request submitted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Failed to copy');
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl p-4 md:p-6 text-white shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base md:text-lg font-semibold">{t?.apiKeyRequestTitle || 'API Key Requests'}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => setTab('request')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${tab === 'request' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
          >
            Request API Key
          </button>
          <button
            type="button"
            onClick={() => setTab('status')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${tab === 'status' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
          >
            {t?.apiKeyRequestCheckStatus || 'Check Status'}
          </button>
        </div>

        {tab === 'request' ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-xs md:text-sm text-white/70">
              Request an API key to programmatically access your mailboxes.
            </p>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                {t?.apiKeyRequestLabelLabel || 'Label'}
              </label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={50}
                required
                placeholder={t?.apiKeyRequestLabelPlaceholder || "e.g., Personal Server"}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                {t?.apiKeyRequestPurposeLabel || 'Purpose (Optional)'}
              </label>
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                maxLength={255}
                placeholder={t?.apiKeyRequestPurposePlaceholder || "What will you use this API key for?"}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            {TURNSTILE_SITE_KEY && (
              <div className="flex justify-center">
                <TurnstileWidget
                  siteKey={TURNSTILE_SITE_KEY}
                  action="api-key-request"
                  onVerify={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={submitting || !label.trim()}
              className="w-full rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : (t?.apiKeyRequestSubmit || 'Submit Request')}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            {storedRequests.length > 0 && (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                  {t?.apiKeyRequestRecentRequests || 'Recent requests'}
                </label>
                <select
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                >
                  {storedRequests.map((item) => (
                    <option key={item.token} value={item.token}>
                      {item.label} — {item.lastKnownStatus === 'pending' ? (t?.apiKeyRequestStatusPending || 'Pending') : 
                                      item.lastKnownStatus === 'approved' ? (t?.apiKeyRequestStatusApproved || 'Approved') : 
                                      item.lastKnownStatus === 'rejected' ? (t?.apiKeyRequestStatusRejected || 'Rejected') : 
                                      item.lastKnownStatus === 'expired' ? (t?.apiKeyRequestStatusExpired || 'Expired') : 
                                      item.lastKnownStatus}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                {t?.apiKeyRequestRequestId || 'Request ID'}
              </label>
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => checkStatus()}
                disabled={checking || !tokenInput.trim()}
                className="flex-1 rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
              >
                {checking ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : (t?.apiKeyRequestCheckStatus || 'Check Status')}
              </button>
              {storedRequests.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(STORAGE_KEY);
                    setStoredRequests([]);
                    setTokenInput('');
                    setStatusResult(null);
                  }}
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                >
                  {t?.apiKeyRequestClear || 'Clear'}
                </button>
              )}
            </div>

            {statusResult && (
              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-sm text-white">{statusResult.label}</span>
                  <span className="rounded border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-white/70">
                    {statusResult.status}
                  </span>
                </div>
                <p className="text-xs text-white/60">{statusResult.message}</p>
                <button
                  type="button"
                  onClick={() => copyText(tokenInput, 'Request ID')}
                  className="mt-3 text-[10px] text-white/40 hover:text-white/70"
                >
                  Copy request ID
                </button>
              </div>
            )}

            <div className="border-t border-white/10 pt-3">
              <div className="space-y-2">
                <div className="flex gap-2"><Key className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" /><p className="text-[11px] text-white/50">Submit your API key request.</p></div>
                <div className="flex gap-2"><Server className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-0.5" /><p className="text-[11px] text-white/50">Check this tab for approval status.</p></div>
                <div className="flex gap-2"><CircleCheck className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" /><p className="text-[11px] text-white/50">Once approved, check your email or admin instructions for the key.</p></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
