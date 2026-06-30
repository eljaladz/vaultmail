import crypto from 'crypto';
import { storage } from '@/lib/storage';
import { API_KEYS_SETTINGS_KEY } from '@/lib/admin-auth';
import { withPrefix } from '@/lib/storage-keys';

export const API_KEY_COOKIE = 'vaultmail_api_key';

export type ApiKeyEntry = {
  hash: string;
  label: string;
  createdAt: string;
  lastUsedAt?: string;
};

const PREFIX = 'vmail_';
const API_KEYS_WRITE_LOCK = withPrefix('api-key:write-lock');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withWriteLock = async <T>(action: () => Promise<T>): Promise<T> => {
  const lockKey = API_KEYS_WRITE_LOCK;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const acquired = await storage.setIfAbsent(lockKey, '1', { ex: 5 });
    if (acquired) {
      try {
        return await action();
      } finally {
        await storage.del(lockKey);
      }
    }
    await sleep(50);
  }
  throw new Error('Could not acquire API key write lock');
};

export const generateApiKey = () => {
  const random = crypto.randomBytes(24).toString('hex');
  return `${PREFIX}${random}`;
};

export const hashApiKey = (key: string) =>
  crypto.createHash('sha256').update(key).digest('hex');

const parseApiKeys = (value: unknown): ApiKeyEntry[] => {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as ApiKeyEntry[]) : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value as ApiKeyEntry[];
  return [];
};

export const getApiKeys = async (): Promise<ApiKeyEntry[]> => {
  const raw = await storage.get(API_KEYS_SETTINGS_KEY);
  return parseApiKeys(raw);
};

export const addApiKey = async (label: string): Promise<string> => {
  const plainKey = generateApiKey();
  const entry: ApiKeyEntry = {
    hash: hashApiKey(plainKey),
    label: label.slice(0, 50),
    createdAt: new Date().toISOString(),
  };
  await withWriteLock(async () => {
    const keys = await getApiKeys();
    keys.push(entry);
    await storage.set(API_KEYS_SETTINGS_KEY, keys);
  });
  return plainKey;
};

export const revokeApiKey = async (hash: string): Promise<boolean> =>
  withWriteLock(async () => {
    const keys = await getApiKeys();
    const filtered = keys.filter((k) => k.hash !== hash);
    if (filtered.length === keys.length) return false;
    await storage.set(API_KEYS_SETTINGS_KEY, filtered);
    return true;
  });

export const validateApiKey = async (plainKey: string): Promise<boolean> => {
  if (!plainKey || !plainKey.startsWith(PREFIX)) return false;
  const keys = await getApiKeys();
  const hash = hashApiKey(plainKey);
  const found = keys.find((k) => k.hash === hash);
  if (!found) return false;
  found.lastUsedAt = new Date().toISOString();
  await storage.set(API_KEYS_SETTINGS_KEY, keys);
  return true;
};

export const isApiKeyConfigured = async (): Promise<boolean> => {
  const keys = await getApiKeys();
  return keys.length > 0;
};
