import 'server-only';

import crypto from 'node:crypto';
import { storage } from '@/lib/storage';
import { withPrefix } from '@/lib/storage-keys';

export type ApiKeyRequestStatus = 'pending' | 'approved' | 'rejected';

export type ApiKeyRequest = {
  id: string;
  label: string;
  purpose: string;
  status: ApiKeyRequestStatus;
  requesterIpHash: string;
  turnstileVerified: boolean;
  requestedAt: string;
  updatedAt: string;
  adminNote?: string;
  keyHash?: string;
};

const REQUEST_PREFIX = withPrefix('api-key:request:');
const BY_IP_PREFIX = withPrefix('api-key:request-by-ip:');

const requestKey = (id: string) => `${REQUEST_PREFIX}${id}`;
const byIpKey = (ipHash: string) => `${BY_IP_PREFIX}${ipHash}`;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_EXPIRY_DAYS = 30;
const LABEL_MAX_LENGTH = 50;
const PURPOSE_MAX_LENGTH = 255;

export const isValidApiKeyRequestLabel = (label: string): boolean =>
  typeof label === 'string' && label.trim().length > 0 && label.trim().length <= LABEL_MAX_LENGTH;

export const sanitizeApiKeyRequestPurpose = (purpose: unknown): string => {
  if (typeof purpose !== 'string') return '';
  return purpose.trim().slice(0, PURPOSE_MAX_LENGTH);
};

export const createApiKeyRequest = async (
  label: string,
  purpose: string,
  requesterIpHash: string,
  turnstileVerified: boolean
): Promise<{ request: ApiKeyRequest; created: boolean }> => {
  const trimmedLabel = label.trim();
  if (!isValidApiKeyRequestLabel(trimmedLabel)) {
    throw new Error('Invalid label');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const request: ApiKeyRequest = {
    id,
    label: trimmedLabel,
    purpose: sanitizeApiKeyRequestPurpose(purpose),
    status: 'pending',
    requesterIpHash,
    turnstileVerified,
    requestedAt: now,
    updatedAt: now,
  };

  const dedupeKey = byIpKey(requesterIpHash);

  await storage.set(requestKey(id), request);

  const acquired = await storage.setIfAbsent(dedupeKey, request, { ex: 86400 });
  if (acquired) {
    return { request, created: true };
  }

  const existingRaw = await storage.get(dedupeKey);
  let existing: ApiKeyRequest | null = null;
  if (typeof existingRaw === 'string') {
    try { existing = JSON.parse(existingRaw); } catch { existing = null; }
  } else if (typeof existingRaw === 'object') {
    existing = existingRaw as ApiKeyRequest;
  }

  if (existing && existing.status === 'pending') {
    await storage.del(requestKey(id));
    return { request: existing, created: false };
  }

  const replaced = await storage.replaceIfValueNotMatching(
    dedupeKey,
    'status',
    'pending',
    request,
    { ex: 86400 }
  );
  if (!replaced) {
    const retryRaw = await storage.get(dedupeKey);
    let retry: ApiKeyRequest | null = null;
    if (typeof retryRaw === 'string') {
      try { retry = JSON.parse(retryRaw); } catch { retry = null; }
    } else if (typeof retryRaw === 'object') {
      retry = retryRaw as ApiKeyRequest;
    }
    if (retry && retry.status === 'pending') {
      await storage.del(requestKey(id));
      return { request: retry, created: false };
    }
    if (retry) {
      await storage.del(requestKey(id));
      return { request: retry, created: false };
    }
    throw new Error('Could not create request');
  }

  return { request, created: true };
};

export const getApiKeyRequest = async (id: string): Promise<ApiKeyRequest | null> => {
  if (!UUID_REGEX.test(id)) return null;
  const raw = await storage.get(requestKey(id));
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ApiKeyRequest;
    } catch {
      return null;
    }
  }
  return raw as ApiKeyRequest;
};

export const listApiKeyRequests = async (status?: ApiKeyRequestStatus): Promise<ApiKeyRequest[]> => {
  const pattern = `${REQUEST_PREFIX}*`;
  const keys = await storage.kvKeys(pattern);
  const requests: ApiKeyRequest[] = [];
  for (const key of keys) {
    const raw = await storage.get(key);
    if (!raw) continue;
    let parsed: ApiKeyRequest | null = null;
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

export const updateApiKeyRequest = async (
  id: string,
  updates: Partial<Pick<ApiKeyRequest, 'status' | 'adminNote' | 'keyHash'>>
): Promise<ApiKeyRequest | null> => {
  const existing = await getApiKeyRequest(id);
  if (!existing) return null;
  const updated: ApiKeyRequest = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await storage.set(requestKey(id), updated);
  await storage.set(byIpKey(existing.requesterIpHash), updated, { ex: 86400 });
  return updated;
};

export const deleteApiKeyRequest = async (id: string): Promise<void> => {
  const existing = await getApiKeyRequest(id);
  if (existing) {
    await storage.del(byIpKey(existing.requesterIpHash));
  }
  await storage.del(requestKey(id));
};

export type PublicApiKeyRequestStatus = {
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  label: string;
  requestedAt: string;
  updatedAt?: string;
  message?: string;
};

export const getPublicApiKeyRequestStatus = async (
  token: string
): Promise<PublicApiKeyRequestStatus | null> => {
  if (!UUID_REGEX.test(token)) return null;
  const request = await getApiKeyRequest(token);
  if (!request) return null;

  const ageMs = Date.now() - new Date(request.requestedAt).getTime();
  const expiryMs = REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  if (ageMs > expiryMs) {
    return {
      status: 'expired',
      label: request.label,
      requestedAt: request.requestedAt,
      message: 'This request is no longer available.',
    };
  }

  if (request.status === 'pending') {
    return {
      status: 'pending',
      label: request.label,
      requestedAt: request.requestedAt,
      updatedAt: request.updatedAt,
      message: 'Your request is waiting for review.',
    };
  }

  if (request.status === 'rejected') {
    return {
      status: 'rejected',
      label: request.label,
      requestedAt: request.requestedAt,
      updatedAt: request.updatedAt,
      message: 'Your request was not approved.',
    };
  }

  return {
    status: 'approved',
    label: request.label,
    requestedAt: request.requestedAt,
    updatedAt: request.updatedAt,
    message: 'Your request was approved. Contact the admin for your API key.',
  };
};
