'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Code2, KeyRound, Loader2, Shield } from 'lucide-react'

import { NavMenu } from './nav-menu'
import { Input } from '@/components/ui/input'
import { TurnstileWidget } from '@/components/turnstile-widget'
import { getTranslations } from '@/lib/i18n'
import { DEFAULT_APP_NAME } from '@/lib/branding'
import { apiFetch } from '@/lib/client/api-fetch'
import { toast } from 'sonner'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

const STORAGE_KEY = 'vaultmail_locale'

export function ApiAccessPage() {
  const [locale, setLocale] = useState<'en' | 'id'>('en')
  const [customAppName, setCustomAppName] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')

  useEffect(() => {
    function handleStorageChange() {
      const storedLocale = localStorage.getItem(STORAGE_KEY)
      if (storedLocale === 'en' || storedLocale === 'id') {
        setLocale(storedLocale)
      }
    }
    window.addEventListener('storage', handleStorageChange)
    handleStorageChange()
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale)
  }, [locale])

  const t = useMemo(() => getTranslations(locale), [locale])
  const resolvedAppName = customAppName || t.appName

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const response = await apiFetch('/api/branding')
        if (!response.ok) return
        const data = (await response.json()) as { appName?: string }
        const value = data?.appName?.trim()
        setCustomAppName(value || DEFAULT_APP_NAME)
      } catch (error) {
        console.error(error)
      }
    }

    loadBranding()
  }, [])

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await apiFetch('/api/session')
        if (!response.ok) {
          setAuthed(false)
          return
        }
        const data = (await response.json()) as { valid?: boolean }
        setAuthed(Boolean(data.valid))
      } catch {
        setAuthed(false)
      } finally {
        setAuthChecked(true)
      }
    }
    checkSession()
  }, [])

  const handleSubmitKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!apiKey.trim()) {
      toast.error('API key is required.')
      return
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error('Please complete the bot verification.')
      return
    }
    setSubmitting(true)
    try {
      const response = await apiFetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), turnstileToken }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(data?.error || 'Invalid API key')
      }
      toast.success('Access granted.')
      setAuthed(true)
      setApiKey('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid API key.')
    } finally {
      setSubmitting(false)
    }
  }

  if (authChecked && !authed) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-background to-background/50 relative overflow-hidden flex flex-col items-center justify-center px-4">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: 'var(--accent, #3b82f6)', opacity: 0.1 }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: 'var(--accent, #8b5cf6)', opacity: 0.1 }}
        />

        <div className="glass-card w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center space-y-3">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center"
              style={{
                backgroundImage:
                  'linear-gradient(to bottom right, var(--accent, #3b82f6), var(--accent, #8b5cf6))',
              }}
            >
              <KeyRound className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white">API Access</h1>
            <p className="text-xs md:text-sm text-white/60">
              Enter your API key to view the developer documentation.
            </p>
          </div>

          <form onSubmit={handleSubmitKey} className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-white/60">
                API Key
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="pl-10 bg-white/10 border-white/10 text-white placeholder:text-white/40"
                  placeholder="Enter your API key"
                />
              </div>
            </div>
            {TURNSTILE_SITE_KEY && (
              <div className="flex justify-center">
                <TurnstileWidget
                  siteKey={TURNSTILE_SITE_KEY}
                  action="api-access"
                  onVerify={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                />
              </div>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              className="w-full"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Unlock'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-xs text-white/50 hover:text-white/70 transition-colors"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-background to-background/50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/50" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-background/50 relative overflow-hidden flex flex-col">
      <div
        className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none"
        style={{ backgroundColor: 'var(--accent, #3b82f6)', opacity: 0.1 }}
      />
      <div
        className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none"
        style={{ backgroundColor: 'var(--accent, #8b5cf6)', opacity: 0.1 }}
      />

      <header className="border-b border-white/5 bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{
                backgroundImage:
                  'linear-gradient(to bottom right, var(--accent, #3b82f6), var(--accent, #8b5cf6))',
              }}
            >
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

      <section className="max-w-4xl mx-auto px-4 py-8 md:py-16 w-full">
        <div className="glass-card min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white">
                <Code2
                  className="h-5 w-5"
                  style={{ color: 'var(--accent, #93c5fd)' }}
                />
                <h1 className="text-xl md:text-2xl font-semibold">{t.apiAccessTitle}</h1>
              </div>
              <p className="text-muted-foreground max-w-2xl text-sm md:text-base">
                {t.apiAccessSubtitle}
              </p>
            </div>
            <Link
              href="https://github.com/nodrops-labs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 w-full md:w-auto"
            >
              {t.apiAccessCta}
            </Link>
          </div>
          <div className="mt-6 grid gap-4 grid-cols-1 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 overflow-x-auto">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                {t.apiAccessEndpointsTitle}
              </p>
              <ul
                className="mt-3 space-y-2 text-xs font-mono whitespace-nowrap md:whitespace-normal"
                style={{ color: 'var(--accent, #93c5fd)' }}
              >
                <li>GET /api/inbox?key=API_KEY&amp;address=mail@domain.com</li>
                <li>
                  GET
                  /api/download?key=API_KEY&amp;address=mail@domain.com&amp;emailId=uuid&amp;type=email
                </li>
                <li>GET /api/retention</li>
              </ul>
              <p className="mt-3 text-xs text-white/50">
                Or use the{' '}
                <code className="rounded bg-white/10 px-1 font-mono">
                  x-api-key
                </code>{' '}
                header.
              </p>
            </div>
            <div className="w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                {t.apiAccessWebhookTitle}
              </p>
              <p className="mt-3 text-xs md:text-sm text-white/80">POST /api/webhook</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t.apiAccessWebhookHint}
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
