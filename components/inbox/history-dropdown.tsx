'use client';

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History as HistoryIcon, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Translations } from '@/lib/i18n';

interface HistoryDropdownProps {
  history: string[];
  activeAddress: string;
  onRestore: (address: string) => void;
  onClearAll: () => void;
  onRemove: (address: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  hasEmails: boolean;
  t: Translations;
}

export function HistoryDropdown({
  history,
  activeAddress,
  onRestore,
  onClearAll,
  onRemove,
  show,
  setShow,
  hasEmails,
  t
}: HistoryDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShow(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [show, setShow]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <Button
        onClick={() => setShow(!show)}
        variant="ghost"
        size="icon"
        className={cn("h-10 w-10 md:h-12 md:w-12 border border-white/10 hover:bg-white/5 relative", show && "bg-white/10 ring-2 ring-white/10")}
        title={t.historyTitle}
      >
        <HistoryIcon className="h-5 w-5" />
        {history.length > 0 && (
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent, #3b82f6)' }} />
        )}
      </Button>

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-[70] mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
              <span className="text-xs font-bold tracking-wider uppercase text-white/50">{t.historyTitle}</span>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button onClick={onClearAll} className="text-[10px] uppercase font-bold text-red-400 hover:text-red-300 transition-colors">
                    {t.historyClearAll}
                  </button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setShow(false)} aria-label="Close history">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2 space-y-1">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-white/50 space-y-2">
                  <HistoryIcon className="h-8 w-8 opacity-20" />
                  <p className="text-sm">{t.historyEmpty}</p>
                </div>
              ) : (
                history.map((histAddr) => (
                  <div key={histAddr} className="flex group items-center gap-3 rounded-lg border border-transparent hover:border-white/10">
                    <button type="button" className="flex-1 min-w-0 rounded-lg p-3 text-left transition-colors hover:bg-white/5" onClick={() => onRestore(histAddr)}>
                      <p className="font-mono text-sm truncate text-gray-200">{histAddr}</p>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--accent, #c4b5fd)' }}>
                        {hasEmails && activeAddress === histAddr ? t.historyActive : t.historyRestore}
                      </p>
                    </button>
                    <Button variant="ghost" size="icon" className="mr-2 h-7 w-7 opacity-70 hover:opacity-100 hover:bg-red-500/20 hover:text-red-400" onClick={() => onRemove(histAddr)} aria-label={`Remove ${histAddr}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
