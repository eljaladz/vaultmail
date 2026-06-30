import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  process.env.MONGODB_URI = 'mongodb://test-server/vaultmail';
  process.env.MONGODB_DB = 'vaultmail';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

const createStorageMock = () => {
  const store = new Map<string, unknown>();
  const ttl = new Map<string, number>();
  const storage = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return 'OK';
    }),
    setIfAbsent: vi.fn(async (key: string, value: unknown, options?: { ex?: number }) => {
      if (store.has(key)) return false;
      store.set(key, value);
      if (options?.ex) {
        ttl.set(key, options.ex);
      }
      return true;
    }),
    del: vi.fn(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      ttl.delete(key);
      return existed ? 1 : 0;
    }),
    exists: vi.fn(async (key: string) => store.has(key)),
    expire: vi.fn(async () => 1),
    _store: store
  };
  return { storage, store };
};

describe('api-key module', () => {
  let mockStorage: ReturnType<typeof createStorageMock>;

  beforeEach(async () => {
    mockStorage = createStorageMock();
    vi.doMock('@/lib/storage', () => ({ storage: mockStorage.storage }));
  });

  afterEach(() => {
    vi.doUnmock('@/lib/storage');
  });

  describe('generateApiKey', () => {
    it('returns a string with the vmail_ prefix', async () => {
      const { generateApiKey } = await import('@/lib/api-key');
      const key = generateApiKey();
      expect(key).toMatch(/^vmail_/);
    });

    it('produces a key at least 49 characters long (prefix + 24 bytes hex)', async () => {
      const { generateApiKey } = await import('@/lib/api-key');
      const key = generateApiKey();
      expect(key.length).toBeGreaterThanOrEqual(49);
    });

    it('produces unique keys on successive calls', async () => {
      const { generateApiKey } = await import('@/lib/api-key');
      const a = generateApiKey();
      const b = generateApiKey();
      expect(a).not.toBe(b);
    });
  });

  describe('hashApiKey', () => {
    it('is deterministic for the same input', async () => {
      const { hashApiKey } = await import('@/lib/api-key');
      expect(hashApiKey('vmail_abc')).toBe(hashApiKey('vmail_abc'));
    });

    it('produces different hashes for different inputs', async () => {
      const { hashApiKey } = await import('@/lib/api-key');
      expect(hashApiKey('vmail_abc')).not.toBe(hashApiKey('vmail_def'));
    });

    it('produces a 64-character hex digest (sha256)', async () => {
      const { hashApiKey } = await import('@/lib/api-key');
      const hash = hashApiKey('vmail_test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('getApiKeys', () => {
    it('returns an empty array when storage has no value', async () => {
      const { getApiKeys } = await import('@/lib/api-key');
      const keys = await getApiKeys();
      expect(keys).toEqual([]);
    });

    it('parses a stored JSON string into an array', async () => {
      const { storage } = mockStorage;
      const stored = JSON.stringify([
        {
          hash: 'abc123',
          label: 'test',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]);
      await storage.set('settings:api-keys', stored);
      const { getApiKeys } = await import('@/lib/api-key');
      const keys = await getApiKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0].hash).toBe('abc123');
      expect(keys[0].label).toBe('test');
    });

    it('returns an empty array for malformed JSON string', async () => {
      const { storage } = mockStorage;
      await storage.set('settings:api-keys', 'not-json');
      const { getApiKeys } = await import('@/lib/api-key');
      const keys = await getApiKeys();
      expect(keys).toEqual([]);
    });

    it('returns an empty array when stored value is not an array', async () => {
      const { storage } = mockStorage;
      await storage.set('settings:api-keys', JSON.stringify({ not: 'array' }));
      const { getApiKeys } = await import('@/lib/api-key');
      const keys = await getApiKeys();
      expect(keys).toEqual([]);
    });

    it('returns an array as-is when stored value is already an array', async () => {
      const { storage } = mockStorage;
      const stored = [
        {
          hash: 'xyz',
          label: 'direct',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ];
      await storage.set('settings:api-keys', stored);
      const { getApiKeys } = await import('@/lib/api-key');
      const keys = await getApiKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0].hash).toBe('xyz');
    });
  });

  describe('addApiKey', () => {
    it('adds an entry and returns the plain key', async () => {
      const { addApiKey } = await import('@/lib/api-key');
      const plain = await addApiKey('my-key');
      expect(plain).toMatch(/^vmail_/);
      const { getApiKeys } = await import('@/lib/api-key');
      const keys = await getApiKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0].label).toBe('my-key');
    });

    it('stores a hash matching the returned plain key', async () => {
      const { addApiKey, hashApiKey, getApiKeys } = await import(
        '@/lib/api-key'
      );
      const plain = await addApiKey('my-key');
      const keys = await getApiKeys();
      expect(keys[0].hash).toBe(hashApiKey(plain));
    });

    it('truncates label to 50 characters', async () => {
      const longLabel = 'a'.repeat(120);
      const { addApiKey, getApiKeys } = await import('@/lib/api-key');
      await addApiKey(longLabel);
      const keys = await getApiKeys();
      expect(keys[0].label).toHaveLength(50);
    });

    it('sets createdAt to an ISO string', async () => {
      const { addApiKey, getApiKeys } = await import('@/lib/api-key');
      await addApiKey('my-key');
      const keys = await getApiKeys();
      const created = new Date(keys[0].createdAt);
      expect(Number.isNaN(created.getTime())).toBe(false);
    });

    it('appends to existing keys without overwriting', async () => {
      const { addApiKey, getApiKeys } = await import('@/lib/api-key');
      await addApiKey('first');
      await addApiKey('second');
      const keys = await getApiKeys();
      expect(keys).toHaveLength(2);
      expect(keys[0].label).toBe('first');
      expect(keys[1].label).toBe('second');
    });
  });

  describe('revokeApiKey', () => {
    it('returns true and removes the key when hash matches', async () => {
      const { addApiKey, revokeApiKey, getApiKeys, hashApiKey } = await import(
        '@/lib/api-key'
      );
      const plain = await addApiKey('my-key');
      const hash = hashApiKey(plain);
      const revoked = await revokeApiKey(hash);
      expect(revoked).toBe(true);
      const keys = await getApiKeys();
      expect(keys).toHaveLength(0);
    });

    it('returns false when the hash is unknown', async () => {
      const { revokeApiKey } = await import('@/lib/api-key');
      const revoked = await revokeApiKey('nonexistent');
      expect(revoked).toBe(false);
    });

    it('only removes the matching key, leaves others intact', async () => {
      const {
        addApiKey,
        revokeApiKey,
        getApiKeys,
        hashApiKey
      } = await import('@/lib/api-key');
      const plain1 = await addApiKey('first');
      await addApiKey('second');
      await revokeApiKey(hashApiKey(plain1));
      const keys = await getApiKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0].label).toBe('second');
    });
  });

  describe('validateApiKey', () => {
    it('returns true for a valid generated key', async () => {
      const { addApiKey, validateApiKey } = await import('@/lib/api-key');
      const plain = await addApiKey('my-key');
      const valid = await validateApiKey(plain);
      expect(valid).toBe(true);
    });

    it('returns false for an invalid key (wrong content)', async () => {
      const { addApiKey, validateApiKey } = await import('@/lib/api-key');
      await addApiKey('my-key');
      const valid = await validateApiKey('vmail_notreal');
      expect(valid).toBe(false);
    });

    it('returns false for a key with the wrong prefix', async () => {
      const { addApiKey, validateApiKey } = await import('@/lib/api-key');
      await addApiKey('my-key');
      const valid = await validateApiKey('other_prefix_something');
      expect(valid).toBe(false);
    });

    it('returns false for an empty string', async () => {
      const { validateApiKey } = await import('@/lib/api-key');
      const valid = await validateApiKey('');
      expect(valid).toBe(false);
    });

    it('updates lastUsedAt on successful validation', async () => {
      const { addApiKey, validateApiKey, getApiKeys } = await import(
        '@/lib/api-key'
      );
      const plain = await addApiKey('my-key');
      await validateApiKey(plain);
      const keys = await getApiKeys();
      expect(keys[0].lastUsedAt).toBeDefined();
      const lastUsed = new Date(keys[0].lastUsedAt as string);
      expect(Number.isNaN(lastUsed.getTime())).toBe(false);
    });

    it('does not set lastUsedAt when validation fails', async () => {
      const { addApiKey, validateApiKey, getApiKeys } = await import(
        '@/lib/api-key'
      );
      await addApiKey('my-key');
      await validateApiKey('vmail_invalid');
      const keys = await getApiKeys();
      expect(keys[0].lastUsedAt).toBeUndefined();
    });
  });

  describe('isApiKeyConfigured', () => {
    it('returns false when no keys exist', async () => {
      const { isApiKeyConfigured } = await import('@/lib/api-key');
      const configured = await isApiKeyConfigured();
      expect(configured).toBe(false);
    });

    it('returns true when at least one key exists', async () => {
      const { addApiKey, isApiKeyConfigured } = await import('@/lib/api-key');
      await addApiKey('my-key');
      const configured = await isApiKeyConfigured();
      expect(configured).toBe(true);
    });

    it('returns false again after all keys are revoked', async () => {
      const {
        addApiKey,
        revokeApiKey,
        isApiKeyConfigured,
        hashApiKey
      } = await import('@/lib/api-key');
      const plain = await addApiKey('my-key');
      await revokeApiKey(hashApiKey(plain));
      const configured = await isApiKeyConfigured();
      expect(configured).toBe(false);
    });
  });
});
