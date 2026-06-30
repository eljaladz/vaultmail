'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Loader2, Plus, RefreshCw, RotateCcw, Trash2, X, TriangleAlert } from 'lucide-react';
import { apiFetch } from '@/lib/client/api-fetch';
import type {
  CloudflareOnboardingListResponse,
  OnboardingRecord,
  OnboardingStep,
} from '@/components/admin/types';

const STEP_LABELS: Record<OnboardingStep, string> = {
  pending_ns: 'Pending NS',
  active: 'Active',
  email_routing_enabled: 'Email Routing On',
  catch_all_configured: 'Catch-all Set',
  added_to_app: 'Added to App',
  failed_retryable: 'Retryable Error',
  failed_terminal: 'Failed',
};

const STEP_COLORS: Record<OnboardingStep, string> = {
  pending_ns: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  active: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  email_routing_enabled: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  catch_all_configured: 'bg-green-500/20 text-green-300 border-green-500/30',
  added_to_app: 'bg-green-500/20 text-green-300 border-green-500/30',
  failed_retryable: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  failed_terminal: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const POLL_INTERVAL_MS = 30_000;

interface CloudflareDomainsSectionProps {
  onDomainAdded?: () => void;
}

export function CloudflareDomainsSection({ onDomainAdded }: CloudflareDomainsSectionProps) {
  const [records, setRecords] = useState<OnboardingRecord[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncingDomain, setSyncingDomain] = useState<string | null>(null);
  const [actionDomain, setActionDomain] = useState<string | null>(null);
  const [confirmFullRemove, setConfirmFullRemove] = useState<string | null>(null);
  const [fullRemoveInput, setFullRemoveInput] = useState('');
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    try {
      const response = await apiFetch('/api/admin/domains/cloudflare');
      if (!response.ok) {
        throw new Error('Failed to load onboarding records');
      }
      const data = (await response.json()) as CloudflareOnboardingListResponse;
      setRecords(data.records);
      setConfigured(data.configured);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await apiFetch('/api/admin/domains/cloudflare');
        if (!response.ok) {
          throw new Error('Failed to load onboarding records');
        }
        const data = (await response.json()) as CloudflareOnboardingListResponse;
        if (!cancelled) {
          setRecords(data.records);
          setConfigured(data.configured);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const hasPending = records.some(
      (r) => r.step === 'pending_ns' || r.step === 'failed_retryable'
    );
    if (!hasPending) return;
    const interval = setInterval(fetchRecords, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [records, fetchRecords]);

  const handleAdd = async () => {
    const domain = newDomain.toLowerCase().trim();
    if (!domain) return;
    setAdding(true);
    try {
      const response = await apiFetch('/api/admin/domains/cloudflare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start onboarding');
      }
      setNewDomain('');
      await fetchRecords();
      toast.success(`Onboarding started for ${domain}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(message);
    } finally {
      setAdding(false);
    }
  };

  const handleSync = async (domain: string) => {
    setSyncingDomain(domain);
    try {
      const response = await apiFetch(
        `/api/admin/domains/cloudflare/${encodeURIComponent(domain)}/sync`,
        { method: 'POST' }
      );
      const data = await response.json();
      if (!response.ok && response.status !== 202) {
        throw new Error(data.error || 'Sync failed');
      }
      await fetchRecords();
      const record = data.record as OnboardingRecord;
      if (record.step === 'added_to_app') {
        toast.success(`${domain} is now active and added to the app`);
        onDomainAdded?.();
      } else if (record.step === 'failed_terminal') {
        toast.error(`${domain}: ${record.error?.message ?? 'terminal error'}`);
      } else {
        toast.success(`${domain}: ${STEP_LABELS[record.step]}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(message);
    } finally {
      setSyncingDomain(null);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleRemoveFromApp = async (domain: string) => {
    setActionDomain(domain);
    try {
      const res = await apiFetch(
        `/api/admin/domains/cloudflare/${encodeURIComponent(domain)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove');
      toast.success(`${domain} removed from app (CF zone preserved)`);
      await fetchRecords();
      onDomainAdded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionDomain(null);
    }
  };

  const handleRestore = async (domain: string) => {
    setActionDomain(domain);
    try {
      const res = await apiFetch(
        `/api/admin/domains/cloudflare/${encodeURIComponent(domain)}?action=restore`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore');
      toast.success(`${domain} restored to app`);
      await fetchRecords();
      onDomainAdded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionDomain(null);
    }
  };

  const handleFullRemove = async (domain: string) => {
    setActionDomain(domain);
    try {
      const res = await apiFetch(
        `/api/admin/domains/cloudflare/${encodeURIComponent(domain)}?action=full`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fully remove');
      toast.success(`${domain} fully removed from Cloudflare`);
      setConfirmFullRemove(null);
      setFullRemoveInput('');
      await fetchRecords();
      onDomainAdded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionDomain(null);
    }
  };

  const handleCancelOnboarding = async (domain: string, confirmZone: boolean) => {
    setActionDomain(domain);
    try {
      const params = confirmZone ? '&confirmZone=true' : '';
      const res = await apiFetch(
        `/api/admin/domains/cloudflare/${encodeURIComponent(domain)}?action=cancel${params}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      toast.success(`Onboarding cancelled for ${domain}`);
      setConfirmCancel(null);
      await fetchRecords();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionDomain(null);
    }
  };

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-white">
            Domain Management
          </h2>
          <p className="text-xs md:text-sm text-white/60">
            Add domains via Cloudflare API. Nameservers, Email Routing, and catch-all rules are configured automatically. Remove keeps the CF zone; Full Remove deletes it permanently.
          </p>
        </div>
      </div>

      {!configured ? (
        <div className="mt-4 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
          <p className="text-xs md:text-sm text-orange-300">
            Cloudflare onboarding is not configured. Set <code className="font-mono">CLOUDFLARE_ADMIN_API_TOKEN</code> and <code className="font-mono">CLOUDFLARE_ACCOUNT_ID</code> in Netlify env to enable.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
              Add Domain via Cloudflare
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="example.com"
                className="h-9 flex-1 bg-black/30 text-white placeholder:text-white/40"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !adding && newDomain.trim()) {
                    handleAdd();
                  }
                }}
              />
              <Button
                type="button"
                onClick={handleAdd}
                disabled={adding || !newDomain.trim()}
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {loading ? (
              <p className="text-xs md:text-sm text-white/50">Loading...</p>
            ) : records.length === 0 ? (
              <p className="text-xs md:text-sm text-white/50">
                No Cloudflare onboarding records yet.
              </p>
            ) : (
              records.map((record) => (
                <div
                  key={record.domain}
                  className="rounded-lg border border-white/10 bg-black/30 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-white">
                        {record.domain}
                      </span>
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STEP_COLORS[record.step]}`}
                      >
                        {STEP_LABELS[record.step]}
                      </span>
                      {record.source === 'user-request' && (
                        <span className="rounded border border-purple-500/30 bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-300">
                          User
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {(record.step === 'pending_ns' || record.step === 'failed_retryable' || record.step === 'active' || record.step === 'email_routing_enabled' || record.step === 'catch_all_configured') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSync(record.domain)}
                          disabled={syncingDomain === record.domain}
                          className="h-7 text-white/60 hover:text-white hover:bg-white/10"
                        >
                          {syncingDomain === record.domain ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                              Sync
                            </>
                          )}
                        </Button>
                      )}

                      {record.step === 'added_to_app' && !record.removedFromAppAt && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFromApp(record.domain)}
                          disabled={actionDomain === record.domain}
                          className="h-7 text-orange-300 hover:text-orange-200 hover:bg-orange-500/10"
                        >
                          {actionDomain === record.domain ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <X className="mr-1 h-3.5 w-3.5" />
                              Remove
                            </>
                          )}
                        </Button>
                      )}

                      {record.step === 'added_to_app' && record.removedFromAppAt && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(record.domain)}
                          disabled={actionDomain === record.domain}
                          className="h-7 text-green-300 hover:text-green-200 hover:bg-green-500/10"
                        >
                          {actionDomain === record.domain ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              Restore
                            </>
                          )}
                        </Button>
                      )}

                      {record.step === 'added_to_app' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmFullRemove(record.domain)}
                          disabled={actionDomain === record.domain}
                          className="h-7 text-red-300 hover:text-red-200 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      {(record.step === 'pending_ns' || record.step === 'failed_retryable' || record.step === 'failed_terminal' || record.step === 'active' || record.step === 'email_routing_enabled' || record.step === 'catch_all_configured') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmCancel(record.domain)}
                          disabled={actionDomain === record.domain}
                          className="h-7 text-red-300 hover:text-red-200 hover:bg-red-500/10"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {record.step === 'pending_ns' && (
                    (!record.nameservers || record.nameservers.length === 0) ? (
                      <div className="mt-2">
                        <p className="text-[10px] text-white/40">
                          No nameservers returned by Cloudflare yet. Retry sync or check the Cloudflare zone status.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-[10px] uppercase tracking-widest text-white/40">
                          Assigned Nameservers
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {record.nameservers.map((ns) => (
                            <button
                              key={ns}
                              type="button"
                              onClick={() => handleCopy(ns)}
                              className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white/70 hover:bg-white/10"
                            >
                              {ns}
                              <Copy className="h-3 w-3 text-white/40" />
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-[10px] text-white/40">
                          Set these at your registrar. DNS propagation can take hours.
                        </p>
                      </div>
                    )
                  )}

                  {record.error && (
                    <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 p-2">
                      <p className="text-[11px] text-red-300">
                        {record.error.message}
                        {record.error.retryable && ' (retryable)'}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {confirmFullRemove && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
          onClick={() => { setConfirmFullRemove(null); setFullRemoveInput(''); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl p-6 text-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <TriangleAlert className="h-5 w-5 text-red-400" />
              <h3 className="text-base font-semibold text-white">Fully Remove from Cloudflare</h3>
            </div>
            <p className="mt-2 text-xs text-white/70">
              This will <span className="font-bold text-red-300">permanently delete</span> the Cloudflare zone for <span className="font-mono font-bold">{confirmFullRemove}</span>, including all DNS records and Email Routing configuration. This cannot be undone.
            </p>
            <p className="mt-3 text-xs text-white/50">
              Type the domain name to confirm:
            </p>
            <Input
              value={fullRemoveInput}
              onChange={(e) => setFullRemoveInput(e.target.value)}
              placeholder={confirmFullRemove}
              className="mt-1 h-9 bg-black/30 border-red-500/30"
            />
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => { setConfirmFullRemove(null); setFullRemoveInput(''); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-red-500 text-white hover:bg-red-600"
                disabled={fullRemoveInput !== confirmFullRemove || actionDomain === confirmFullRemove}
                onClick={() => handleFullRemove(confirmFullRemove)}
              >
                {actionDomain === confirmFullRemove ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Forever'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmCancel && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmCancel(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl p-6 text-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-white">Cancel Onboarding</h3>
            <p className="mt-2 text-xs text-white/70">
              Cancel onboarding for <span className="font-mono font-bold">{confirmCancel}</span>?
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => setConfirmCancel(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-red-500 text-white hover:bg-red-600"
                disabled={actionDomain === confirmCancel}
                onClick={() => handleCancelOnboarding(confirmCancel, false)}
              >
                {actionDomain === confirmCancel ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel Onboarding'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
