'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Coffee, X, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DonationFloatingButtonProps {
  evmAddress: string;
  message: string;
}

const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;

export function DonationFloatingButton({ evmAddress, message }: DonationFloatingButtonProps) {
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const isValidAddress = evmAddressRegex.test(evmAddress);

  useEffect(() => {
    if (!isValidAddress || !open) return;

    let cancelled = false;
    (async () => {
      try {
        const QRCode = await import('qrcode');
        const dataUrl = await QRCode.toDataURL(evmAddress, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 240,
        });
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    })();

    return () => { cancelled = true; };
  }, [isValidAddress, open, evmAddress]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(evmAddress);
      toast.success('Address copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  if (!isValidAddress) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[150] flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 backdrop-blur-md text-white shadow-lg hover:bg-black/80 hover:scale-105 transition-all"
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))', right: 'max(1.5rem, env(safe-area-inset-right))' }}
        title="Support this project"
        aria-label="Support this project"
      >
        <Coffee className="h-5 w-5" style={{ color: 'var(--accent, #fbbf24)' }} />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl p-4 md:p-6 text-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-semibold flex items-center gap-2">
                <Coffee className="h-5 w-5" style={{ color: 'var(--accent, #fbbf24)' }} />
                Support Us
              </h3>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs md:text-sm text-white/70 mb-4">
              {message || 'If this project helped you, consider supporting with a donation'}
            </p>

            <div className="flex flex-col items-center gap-4">
              {qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt="Donation QR code"
                  className="h-[240px] w-[240px] rounded-lg border border-white/10"
                  width={240}
                  height={240}
                  unoptimized
                />
              ) : (
                <div className="flex h-[240px] w-[240px] items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-white/40" />
                </div>
              )}

              <div className="w-full">
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
                  EVM Address
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/70">
                    {evmAddress}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 rounded border border-white/10 bg-black/40 p-1.5 hover:bg-white/10"
                    title="Copy address"
                  >
                    <Copy className="h-3.5 w-3.5 text-white/60" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
