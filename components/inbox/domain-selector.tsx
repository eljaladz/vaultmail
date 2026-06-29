'use client';

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DomainSelectorProps {
  domains: string[];
  selectedDomain: string;
  onSelectDomain: (domain: string) => void;
  showDomainMenu: boolean;
  setShowDomainMenu: React.Dispatch<React.SetStateAction<boolean>>;
}

export function DomainSelector({
  domains,
  selectedDomain,
  onSelectDomain,
  showDomainMenu,
  setShowDomainMenu
}: DomainSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDomainMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDomainMenu(false);
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDomainMenu(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showDomainMenu, setShowDomainMenu]);

  const longestDomain = domains.reduce((max, d) => d.length > max.length ? d : max, selectedDomain);
  const calculatedMinWidth = Math.min(Math.max(longestDomain.length * 7.2 + 40, 160), 280);

  return (
    <div
      className="relative shrink-0 w-full md:w-auto"
      style={{ minWidth: `clamp(10rem, ${calculatedMinWidth}px, calc(100vw - 2rem))` }}
      ref={containerRef}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={() => setShowDomainMenu((prev) => !prev)}
        className={cn(
          "w-full h-10 md:h-12 px-3 justify-between rounded-md border border-white/10 bg-white/5 text-sm font-mono hover:bg-white/10",
          showDomainMenu && "bg-white/10"
        )}
      >
        <span className="truncate">{selectedDomain}</span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </Button>

      <AnimatePresence>
        {showDomainMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 z-[70] mt-2 w-full rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <div className="max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {domains.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onSelectDomain(d)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg font-mono text-sm transition-colors truncate",
                    d === selectedDomain ? "bg-white/15 text-white" : "text-gray-200 hover:bg-white/10"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
