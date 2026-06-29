'use client';

import React from 'react';
import { Mail, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSenderInfo } from '@/lib/utils';
import { Translations } from '@/lib/i18n';
import { Email, EmailAttachment } from './types';

interface EmailViewerProps {
  email: Email | null;
  address: string;
  t: Translations;
  downloadEmail: () => void;
  downloadAttachment: (index: number) => void;
  highlightVerificationCodes: (html: string) => string;
  resolveInlineImages: (html: string, attachments?: EmailAttachment[]) => string;
  stripEmailStyles: (html: string) => string;
}

export function EmailViewer({
  email,
  address,
  t,
  downloadEmail,
  downloadAttachment,
  highlightVerificationCodes,
  resolveInlineImages,
  stripEmailStyles
}: EmailViewerProps) {
  const selectedSender = email ? getSenderInfo(email.from) : null;

  return (
    <div className="md:col-span-2 glass-card rounded-2xl overflow-hidden flex flex-col h-full min-h-[40vh] md:min-h-0 bg-black/40">
      {email ? (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 md:p-6 border-b border-white/5 space-y-4 bg-black/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-base md:text-xl font-bold text-white break-words">{email.subject}</h1>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={downloadEmail}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Email
                </Button>
                <span className="text-xs text-muted-foreground border border-white/10 px-2 py-1 rounded-md">
                  {new Date(email.receivedAt).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-white text-xs" style={{ backgroundImage: 'linear-gradient(to bottom right, var(--accent, #3b82f6), var(--accent, #8b5cf6))' }}>
                {selectedSender?.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-white">{selectedSender?.label}</span>
                <span className="text-muted-foreground text-xs">
                  {t.toLabel} {email.to || address}
                </span>
              </div>
            </div>
            {email.attachments && email.attachments.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-white/60">
                  Attachments
                </p>
                <div className="flex flex-wrap gap-2">
                  {email.attachments.map((attachment, index) => (
                    <Button
                      key={`${attachment.filename || 'attachment'}-${index}`}
                      variant="secondary"
                      size="sm"
                      onClick={() => downloadAttachment(index)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {attachment.filename || `Attachment ${index + 1}`}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Body — sandboxed iframe prevents XSS from email HTML */}
          <div className="flex-1 overflow-y-auto bg-white">
            <iframe
              srcDoc={highlightVerificationCodes(
                resolveInlineImages(
                  stripEmailStyles(
                    email.html || `<p>${email.text}</p>`
                  ),
                  email.attachments
                )
              )}
              sandbox=""
              className="w-full h-full min-h-[300px] md:min-h-[400px] border-0"
              title="Email content"
            />
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 text-base md:text-lg font-semibold">
          <div className="p-4 rounded-full bg-white/5 border border-white/5">
            <Mail className="h-8 w-8 opacity-50" />
          </div>
          <p>{t.selectEmail}</p>
        </div>
      )}
    </div>
  );
}
