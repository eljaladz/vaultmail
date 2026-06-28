import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cookies } from 'next/headers';
import { requireAdminRequest } from '@/lib/admin-request';
import { ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { storage } from '@/lib/storage';

const mockCookies = vi.mocked(cookies);
const mockStorageExists = vi.mocked(storage.exists);

vi.mock('next/headers', () => ({
  cookies: vi.fn()
}));

vi.mock('@/lib/storage', () => ({
  storage: {
    exists: vi.fn()
  }
}));

const mockRequest = (): Request => {
  return new Request('https://example.com/api/admin/test', {
    method: 'POST',
    headers: {
      host: 'example.com',
      origin: 'https://example.com',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'x-vaultmail-ui': '1',
      'x-csrf-token': 'test-token',
      cookie: `${ADMIN_SESSION_COOKIE}=test-token; vaultmail_csrf=${encodeURIComponent('test-token')}`
    }
  });
};

describe('requireAdminRequest', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockStorageExists.mockResolvedValue(false);
  });

  it('returns 401 when admin session cookie is missing', async () => {
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) } as unknown as Awaited<ReturnType<typeof cookies>>);
    const result = await requireAdminRequest(mockRequest());
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('returns 401 when admin session token is invalid', async () => {
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'invalid-token' })
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    mockStorageExists.mockResolvedValue(false);
    const result = await requireAdminRequest(mockRequest());
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('proceeds when admin session token is valid', async () => {
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'valid-token' })
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    mockStorageExists.mockResolvedValue(true);
    const result = await requireAdminRequest(mockRequest());
    expect(result.ok).toBe(true);
  });
});
