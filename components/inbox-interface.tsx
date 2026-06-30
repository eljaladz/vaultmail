'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { RefreshCw, Copy, Plus } from 'lucide-react';
import { DEFAULT_EMAIL, getDefaultEmailDomain } from '@/lib/config';
import { getTranslations, Locale } from '@/lib/i18n';
import { apiFetch } from '@/lib/client/api-fetch';

import { EmailList } from './inbox/email-list';
import { EmailViewer } from './inbox/email-viewer';
import { DomainSelector } from './inbox/domain-selector';
import { HistoryDropdown } from './inbox/history-dropdown';
import { RequestDomainModal } from './inbox/request-domain-modal';
import { Email, EmailAttachment } from './inbox/types';

interface InboxInterfaceProps {
    initialAddress?: string;
    locale?: Locale;
    retentionLabel?: string;
    initialDomains?: string[];
}

export function InboxInterface({ initialAddress, locale, retentionLabel, initialDomains }: InboxInterfaceProps) {
  const t = getTranslations(locale);
  const normalizeDomains = useCallback(
    (domains: string[]) =>
      [...new Set(domains.map((entry) => entry.toLowerCase().trim()).filter(Boolean))],
    []
  );
  const [address, setAddress] = useState<string>(initialAddress || '');
  const [domain, setDomain] = useState<string>(getDefaultEmailDomain());
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [autoRefresh] = useState(true);
  const [systemDomains, setSystemDomains] = useState<string[]>(initialDomains ?? []);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showDomainMenu, setShowDomainMenu] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [domainExpiration, setDomainExpiration] = useState<string | null>(null);
  const [domainStatusLoading, setDomainStatusLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [readEmailIds, setReadEmailIds] = useState<Set<string>>(new Set());
  const previousEmailIds = useRef<Set<string>>(new Set());
  const hasLoadedEmails = useRef(false);

  const domainExpirationDate = useMemo(() => domainExpiration ? new Date(domainExpiration) : null, [domainExpiration]);
  const [isDomainExpired, setIsDomainExpired] = useState(false);
  useEffect(() => {
    const checkExpiry = () => {
      setIsDomainExpired(domainExpirationDate ? domainExpirationDate.getTime() < Date.now() : false);
    };
    checkExpiry();
  }, [domainExpirationDate]);

  const downloadEmail = useCallback(() => {
    if (!selectedEmail) return;
    const download = async () => {
      try {
        const response = await apiFetch(
          `/api/download?address=${encodeURIComponent(address)}&emailId=${encodeURIComponent(
            selectedEmail.id
          )}&type=email`
        );
        if (!response.ok) {
          throw new Error('Download failed');
        }
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/);
        const fileName = match?.[1] || 'email.eml';
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error(error);
        toast.error('Failed to download email.');
      }
    };
    download();
  }, [address, selectedEmail]);

  const downloadAttachment = useCallback(
    (index: number) => {
      if (!selectedEmail) return;
      const download = async () => {
        try {
          const response = await apiFetch(
            `/api/download?address=${encodeURIComponent(
              address
            )}&emailId=${encodeURIComponent(selectedEmail.id)}&type=attachment&index=${index}`
          );
          if (!response.ok) {
            throw new Error('Download failed');
          }
          const blob = await response.blob();
          const disposition = response.headers.get('content-disposition') || '';
          const match = disposition.match(/filename="([^"]+)"/);
          const fileName = match?.[1] || 'attachment';
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error(error);
          toast.error('Failed to download attachment.');
        }
      };
      download();
    },
    [address, selectedEmail]
  );

  const stripEmailStyles = useCallback((html: string) => {
    if (!html) return '';

    if (typeof window === 'undefined') {
      return html
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<link[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '');
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style, script, link[rel="stylesheet"]').forEach((node) => node.remove());
    return doc.body.innerHTML || '';
  }, []);

  const normalizeContentId = useCallback((value?: string) => {
    if (!value) return '';
    let normalized = value.replace(/^cid:/i, '').replace(/[<>]/g, '').trim();
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // Ignore malformed URI sequences.
    }
    return normalized.toLowerCase();
  }, []);

  const resolveInlineImages = useCallback(
    (html: string, attachments?: EmailAttachment[]) => {
      if (!html || !attachments || attachments.length === 0) return html;
      return html.replace(/src=["']cid:([^"']+)["']/gi, (match, cid) => {
        const normalizedCid = normalizeContentId(cid);
        const attachment = attachments.find((item) => {
          const contentId = normalizeContentId(item.contentId);
          return contentId && contentId === normalizedCid;
        });
        if (!attachment?.contentBase64) {
          return match;
        }
        const contentType = attachment.contentType || 'image/png';
        const base64 = attachment.contentBase64.trim().replace(/\s+/g, '');
        if (!base64) {
          return match;
        }
        const dataUrl = base64.startsWith('data:')
          ? base64
          : `data:${contentType};base64,${base64}`;
        return `src="${dataUrl}"`;
      });
    },
    [normalizeContentId]
  );

  const highlightVerificationCodes = useCallback((html: string) => {
    if (!html || typeof window === 'undefined') {
      return html;
    }
    const codeRegex = /\b(\d{4,8})\b/g;
    const keywordRegex =
      /(otp|one[-\s]?time|verification|verifikasi|security|passcode|kode|auth(?:entication)?|kode\s+otp|kode\s+verifikasi)/i;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodesToUpdate: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const text = node.nodeValue || '';
      const isStandaloneCode = /^\s*\d{4,8}\s*$/.test(text);
      const hasKeyword = keywordRegex.test(text);
      if ((isStandaloneCode || hasKeyword) && codeRegex.test(text)) {
        nodesToUpdate.push(node);
      }
      codeRegex.lastIndex = 0;
      keywordRegex.lastIndex = 0;
    }
    nodesToUpdate.forEach((node) => {
      const text = node.nodeValue || '';
      const replaced = text.replace(
        codeRegex,
        '<mark data-copy-code="$1" class="rounded bg-amber-200/90 px-1 py-0.5 font-semibold text-black cursor-pointer select-all" title="Tap to copy OTP">$1</mark>'
      );
      if (replaced !== text) {
        const wrapper = doc.createElement('span');
        wrapper.innerHTML = replaced;
        node.parentNode?.replaceChild(wrapper, node);
      }
    });
    return doc.body.innerHTML;
  }, []);

  const fetchedExpirationRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!domain) return;
    if (fetchedExpirationRef.current.has(domain)) return;
    fetchedExpirationRef.current.add(domain);
    let active = true;
    const fetchExpiration = async () => {
      setDomainStatusLoading(true);
      try {
        const response = await apiFetch(
          `/api/domain-expiration?domain=${encodeURIComponent(domain)}`
        );
        if (!response.ok) {
          if (response.status !== 401 && response.status !== 429) {
            console.error('Failed to load domain expiration:', response.status);
          }
          fetchedExpirationRef.current.delete(domain);
          if (active) setDomainExpiration(null);
          return;
        }
        const data = (await response.json()) as {
          expiresAt: string | null;
          checkedAt: string;
        };
        if (active) {
          setDomainExpiration(data.expiresAt ?? null);
        }
      } catch (error) {
        console.error(error);
        fetchedExpirationRef.current.delete(domain);
        if (active) {
          setDomainExpiration(null);
        }
      } finally {
        if (active) {
          setDomainStatusLoading(false);
        }
      }
    };
    fetchExpiration();
    return () => {
      active = false;
    };
  }, [domain]);

  const addToHistory = useCallback((addr: string) => {
      if (!addr.includes('@')) return;
      
      setHistory(prev => {
          // Prevent duplicates and limit to 10
          if (prev.includes(addr)) {
               // Move to top if exists
               return [addr, ...prev.filter(a => a !== addr)];
          }
          const newHist = [addr, ...prev].slice(0, 10);
          localStorage.setItem('dispo_history', JSON.stringify(newHist));
          return newHist;
      });
  }, []);

  const generateAddress = useCallback(() => {
    // Generate pronounceable random string (e.g. weidipoffeutre)
    const vowels = 'aeiou';
    const consonants = 'bcdfghjklmnpqrstvwxyz';
    let name = '';
    const length = Math.floor(Math.random() * 5) + 8; // 8-12 chars

    for (let i = 0; i < length; i++) {
        const isVowel = i % 2 === 1; // Start with consonant usually
        const set = isVowel ? vowels : consonants;
        name += set[Math.floor(Math.random() * set.length)];
    }

    const num = Math.floor(Math.random() * 9000) + 1000; // 4 digit number
    const newAddress = `${name}-${num}@${domain}`;
    
    setAddress(newAddress);
    localStorage.setItem('dispo_address', newAddress);
    setEmails([]);
    setSelectedEmail(null);
    toast.success(t.toastNewAlias);
    addToHistory(newAddress);
  }, [domain, t.toastNewAlias, addToHistory]);

  const generateAddressRef = useRef(generateAddress);
  useEffect(() => {
    generateAddressRef.current = generateAddress;
  }, [generateAddress]);

  // Load saved data (mount-only — empty deps to prevent re-runs)
  useEffect(() => {
    const initData = () => {
      const savedHist = localStorage.getItem('dispo_history');

      if (savedHist) setHistory(JSON.parse(savedHist));
      if (!initialAddress) {
          const saved = localStorage.getItem('dispo_address');
          if (saved) {
              setAddress(saved);
              const parts = saved.split('@');
              if (parts.length > 1) setDomain(parts[1]);
          } else if (DEFAULT_EMAIL) {
              setAddress(DEFAULT_EMAIL);
              localStorage.setItem('dispo_address', DEFAULT_EMAIL);
              const parts = DEFAULT_EMAIL.split('@');
              if (parts.length > 1) setDomain(parts[1]);
          } else {
              generateAddressRef.current();
          }
      } else {
           const parts = initialAddress.split('@');
           if (parts.length > 1) setDomain(parts[1]);
      }
    };
    initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialDomains !== undefined) return;
    let active = true;
    const loadDomains = async () => {
      try {
        const response = await apiFetch('/api/domains');
        if (!response.ok) {
          throw new Error('Failed to load domains');
        }
        const data = (await response.json()) as { domains?: string[] };
        const normalized = normalizeDomains(data.domains || []);
        if (active) {
          setSystemDomains(normalized);
        }
      } catch (error) {
        console.error(error);
        if (active) {
          setSystemDomains([]);
        }
      }
    };
    loadDomains();
    return () => {
      active = false;
    };
  }, [normalizeDomains, initialDomains]);

  useEffect(() => {
    const updateDomain = () => {
      if (systemDomains.length === 0) return;
      if (!systemDomains.includes(domain)) {
        setDomain(systemDomains[0]);
      }
    };
    updateDomain();
  }, [domain, systemDomains]);

  useEffect(() => {
    const updateAddress = () => {
      if (!address) return;
      const [localPart, currentDomain] = address.split('@');
      if (!localPart || currentDomain === domain) return;
      const nextAddress = `${localPart}@${domain}`;
      setAddress(nextAddress);
      localStorage.setItem('dispo_address', nextAddress);
    };
    updateAddress();
  }, [address, domain]);

  // Sync Address to URL (without reloading)
  useEffect(() => {
      if (address && address.includes('@')) {
          window.history.replaceState(null, '', `/${address}`);
      }
  }, [address]);



  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    toast.success(t.toastCopied);
  };

  const fetchEmails = useCallback(async () => {
    if (!address) return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/inbox?address=${encodeURIComponent(address)}`);
      
      if (res.status === 401) {
        toast.error('Session expired. Reloading...');
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
      
      const data = await res.json();
      if (data.emails) {
        const incoming = data.emails as Email[];
        const nextIds = new Set(incoming.map((email) => email.id));
        previousEmailIds.current = nextIds;
        hasLoadedEmails.current = true;
        setEmails(incoming);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Initial fetch
  useEffect(() => {
    const triggerFetch = () => fetchEmails();
    triggerFetch();
  }, [fetchEmails]);

  useEffect(() => {
    previousEmailIds.current = new Set();
    hasLoadedEmails.current = false;
  }, [address]);

  useEffect(() => {
    const loadReadIds = () => {
      if (!address) return;
      const storageKey = `dispo_read_${address}`;
      const savedReadIds = localStorage.getItem(storageKey);
      if (!savedReadIds) {
        setReadEmailIds(new Set());
        return;
      }
      try {
        const parsed = JSON.parse(savedReadIds);
        if (Array.isArray(parsed)) {
          setReadEmailIds(new Set(parsed));
        } else {
          setReadEmailIds(new Set());
        }
      } catch {
        setReadEmailIds(new Set());
      }
    };
    loadReadIds();
  }, [address]);

  useEffect(() => {
    if (!address) return;
    const storageKey = `dispo_read_${address}`;
    localStorage.setItem(storageKey, JSON.stringify(Array.from(readEmailIds)));
  }, [address, readEmailIds]);

  // Polling
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchEmails, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchEmails]);

  const openEmail = (email: Email) => {
    setSelectedEmail(email);
    setReadEmailIds((prev) => {
      if (prev.has(email.id)) return prev;
      const next = new Set(prev);
      next.add(email.id);
      return next;
    });
  };

  useEffect(() => {
    const showFilterOnQuery = () => {
      if (filterQuery) {
        setShowFilter(true);
      }
    };
    showFilterOnQuery();
  }, [filterQuery]);
  
  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      {/* Header / Controls */}
      <div className="glass-card rounded-2xl p-4 md:p-8 space-y-6 relative z-10">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="space-y-1 text-center md:text-left">
            <h2 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(to right, var(--accent, #60a5fa), var(--accent, #c084fc))' }}>
              {t.inboxTitle}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t.inboxHintPrefix} {t.inboxHintSuffix}{' '}
              <span className="font-medium" style={{ color: 'var(--accent, #a78bfa)' }}>
                {retentionLabel || t.retentionOptions.hours24}
              </span>
              .
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${loading ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
                {loading ? t.syncing : t.live}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[120px]">
              <Input 
                      value={address.split('@')[0] || ''}
                      onChange={(e) => {
                          const val = e.target.value.replace(/[^a-zA-Z0-9._-]/g, '');
                          const currentDomain = address.split('@')[1] || domain;
                          setAddress(`${val}@${currentDomain}`);
                          localStorage.setItem('dispo_address', `${val}@${currentDomain}`);
                      }}
                      onBlur={() => addToHistory(address)}
                      className="pr-4 font-mono text-base md:text-lg bg-black/20 border-white/10 h-10 md:h-12"
                      placeholder={t.usernamePlaceholder}
                  />
            </div>
            <div className="relative flex items-center shrink-0">
                 <span className="text-muted-foreground text-base md:text-lg px-2">@</span>
            </div>
             <div className="relative max-w-[calc(100vw-2rem)] md:max-w-[250px] shrink-0">
                 <DomainSelector
                    domains={systemDomains}
                    selectedDomain={domain}
                    onSelectDomain={(d) => {
                        setDomain(d);
                        const currentUser = address.split('@')[0] || '';
                        const newAddr = `${currentUser}@${d}`;
                        setAddress(newAddr);
                        localStorage.setItem('dispo_address', newAddr);
                        addToHistory(newAddr);
                        setShowDomainMenu(false);
                    }}
                    showDomainMenu={showDomainMenu}
                    setShowDomainMenu={setShowDomainMenu}
                 />
             </div>
             <button
               type="button"
               onClick={() => setShowRequestModal(true)}
               className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 h-10 md:h-12 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
               title="Request a new domain"
             >
               <Plus className="h-4 w-4" />
               <span className="hidden sm:inline">Request domain</span>
             </button>
             {showRequestModal && (
    <RequestDomainModal
      onClose={() => setShowRequestModal(false)}
      nameservers={
        process.env.NEXT_PUBLIC_CLOUDFLARE_ACCOUNT_NAMESERVERS
          ? process.env.NEXT_PUBLIC_CLOUDFLARE_ACCOUNT_NAMESERVERS.split(',').map((ns) => ns.trim()).filter(Boolean)
          : undefined
      }
    />
  )}
            <HistoryDropdown
                history={history}
                activeAddress={address}
                show={showHistory}
                setShow={setShowHistory}
                hasEmails={emails.length > 0}
                t={t}
                onClearAll={() => {
                    setHistory([]);
                    localStorage.removeItem('dispo_history');
                }}
                onRestore={(histAddr) => {
                    setAddress(histAddr);
                    const parts = histAddr.split('@');
                    if(parts[1]) setDomain(parts[1]);
                    localStorage.setItem('dispo_address', histAddr);
                    setShowHistory(false);
                }}
                onRemove={(histAddr) => {
                    const newHist = history.filter(h => h !== histAddr);
                    setHistory(newHist);
                    localStorage.setItem('dispo_history', JSON.stringify(newHist));
                }}
            />
            <Button onClick={copyAddress} variant="secondary" size="lg" className="h-10 md:h-12 shrink-0">
              <Copy className="mr-2 h-4 w-4" /> {t.copy}
            </Button>
            <Button onClick={generateAddress} variant="outline" size="lg" className="h-10 md:h-12 border-white/10 hover:bg-white/5 shrink-0">
              <RefreshCw className="mr-2 h-4 w-4" /> {t.newAlias}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {domainStatusLoading ? (
              <span>{t.domainStatusChecking}</span>
            ) : domainExpirationDate ? (
              isDomainExpired ? (
                <span className="text-red-300">{t.domainStatusExpired}</span>
              ) : (
                <span>
                  {t.domainStatusEndsOn}{' '}
                  <span className="font-medium" style={{ color: 'var(--accent, #c4b5fd)' }}>
                    {domainExpirationDate.toLocaleDateString()}
                  </span>
                </span>
              )
            ) : (
              <span>{t.domainStatusUnavailable}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-auto md:h-[80vh]">
        {/* Email List */}
        <EmailList
          emails={emails}
          selectedEmailId={selectedEmail?.id ?? null}
          onSelectEmail={openEmail}
          loading={loading}
          filterText={filterQuery}
          setFilterText={setFilterQuery}
          showFilter={showFilter}
          setShowFilter={setShowFilter}
          readEmailIds={readEmailIds}
          fetchEmails={fetchEmails}
          t={t}
        />

        {/* Email Content */}
        <EmailViewer
          email={selectedEmail}
          address={address}
          t={t}
          downloadEmail={downloadEmail}
          downloadAttachment={downloadAttachment}
          resolveInlineImages={resolveInlineImages}
          stripEmailStyles={stripEmailStyles}
          highlightVerificationCodes={highlightVerificationCodes}
        />
      </div>
    </div>
  );
}
