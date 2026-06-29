import 'server-only';

import crypto from 'node:crypto';
import { storage } from '@/lib/storage';
import { withPrefix } from '@/lib/storage-keys';

export type DomainRequestStatus = 'pending' | 'approved' | 'rejected';

export type DomainRequest = {
  id: string;
  domain: string;
  normalizedDomain: string;
  type: 'add' | 'remove';
  status: DomainRequestStatus;
  requesterIpHash: string;
  turnstileVerified: boolean;
  requestedAt: string;
  updatedAt: string;
  adminNote?: string;
  onboardingStatus?: 'not-started' | 'started' | 'failed';
  onboardingError?: string;
};

const REQUEST_PREFIX = withPrefix('domain:request:');
const BY_DOMAIN_PREFIX = withPrefix('domain:request-by-domain:');

const requestKey = (id: string) => `${REQUEST_PREFIX}${id}`;
const byDomainKey = (normalizedDomain: string, type: string) =>
  `${BY_DOMAIN_PREFIX}${type}:${normalizedDomain}`;
const HOSTNAME_REGEX = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export const normalizeDomain = (domain: string): string =>
  domain.toLowerCase().trim().replace(/\.+$/, '');

export const isValidDomain = (domain: string): boolean => {
  if (!domain || domain.length > 253) return false;
  if (domain.includes('://') || domain.includes('/') || domain.includes('?')) return false;
  if (domain.includes(' ') || domain.includes('\t')) return false;
  return HOSTNAME_REGEX.test(domain);
};

export const createDomainRequest = async (
  domain: string,
  type: 'add' | 'remove',
  requesterIpHash: string,
  turnstileVerified: boolean
): Promise<{ request: DomainRequest; created: boolean }> => {
  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) {
    throw new Error('Invalid domain');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const request: DomainRequest = {
    id,
    domain: normalizedDomain,
    normalizedDomain,
    type,
    status: 'pending',
    requesterIpHash,
    turnstileVerified,
    requestedAt: now,
    updatedAt: now,
    onboardingStatus: 'not-started',
  };

  const dedupeKey = byDomainKey(normalizedDomain, type);

  // Atomically insert the request record AS the dedupe value in one operation.
  // If setIfAbsent succeeds, the request is both created AND deduped atomically.
  const acquired = await storage.setIfAbsent(dedupeKey, request, { ex: 86400 });
  if (!acquired) {
    const existingRaw = await storage.get(dedupeKey);
    let existing: DomainRequest | null = null;
    if (typeof existingRaw === 'string') {
      try { existing = JSON.parse(existingRaw); } catch { existing = null; }
    } else if (typeof existingRaw === 'object') {
      existing = existingRaw as DomainRequest;
    }

    if (existing && existing.status === 'pending') {
      return { request: existing, created: false };
    }

    // Previous request was approved/rejected — atomically replace only if still non-pending
    const replaced = await storage.replaceIfValueNotMatching(
      dedupeKey,
      'status',
      'pending',
      request,
      { ex: 86400 }
    );
    if (!replaced) {
      // Another caller already replaced it with a pending request
      const retryRaw = await storage.get(dedupeKey);
      let retry: DomainRequest | null = null;
      if (typeof retryRaw === 'string') {
        try { retry = JSON.parse(retryRaw); } catch { retry = null; }
      } else if (typeof retryRaw === 'object') {
        retry = retryRaw as DomainRequest;
      }
      if (retry && retry.status === 'pending') {
        return { request: retry, created: false };
      }
      return { request: request, created: false };
    }
  }

  // Also store by request ID for admin lookups
  await storage.set(requestKey(id), request);
  return { request, created: true };
};

export const getDomainRequest = async (id: string): Promise<DomainRequest | null> => {
  const raw = await storage.get(requestKey(id));
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as DomainRequest;
    } catch {
      return null;
    }
  }
  return raw as DomainRequest;
};

export const listDomainRequests = async (status?: DomainRequestStatus): Promise<DomainRequest[]> => {
  const pattern = `${REQUEST_PREFIX}*`;
  const keys = await storage.kvKeys(pattern);
  const requests: DomainRequest[] = [];
  for (const key of keys) {
    const raw = await storage.get(key);
    if (!raw) continue;
    let parsed: DomainRequest | null = null;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      continue;
    }
    if (parsed && (!status || parsed.status === status)) {
      requests.push(parsed);
    }
  }
  return requests.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
};

export const updateDomainRequest = async (
  id: string,
  updates: Partial<Pick<DomainRequest, 'status' | 'adminNote' | 'onboardingStatus' | 'onboardingError'>>
): Promise<DomainRequest | null> => {
  const existing = await getDomainRequest(id);
  if (!existing) return null;
  const updated: DomainRequest = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await storage.set(requestKey(id), updated);

  const dedupeKey = byDomainKey(existing.normalizedDomain, existing.type);
  await storage.set(dedupeKey, updated, { ex: 86400 });

  return updated;
};

export const deleteDomainRequest = async (id: string): Promise<void> => {
  const existing = await getDomainRequest(id);
  if (existing) {
    await storage.del(byDomainKey(existing.normalizedDomain, existing.type));
  }
  await storage.del(requestKey(id));
};
