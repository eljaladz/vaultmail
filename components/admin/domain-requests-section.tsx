'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, Bell, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/client/api-fetch';

type DomainRequest = {
  id: string;
  domain: string;
  type: 'add' | 'remove';
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  onboardingStatus?: 'not-started' | 'started' | 'failed';
  onboardingError?: string;
  adminNote?: string;
};

interface DomainRequestsSectionProps {
  onDomainAdded?: () => void;
}

export function DomainRequestsSection({ onDomainAdded }: DomainRequestsSectionProps) {
  const [requests, setRequests] = useState<DomainRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/domain-requests?status=pending');
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/admin/domain-requests?status=pending');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setRequests(data.requests || []);
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleApprove = async (req: DomainRequest) => {
    setActionId(req.id);
    try {
      const res = await apiFetch(`/api/admin/domain-requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve');
      toast.success(`${req.domain} approved — onboarding started`);
      await fetchRequests();
      onDomainAdded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (req: DomainRequest) => {
    setActionId(req.id);
    try {
      const res = await apiFetch(`/api/admin/domain-requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      if (!res.ok) throw new Error('Failed to reject');
      toast.success(`Request for ${req.domain} rejected`);
      await fetchRequests();
    } catch {
      toast.error('Failed to reject');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (req: DomainRequest) => {
    setActionId(req.id);
    try {
      const res = await apiFetch(`/api/admin/domain-requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete' }),
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Request deleted');
      await fetchRequests();
    } catch {
      toast.error('Failed to delete');
    } finally {
      setActionId(null);
    }
  };

  if (loading && requests.length === 0) return null;

  if (requests.length === 0) return null;

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4" style={{ color: 'var(--accent, #fbbf24)' }} />
        <h2 className="text-base md:text-lg font-semibold text-white">
          Domain Requests
        </h2>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
          {requests.length}
        </span>
      </div>

      <div className="space-y-2">
        {requests.map((req) => (
          <div
            key={req.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                  req.type === 'add'
                    ? 'border-green-500/30 bg-green-500/10 text-green-300'
                    : 'border-orange-500/30 bg-orange-500/10 text-orange-300'
                }`}
              >
                {req.type}
              </span>
              <span className="font-mono text-sm text-white">{req.domain}</span>
              <span className="text-[10px] text-white/40">
                {new Date(req.requestedAt).toLocaleDateString()}
              </span>
              {req.onboardingStatus === 'failed' && (
                <span className="text-[10px] text-red-300">
                  Onboarding failed: {req.onboardingError}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {req.status === 'pending' && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleApprove(req)}
                    disabled={actionId === req.id}
                    className="h-7 text-green-300 hover:text-green-200 hover:bg-green-500/10"
                  >
                    {actionId === req.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Approve
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReject(req)}
                    disabled={actionId === req.id}
                    className="h-7 text-orange-300 hover:text-orange-200 hover:bg-orange-500/10"
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Reject
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(req)}
                disabled={actionId === req.id}
                className="h-7 text-red-300 hover:text-red-200 hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
