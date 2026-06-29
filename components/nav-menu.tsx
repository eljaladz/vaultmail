'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Home, Shield, Code2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavMenuProps {
  locale?: 'en' | 'id';
  onToggleLocale?: () => void;
}

export function NavMenu({ }: NavMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMenu(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showMenu]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setShowMenu((prev) => !prev)}
        className="h-10 w-10 md:h-12 md:w-12 rounded-full border border-white/10 bg-white/10 text-white"
      >
        <Menu className="h-5 w-5" style={{ color: 'var(--accent, #93c5fd)' }} />
      </Button>

      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-[70] mt-2 w-56 rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <div className="p-2 space-y-1">
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                Menu
              </div>
              <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10" onClick={() => setShowMenu(false)}>
                <Home className="h-4 w-4" style={{ color: 'var(--accent, #93c5fd)' }} />
                Home
              </Link>
              <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10" onClick={() => setShowMenu(false)}>
                <Shield className="h-4 w-4" style={{ color: 'var(--accent, #c4b5fd)' }} />
                Admin Dashboard
              </Link>
              <Link href="/api-access" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10" onClick={() => setShowMenu(false)}>
                <Code2 className="h-4 w-4" style={{ color: 'var(--accent, #93c5fd)' }} />
                API Access
              </Link>
              <Link href="/tools" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10" onClick={() => setShowMenu(false)}>
                <Wrench className="h-4 w-4" style={{ color: 'var(--accent, #fbbf24)' }} />
                Tools
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
