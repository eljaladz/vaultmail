'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { KeyRound, MailPlus, Shield, Wrench, Binary, Key, ShieldAlert } from 'lucide-react';

import { NavMenu } from './nav-menu';
import { getTranslations } from '@/lib/i18n';
import { DEFAULT_APP_NAME } from '@/lib/branding';
import { apiFetch } from '@/lib/client/api-fetch';

const STORAGE_KEY = 'vaultmail_locale';
const DEFAULT_TOTP_SECRET = 'FRN7276QJFZOQ7OFI2UIVUVQQ6V3QRIL';

export function ToolsPage() {
  const [locale, setLocale] = useState<'en' | 'id'>('en');
  const [customAppName, setCustomAppName] = useState<string | null>(null);

  useEffect(() => {
    function handleStorageChange() {
      const storedLocale = localStorage.getItem(STORAGE_KEY);
      if (storedLocale === 'en' || storedLocale === 'id') {
        setLocale(storedLocale);
      }
    }
    window.addEventListener('storage', handleStorageChange);
    handleStorageChange();
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const t = useMemo(() => getTranslations(locale), [locale]);
  const resolvedAppName = customAppName || t.appName;

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const response = await apiFetch('/api/branding');
        if (!response.ok) return;
        const data = (await response.json()) as { appName?: string };
        const value = data?.appName?.trim();
        setCustomAppName(value || DEFAULT_APP_NAME);
      } catch (error) {
        console.error(error);
      }
    };

    loadBranding();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-background/50 relative overflow-hidden flex flex-col">
      <div className="absolute top-0 left-1/4 w-64 h-64 md:w-96 md:h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--accent, #3b82f6)', opacity: 0.1 }} />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 md:w-96 md:h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--accent, #8b5cf6)', opacity: 0.1 }} />

      <header className="border-b border-white/5 bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundImage: 'linear-gradient(to bottom right, var(--accent, #3b82f6), var(--accent, #8b5cf6))' }}>
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span>{resolvedAppName}</span>
          </Link>
          <div className="flex items-center gap-4">
            <NavMenu
              locale={locale}
              onToggleLocale={() => setLocale(locale === 'id' ? 'en' : 'id')}
            />
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-8 md:py-16 w-full">
        <div className="glass-card rounded-2xl border border-white/10 bg-white/5 p-4 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white">
                <Wrench className="h-5 w-5" style={{ color: 'var(--accent, #fbbf24)' }} />
                <h1 className="text-xl md:text-2xl font-semibold">{t.toolsTitle}</h1>
              </div>
              <p className="text-muted-foreground max-w-2xl text-sm md:text-base">
                {t.toolsSubtitle}
              </p>
            </div>
            <span className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
              {t.toolsTitle}
            </span>
          </div>
          <div className="mt-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-white">
                <KeyRound className="h-4 w-4" style={{ color: 'var(--accent, #fbbf24)' }} />
                <p className="text-sm font-semibold">{t.toolsTwoFaTitle}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.toolsTwoFaDesc}
              </p>
              <Link
                href={`/2fa-gen?key=${DEFAULT_TOTP_SECRET}`}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                {t.toolsTwoFaCta}
              </Link>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-white">
                <MailPlus className="h-4 w-4" style={{ color: 'var(--accent, #93c5fd)' }} />
                <p className="text-sm font-semibold">{t.toolsGmailDotTitle}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.toolsGmailDotDesc}
              </p>
              <Link
                href="/gmail-dot"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                {t.toolsGmailDotCta}
              </Link>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-white">
                <Key className="h-4 w-4" style={{ color: 'var(--accent, #c4b5fd)' }} />
                <p className="text-sm font-semibold">{t.toolsTokenTitle}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.toolsTokenDesc}
              </p>
              <Link
                href="/token-generator"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                {t.toolsTokenCta}
              </Link>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-white">
                <Binary className="h-4 w-4" style={{ color: 'var(--accent, #fbbf24)' }} />
                <p className="text-sm font-semibold">{t.toolsUrlCodecTitle}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.toolsUrlCodecDesc}
              </p>
              <Link
                href="/url-codec"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                {t.toolsUrlCodecCta}
              </Link>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-white">
                <ShieldAlert className="h-4 w-4 text-red-200" />
                <p className="text-sm font-semibold">{t.toolsBreachTitle}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.toolsBreachDesc}
              </p>
              <Link
                href="/email-breach"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                {t.toolsBreachCta}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
