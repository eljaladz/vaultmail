'use client';

import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Loader2, Plus, Trash2 } from 'lucide-react';

interface DomainsSectionProps {
  availableDomains: string[];
  newDomain: string;
  setNewDomain: (v: string) => void;
  onAdd: () => void;
  onRemove: (domain: string) => void;
  onCopy: (domain: string) => void;
  saving: boolean;
  domainToDelete: string | null;
  confirmDelete: () => void;
  cancelDelete: () => void;
}

export function DomainsSection({
  availableDomains,
  newDomain,
  setNewDomain,
  onAdd,
  onRemove,
  onCopy,
  saving,
  domainToDelete,
  confirmDelete,
  cancelDelete
}: DomainsSectionProps) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-white">
            Domain Management
          </h2>
          <p className="text-xs md:text-sm text-white/60">
            Add domains available in the app.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
          Add Domain
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            value={newDomain}
            onChange={(event) => setNewDomain(event.target.value)}
            placeholder="example.com"
            className="h-9 flex-1 bg-black/30 text-white placeholder:text-white/40"
          />
          <Button
            type="button"
            onClick={onAdd}
            disabled={saving || !newDomain.trim()}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </>
            )}
          </Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {availableDomains.length === 0 ? (
            <p className="text-xs md:text-sm text-white/50">
              No domains saved yet.
            </p>
          ) : (
            availableDomains.map((domain) => (
              <div
                key={domain}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80"
              >
                <span className="font-mono">{domain}</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onCopy(domain)}
                    className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(domain)}
                    className="h-7 w-7 text-white/60 hover:text-red-300 hover:bg-red-400/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {domainToDelete && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
          onClick={cancelDelete}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl p-6 text-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base md:text-lg font-semibold text-white">Delete Domain</h3>
            <p className="mt-2 text-xs md:text-sm text-white/70">
              Are you sure you want to delete <span className="font-mono font-bold">{domainToDelete}</span>? 
              This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={cancelDelete} disabled={saving}>
                Cancel
              </Button>
              <Button className="bg-red-500 text-white hover:bg-red-600" onClick={confirmDelete} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
