'use client'

import { InboxInterface } from '@/components/inbox-interface'
import { NavMenu } from '@/components/nav-menu'
import { Shield, Zap, Globe } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DEFAULT_LOCALE, getRetentionOptions, getTranslations, Locale, SUPPORTED_LOCALES } from '@/lib/i18n'

interface HomePageProps {
  initialAddress?: string
  appName?: string | null
  retentionSeconds?: number
  initialDomains?: string[]
}

const STORAGE_KEY = 'vaultmail_locale'

export function HomePage({ initialAddress, appName, retentionSeconds: initialRetention, initialDomains }: HomePageProps) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)
  const [retentionSeconds] = useState(initialRetention ?? 86400)
  const [customAppName] = useState<string | null>(appName ?? null)
  const [domains] = useState<string[]>(initialDomains ?? [])

  // Load app name logic
  useEffect(() => {
    function handleStorageChange() {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
        setLocale(stored as Locale)
      }
    }
    window.addEventListener('storage', handleStorageChange)
    handleStorageChange()
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    localStorage.setItem(STORAGE_KEY, locale)
  }, [locale])

  const t = useMemo(() => getTranslations(locale), [locale])
  const retentionOptions = useMemo(() => getRetentionOptions(locale), [locale])
  const resolvedAppName = customAppName || t.appName
  const retentionLabel =
    retentionOptions.find((option) => option.value === retentionSeconds)
      ?.label ||
    retentionOptions[2]?.label ||
    '24 Hours'

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return t.greetingMorning
    if (hour >= 12 && hour < 15) return t.greetingAfternoon
    if (hour >= 15 && hour < 19) return t.greetingEvening
    return t.greetingNight
  }, [t])

  const hasShownGreeting = useRef(false)

  useEffect(() => {
    if (hasShownGreeting.current) return
    const timer = setTimeout(() => {
      toast.info(greeting)
      hasShownGreeting.current = true
    }, 300)
    return () => clearTimeout(timer)
  }, [greeting])

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-background/50 relative overflow-hidden flex flex-col">
      {/* Background Blobs */}
      <div className="absolute top-0 left-1/4 w-64 h-64 md:w-96 md:h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--accent, #3b82f6)', opacity: 0.1 }} />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 md:w-96 md:h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--accent, #8b5cf6)', opacity: 0.1 }} />

      {/* Navbar */}
      <header className="border-b border-white/5 bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
           <div className="flex items-center gap-2 font-bold text-lg md:text-xl">
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
          </div>
          <div className="flex items-center gap-4">
            <NavMenu />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 py-8 md:py-12">
        <div className="text-center max-w-2xl mx-auto px-4 mb-8 md:mb-12 space-y-4">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/50">
            {t.heroTitle} <br /> {t.heroTitleSuffix}
          </h1>
          <p className="text-muted-foreground text-base md:text-lg">{t.heroSubtitle}</p>
        </div>

        <InboxInterface
          initialAddress={initialAddress}
          locale={locale}
          retentionLabel={retentionLabel}
          initialDomains={domains}
        />

        {/* Features Grid */}
        <div className="max-w-6xl mx-auto px-4 mt-16 md:mt-24 grid md:grid-cols-3 gap-4 md:gap-8">
          <Feature
            icon={<Zap className="h-6 w-6 text-yellow-400" />}
            title={t.featureInstantTitle}
            desc={t.featureInstantDesc}
          />
          <Feature
            icon={<Shield className="h-6 w-6 text-green-400" />}
            title={t.featurePrivacyTitle}
            desc={t.featurePrivacyDesc}
          />
          <Feature
            icon={<Globe className="h-6 w-6" style={{ color: 'var(--accent, #60a5fa)' }} />}
            title={t.featureCustomTitle}
            desc={t.featureCustomDesc}
          />
        </div>
      </div>

      <footer className="border-t border-white/5 py-8 mt-12 text-center text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-2">
          <p>© {new Date().getFullYear()} Vaultmail. Modified with ☕ by NoDrops</p>
          <a
            href="https://github.com/nodrops-labs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity"
            style={{ color: 'var(--accent, #93c5fd)' }}
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            GitHub
          </a>
        </div>
      </footer>
    </main>
  )
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="p-4 md:p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
      <div className="mb-4 p-3 rounded-full bg-white/5 w-fit">{icon}</div>
      <h3 className="text-base md:text-lg font-bold mb-2">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  )
}
