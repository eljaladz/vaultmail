'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, Bell, Trash2, Copy } from 'lucide-react';
import { apiFetch } from '@/lib/client/api-fetch';

type ApiKeyRequest = {
  id: string;
  label: string;
  purpose: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  adminNote?: string;
  keyHash?: string;
};

export function ApiKeyRequestsSection() {
  const [requests, setRequests] = useState<ApiKeyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  
  // For showing the newly approved API key
  const [newKey, setNewKey] = useState<{ id: string; key: string } | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/api-key-requests?status=pending');
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
        const res = await apiFetch('/api/admin/api-key-requests?status=pending');
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

  const handleApprove = async (req: ApiKeyRequest) => {
    setActionId(req.id);
    try {
      const res = await apiFetch('/api/admin/api-key-requests/' + req.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve');
      
      if (data.apiKey) {
        setNewKey({ id: req.id, key: data.apiKey });
        toast.success('API key approved and generated for "' + req.label + '"');
      } else {
         toast.success(data.message || 'API key for "' + req.label + '" approved');
      }
      
      await fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (req: ApiKeyRequest) => {
    setActionId(req.id);
    try {
      const res = await apiFetch('/api/admin/api-key-requests/' + req.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      if (!res.ok) throw new Error('Failed to reject');
      toast.success('Request for "' + req.label + '" rejected');
      await fetchRequests();
    } catch {
      toast.error('Failed to reject');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (req: ApiKeyRequest) => {
    setActionId(req.id);
    try {
      const res = await apiFetch('/api/admin/api-key-requests/' + req.id, {
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

  const handleCopyNewKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.key);
      toast.success('API key copied to clipboard');
      setNewKey(null);
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Render the modal inside the component normally (as requested, reusing styling concept)
  // Since we need to show the key exactly once, a simple overlay works best here
  const NewKeyModal = newKey && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl">
        <h3 className="mb-2 text-lg font-semibold text-white">API Key Generated</h3>
        <p className="mb-4 text-sm text-white/60">
          Copy this key now. You won&apos;t be able to see it again.
        </p>
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <code className="flex-1 break-all text-sm text-green-400">{newKey.key}</code>
          <Button
            onClick={handleCopyNewKey}
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 text-white hover:bg-white/10"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => setNewKey(null)} variant="ghost" className="text-white hover:bg-white/10">
            Close
          </Button>
        </div>
      </div>
    </div>
  );

  if (loading && requests.length === 0) return null;

  if (requests.length === 0) return null;

  return (
    <>
      {NewKeyModal}
      <div className="w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="h-4 w-4" style={{ color: 'var(--accent, #fbbf24)' }} />
          <h2 className="text-base md:text-lg font-semibold text-white">
            API Key Requests
          </h2>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
            {requests.length}
          </span>
        </div>

        <div className="space-y-2">
          {requests.map((req) => (
            <div
              key={req.id}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/30 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-white">
                    {req.label}
                  </span>
                  <span className="text-[10px] text-white/40">
                    {new Date(req.requestedAt).toLocaleDateString()}
                  </span>
                </div>
                {req.purpose && (
                  <p className="text-xs text-white/60 line-clamp-1 max-w-[200px]" title={req.purpose}>
                    {req.purpose}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 self-end sm:self-auto">
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
    </>
  );
}
