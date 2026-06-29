'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { DEFAULT_APP_NAME } from '@/lib/branding';
import { apiFetch } from '@/lib/client/api-fetch';

import { NavMenu } from './nav-menu';

import {
  TelegramSettings,
  RetentionSettings,
  BrandingSettings,
  HomepageLockSettings,
  DomainsSettings,
  AdminStats,
  ImapSettings,
  ApiKeyView
} from './admin/types';
import { StatsSection } from './admin/stats-section';
import { BrandingSection } from './admin/branding-section';
import { FaviconSection } from './admin/favicon-section';
import { AccentColorSection } from './admin/accent-color-section';
import { HomepageLockSection } from './admin/homepage-lock-section';
import { CloudflareDomainsSection } from './admin/cloudflare-domains-section';
import { ImapSection } from './admin/imap-section';
import { TelegramSection } from './admin/telegram-section';
import { RetentionSection } from './admin/retention-section';
import { ApiKeysSection } from './admin/api-keys-section';
import { DonationSection } from './admin/donation-section';
import { DomainRequestsSection } from './admin/domain-requests-section';

const normalizeDomains = (domains: string[]) =>
  [...new Set(domains.map((domain) => domain.toLowerCase().trim()).filter(Boolean))];

export function AdminDashboard() {
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [availableDomains, setAvailableDomains] = useState<string[]>([]);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [retentionSeconds, setRetentionSeconds] = useState(86400);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [homepageLockEnabled, setHomepageLockEnabled] = useState(false);
  const [homepageLockPassword, setHomepageLockPassword] = useState('');
  const [homepageLockSaving, setHomepageLockSaving] = useState(false);
  const [homepageLockHasPassword, setHomepageLockHasPassword] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [imapSettings, setImapSettings] = useState<ImapSettings>({
    enabled: false,
    host: '',
    port: 993,
    user: '',
    password: '',
    tls: true,
    rejectUnauthorized: true,
    maxFetch: 30
  });
  const [imapSaving, setImapSaving] = useState(false);
  const [imapTesting, setImapTesting] = useState(false);
  const [donationEnabled, setDonationEnabled] = useState(false);
  const [donationAddress, setDonationAddress] = useState('');
  const [donationMessage, setDonationMessage] = useState('If this project helped you, consider supporting with a donation');
  const [donationSaving, setDonationSaving] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeyView[]>([]);
  const [locale, setLocale] = useState<'en' | 'id'>('en');

  const retentionOptions = useMemo(
    () => [
      { label: '30 Minutes', value: 1800 },
      { label: '1 Hour', value: 3600 },
      { label: '24 Hours', value: 86400 },
      { label: '3 Days', value: 259200 },
      { label: '1 Week', value: 604800 }
    ],
    []
  );

  const loadSettings = async () => {
    try {
      const [
        telegramResponse,
        retentionResponse,
        brandingResponse,
        domainsResponse,
        homepageLockResponse,
        imapResponse,
        apiKeysResponse,
        donationResponse
      ] = await Promise.all([
        apiFetch('/api/admin/telegram'),
        apiFetch('/api/admin/retention'),
        apiFetch('/api/admin/branding'),
        apiFetch('/api/admin/domains'),
        apiFetch('/api/admin/homepage-lock'),
        apiFetch('/api/admin/imap'),
        apiFetch('/api/admin/api-keys'),
        apiFetch('/api/admin/donation')
      ]);
      if (
        !telegramResponse.ok ||
        !retentionResponse.ok ||
        !brandingResponse.ok ||
        !domainsResponse.ok ||
        !homepageLockResponse.ok ||
        !imapResponse.ok ||
        !apiKeysResponse.ok ||
        !donationResponse.ok
      ) {
        throw new Error('Unauthorized or failed to load settings.');
      }
      const data = (await telegramResponse.json()) as TelegramSettings;
      const retentionData =
        (await retentionResponse.json()) as RetentionSettings;
      const brandingData = (await brandingResponse.json()) as BrandingSettings;
      const domainsData = (await domainsResponse.json()) as DomainsSettings;
      const homepageLockData =
        (await homepageLockResponse.json()) as HomepageLockSettings;
      const imapData = (await imapResponse.json()) as ImapSettings;
      const apiKeysData = (await apiKeysResponse.json()) as {
        keys: ApiKeyView[];
      };
      const donationData = (await donationResponse.json()) as {
        enabled: boolean;
        evmAddress: string;
        message: string;
      };
      setTelegramEnabled(Boolean(data.enabled));
      setBotToken(data.botToken || '');
      setChatId(data.chatId || '');
      const incomingAvailable = normalizeDomains(domainsData?.domains || []);
      const incomingAllowed = normalizeDomains(
        Array.isArray(data.allowedDomains) ? data.allowedDomains : []
      );
      setAvailableDomains(incomingAvailable);
      setAllowedDomains(
        incomingAllowed.length > 0 ? incomingAllowed : incomingAvailable
      );
      if (retentionData?.seconds) {
        setRetentionSeconds(retentionData.seconds);
      }
      if (brandingData?.appName) {
        setAppName(brandingData.appName);
      }
      setHomepageLockEnabled(Boolean(homepageLockData?.enabled));
      setHomepageLockHasPassword(Boolean(homepageLockData?.hasPassword));
      setImapSettings((prev) => ({ ...prev, ...imapData }));
      setApiKeys(apiKeysData.keys || []);
      setDonationEnabled(Boolean(donationData?.enabled));
      setDonationAddress(donationData?.evmAddress || '');
      setDonationMessage(donationData?.message || 'If this project helped you, consider supporting with a donation');
    } catch (error) {
      console.error(error);
      toast.error('Failed to load admin settings.');
    }
  };

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(false);
    try {
      const response = await apiFetch('/api/admin/stats');
      if (response.status === 401) {
        if (statsIntervalRef.current) {
          clearInterval(statsIntervalRef.current);
          statsIntervalRef.current = null;
        }
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to load stats.');
      }
      const data = (await response.json()) as AdminStats;
      setStats(data);
    } catch (error) {
      console.error(error);
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const saveTelegramSettings = async () => {
    setTelegramSaving(true);
    try {
      const filteredAllowed = allowedDomains.filter((domain) =>
        availableDomains.includes(domain)
      );
      const response = await apiFetch('/api/admin/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: telegramEnabled,
          botToken,
          chatId,
          allowedDomains: filteredAllowed
        })
      });
      if (!response.ok) {
        throw new Error('Failed to save Telegram settings');
      }
      setAllowedDomains(filteredAllowed);
      toast.success('Telegram settings saved.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save Telegram settings.');
    } finally {
      setTelegramSaving(false);
    }
  };

  const saveDonationSettings = async () => {
    setDonationSaving(true);
    try {
      const response = await apiFetch('/api/admin/donation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: donationEnabled,
          evmAddress: donationAddress,
          message: donationMessage
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save donation settings');
      }
      toast.success('Donation settings saved.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to save donation settings.');
    } finally {
      setDonationSaving(false);
    }
  };

  const saveRetention = async (value: number) => {
    setRetentionSeconds(value);
    setRetentionSaving(true);
    try {
      const response = await apiFetch('/api/admin/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds: value })
      });
      if (!response.ok) {
        throw new Error('Unauthorized or failed to save retention.');
      }
      toast.success('Retention settings saved.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save retention settings.');
    } finally {
      setRetentionSaving(false);
    }
  };

  const saveBranding = async () => {
    setBrandingSaving(true);
    try {
      const response = await apiFetch('/api/admin/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName })
      });
      if (!response.ok) {
        throw new Error('Unauthorized or failed to save branding.');
      }
      toast.success('Site name saved.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save site name.');
    } finally {
      setBrandingSaving(false);
    }
  };

  const saveHomepageLock = async () => {
    if (homepageLockEnabled && !homepageLockPassword.trim() && !homepageLockHasPassword) {
      toast.error('Enter a password to enable homepage lock.');
      return;
    }
    setHomepageLockSaving(true);
    try {
      const response = await apiFetch('/api/admin/homepage-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: homepageLockEnabled,
          password: homepageLockPassword || undefined
        })
      });
      if (!response.ok) {
        throw new Error('Unauthorized or failed to save homepage lock.');
      }
      const data = (await response.json()) as HomepageLockSettings;
      setHomepageLockEnabled(Boolean(data.enabled));
      setHomepageLockHasPassword(Boolean(data.hasPassword));
      setHomepageLockPassword('');
      toast.success('Homepage lock saved.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save homepage lock.');
    } finally {
      setHomepageLockSaving(false);
    }
  };

  const saveImapSettings = async () => {
    setImapSaving(true);
    try {
      const response = await apiFetch('/api/admin/imap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imapSettings)
      });
      if (!response.ok) {
        throw new Error('Failed to save IMAP settings');
      }
      toast.success('IMAP settings saved.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save IMAP settings.');
    } finally {
      setImapSaving(false);
    }
  };

  const testImapSettings = async () => {
    setImapTesting(true);
    try {
      const response = await apiFetch('/api/admin/imap/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imapSettings)
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to test IMAP settings.');
      }
      toast.success('IMAP test successful. Connection is valid.');
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
        ? `IMAP test failed: ${error.message}`
        : 'IMAP test failed.'
      );
    } finally {
      setImapTesting(false);
    }
  };

  useEffect(() => {
    const initSettings = () => loadSettings();
    initSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch('/api/admin/stats');
        if (response.status === 401) {
          if (statsIntervalRef.current) {
            clearInterval(statsIntervalRef.current);
            statsIntervalRef.current = null;
          }
          return;
        }
        if (response.ok && !cancelled) {
          const data = (await response.json()) as AdminStats;
          setStats(data);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setStatsError(true);
        }
      }
    })();
    statsIntervalRef.current = setInterval(fetchStats, 10000);
    return () => {
      cancelled = true;
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    };
  }, [fetchStats]);

  const latestActivityLabel = useMemo(() => {
    if (statsLoading && !stats) {
      return 'Loading...';
    }
    if (statsError) {
      return 'Failed to load';
    }
    if (!stats || stats.messageCount === 0) {
      return 'No emails yet';
    }
    if (!stats?.latestReceivedAt) {
      return 'No emails yet';
    }
    return formatDistanceToNow(new Date(stats.latestReceivedAt), {
      addSuffix: true
    });
  }, [stats, statsError, statsLoading]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-background/50 relative overflow-hidden flex flex-col text-white">
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--accent, #3b82f6)', opacity: 0.1 }} />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--accent, #8b5cf6)', opacity: 0.1 }} />
      
      <header className="border-b border-white/5 bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundImage: 'linear-gradient(to bottom right, var(--accent, #3b82f6), var(--accent, #8b5cf6))' }}>
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span>{appName}</span>
          </Link>
          <div className="flex items-center gap-4">
            <NavMenu
              locale={locale}
              onToggleLocale={() => setLocale(locale === 'id' ? 'en' : 'id')}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:py-16 relative z-10">
        <div className="glass-card min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 md:p-8 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-xs md:text-sm uppercase tracking-[0.2em] /70" style={{ color: 'var(--accent, #93c5fd)' }}>
                Admin
              </p>
              <h1 className="text-xl md:text-3xl font-semibold text-white">
                Admin Dashboard
              </h1>
              <p className="text-xs md:text-sm text-white/70">
                Manage your temporary email service settings.
              </p>
            </div>
          </div>

          <div className="mt-8 grid min-w-0 gap-6">
            <StatsSection
              stats={stats}
              statsLoading={statsLoading}
              statsError={statsError}
              latestActivityLabel={latestActivityLabel}
            />

            <hr className="border-white/10 my-2" />

            <BrandingSection
              appName={appName}
              setAppName={setAppName}
              saveBranding={saveBranding}
              brandingSaving={brandingSaving}
            />
            <FaviconSection />
            <AccentColorSection />

            <hr className="border-white/10 my-2" />

            <DomainRequestsSection onDomainAdded={loadSettings} />

            <CloudflareDomainsSection onDomainAdded={loadSettings} />

            <hr className="border-white/10 my-2" />

            <RetentionSection
              retentionSeconds={retentionSeconds}
              retentionOptions={retentionOptions}
              saveRetention={saveRetention}
              retentionSaving={retentionSaving}
            />

            <hr className="border-white/10 my-2" />

            <HomepageLockSection
              enabled={homepageLockEnabled}
              setEnabled={setHomepageLockEnabled}
              password={homepageLockPassword}
              setPassword={setHomepageLockPassword}
              hasPassword={homepageLockHasPassword}
              save={saveHomepageLock}
              saving={homepageLockSaving}
            />

            <hr className="border-white/10 my-2" />

            <ApiKeysSection
              keys={apiKeys}
              onGenerate={async () => {
                try {
                  const res = await apiFetch('/api/admin/api-keys');
                  const data = await res.json();
                  if (data.keys) setApiKeys(data.keys);
                } catch {}
              }}
              onRevoke={async () => {
                try {
                  const res = await apiFetch('/api/admin/api-keys');
                  const data = await res.json();
                  if (data.keys) setApiKeys(data.keys);
                } catch {}
              }}
            />

            <hr className="border-white/10 my-2" />

            <ImapSection
              enabled={imapSettings.enabled}
              setEnabled={(v) =>
                setImapSettings({ ...imapSettings, enabled: v as boolean })
              }
              host={imapSettings.host}
              setHost={(v) => setImapSettings({ ...imapSettings, host: v })}
              port={imapSettings.port}
              setPort={(v) => setImapSettings({ ...imapSettings, port: v })}
              user={imapSettings.user}
              setUser={(v) => setImapSettings({ ...imapSettings, user: v })}
              password={imapSettings.password}
              setPassword={(v) => setImapSettings({ ...imapSettings, password: v })}
              tls={imapSettings.tls}
              setTls={(v) => setImapSettings({ ...imapSettings, tls: v })}
              rejectUnauthorized={imapSettings.rejectUnauthorized}
              setRejectUnauthorized={(v) =>
                setImapSettings({ ...imapSettings, rejectUnauthorized: v })
              }
              maxFetch={imapSettings.maxFetch}
              setMaxFetch={(v) => setImapSettings({ ...imapSettings, maxFetch: v })}
              onSave={saveImapSettings}
              onTest={testImapSettings}
              saving={imapSaving}
              testing={imapTesting}
            />

            <hr className="border-white/10 my-2" />

            <TelegramSection
              enabled={telegramEnabled}
              setEnabled={setTelegramEnabled}
              botToken={botToken}
              setBotToken={setBotToken}
              chatId={chatId}
              setChatId={setChatId}
              availableDomains={availableDomains}
              allowedDomains={allowedDomains}
              setAllowedDomains={setAllowedDomains}
              onSave={saveTelegramSettings}
              saving={telegramSaving}
            />

            <hr className="border-white/10 my-2" />

            <DonationSection
              enabled={donationEnabled}
              setEnabled={setDonationEnabled}
              evmAddress={donationAddress}
              setEvmAddress={setDonationAddress}
              message={donationMessage}
              setMessage={setDonationMessage}
              onSave={saveDonationSettings}
              saving={donationSaving}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
