'use client';

import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { X, Cloud, Server, CheckCircle2 } from 'lucide-react';

interface RequestDomainModalProps {
  onClose: () => void;
}

export function RequestDomainModal({ onClose }: RequestDomainModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-4 md:p-6 text-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base md:text-lg font-semibold">Request a New Domain</h3>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs md:text-sm text-white/70 mb-4">
          Vaultmail domains must be connected through Cloudflare Email Routing. Here&apos;s how to add a new domain:
        </p>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Cloud className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-white">1. Contact the admin</p>
              <p className="text-[11px] text-white/50">
                Provide the domain name you want to use (e.g. mydomain.com).
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Server className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-white">2. Admin starts Cloudflare onboarding</p>
              <p className="text-[11px] text-white/50">
                The admin adds the domain from the admin panel. Cloudflare assigns two nameservers.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-white">3. Update nameservers at your registrar</p>
              <p className="text-[11px] text-white/50">
                Set the assigned nameservers at your domain registrar. DNS propagation can take a few hours.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-white">4. Domain is ready</p>
              <p className="text-[11px] text-white/50">
                Once nameservers are active, Vaultmail enables Email Routing automatically. The domain appears in the dropdown.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
          <p className="text-[11px] text-yellow-300/80">
            Don&apos;t add MX records manually — Cloudflare Email Routing handles this automatically.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
