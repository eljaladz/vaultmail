'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Search, RefreshCw, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, getSenderInfo } from '@/lib/utils';
import { Translations } from '@/lib/i18n';
import { Email } from './types';

interface EmailListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onSelectEmail: (email: Email) => void;
  loading: boolean;
  filterText: string;
  setFilterText: (v: string) => void;
  showFilter: boolean;
  setShowFilter: React.Dispatch<React.SetStateAction<boolean>>;
  readEmailIds: Set<string>;
  fetchEmails: () => void;
  t: Translations;
}

export function EmailList({
  emails,
  selectedEmailId,
  onSelectEmail,
  loading,
  filterText,
  setFilterText,
  showFilter,
  setShowFilter,
  readEmailIds,
  fetchEmails,
  t
}: EmailListProps) {
  const filteredEmails = React.useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return emails;
    return emails.filter((email) => {
      return (
        email.subject.toLowerCase().includes(query) ||
        email.from.toLowerCase().includes(query) ||
        email.text.toLowerCase().includes(query)
      );
    });
  }, [emails, filterText]);

  const emailCount = filterText ? filteredEmails.length : emails.length;
  const unreadCount = emails.filter((email) => !readEmailIds.has(email.id)).length;

  return (
    <div className="md:col-span-1 glass-card rounded-2xl overflow-hidden flex flex-col min-h-[35vh] md:min-h-0">
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/20">
        <h3 className="font-semibold flex items-center gap-2">
          <Mail className="h-4 w-4" style={{ color: 'var(--accent, #60a5fa)' }} /> {t.inboxLabel}
          <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-muted-foreground">
            {t.inboxCountTotal}: {emailCount}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--accent, #3b82f6) 20%, transparent)', color: 'var(--accent, #93c5fd)' }}>
            {t.inboxCountUnread}: {unreadCount}
          </span>
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFilter((prev) => !prev)}
            aria-pressed={showFilter}
            aria-label={t.inboxFilterPlaceholder}
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => fetchEmails()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>
      {(showFilter || filterText) && (
        <div className="p-4 border-b border-white/5 bg-black/10">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder={t.inboxFilterPlaceholder}
              className="pl-9 bg-black/30 border-white/10 text-sm"
            />
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {filteredEmails.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground space-y-2 opacity-50"
            >
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent, #60a5fa)' }} />
              <p>{filterText ? t.inboxFilterEmpty : t.waitingForIncoming}</p>
            </motion.div>
          ) : (
            filteredEmails.map((email) => {
              const sender = getSenderInfo(email.from);
              return (
                <motion.div
                  key={email.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onClick={() => onSelectEmail(email)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-white/5 cursor-pointer",
                    selectedEmailId === email.id ? "bg-white/10" : "bg-black/20",
                    !readEmailIds.has(email.id) && ""
                  )}
                  style={{
                    borderColor: selectedEmailId === email.id ? "var(--accent, #3b82f6)" : (!readEmailIds.has(email.id) ? "var(--accent, #60a5fa)" : undefined),
                    backgroundColor: (!readEmailIds.has(email.id) && selectedEmailId !== email.id) ? "color-mix(in srgb, var(--accent, #3b82f6) 10%, transparent)" : undefined
                  }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn("truncate max-w-[150px] text-sm", readEmailIds.has(email.id) ? "font-medium" : "font-semibold text-white")}>
                      {sender.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--accent, #93c5fd)' }}>{email.subject}</h4>
                  <p className="text-xs text-muted-foreground truncate mt-1">{email.text.slice(0, 50)}...</p>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
