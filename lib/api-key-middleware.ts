import crypto from 'crypto';
import { storage } from '@/lib/storage';
import {
  API_KEY_COOKIE,
  validateApiKey
} from '@/lib/api-key';
import {
  HOMEPAGE_SESSION_COOKIE,
  validateHomepageSession,
} from '@/lib/homepage-session';
import { getHomepageLockSettings } from '@/lib/homepage-lock';
import { requireBrowserUiRequest } from '@/lib/browser-request-guard';

type AuthMode = 'api-key' | 'homepage-session' | 'anonymous' | 'denied';

type AuthResult = {
  mode: AuthMode;
  rateLimitBlocked: boolean;
  browserGuardBlocked?: boolean;
  reason?: string;
};

type AuthorizeOptions = {
  category?: RateLimitCategory;
  browserOnly?: boolean;
  allowApiKeyBypassBrowserGuard?: boolean;
  skipHomepageLockDenial?: boolean;
};

type RateLimitCategory =
  | 'inbox.read'
  | 'inbox.delete'
  | 'email.create'
  | 'download.read'
  | 'config.read'
  | 'favicon.read'
  | 'breach.check'
  | 'domain.expiration'
  | 'domain.request'
  | 'homepage.auth'
  | 'session.create'
  | 'session.read'
  | 'session.delete'
  | 'admin.login';

type Mode = 'anonymous' | 'session' | 'api-key';

const RATE_POLICIES: Record<RateLimitCategory, Record<Mode, { max: number; window: number }>> = {
  'inbox.read':          { anonymous: { max: 30, window: 60 },  session: { max: 30, window: 60 },  'api-key': { max: 60, window: 60 } },
  'inbox.delete':        { anonymous: { max: 10, window: 60 },  session: { max: 20, window: 60 },  'api-key': { max: 60, window: 60 } },
  'email.create':        { anonymous: { max: 5,  window: 60 },  session: { max: 5,  window: 60 },  'api-key': { max: 30, window: 60 } },
  'download.read':       { anonymous: { max: 10, window: 60 },  session: { max: 20, window: 60 },  'api-key': { max: 60, window: 60 } },
  'config.read':         { anonymous: { max: 60, window: 60 },  session: { max: 120, window: 60 }, 'api-key': { max: 240, window: 60 } },
  'favicon.read':        { anonymous: { max: 120, window: 60 }, session: { max: 120, window: 60 }, 'api-key': { max: 240, window: 60 } },
  'breach.check':        { anonymous: { max: 5,  window: 60 },  session: { max: 10, window: 60 },  'api-key': { max: 30, window: 60 } },
  'domain.expiration':   { anonymous: { max: 10, window: 60 },  session: { max: 15, window: 60 },  'api-key': { max: 30, window: 60 } },
  'domain.request':      { anonymous: { max: 3,  window: 300 }, session: { max: 5,  window: 300 }, 'api-key': { max: 10, window: 300 } },
  'homepage.auth':       { anonymous: { max: 5,  window: 60 },  session: { max: 5,  window: 60 },  'api-key': { max: 5,  window: 60 } },
  'admin.login':         { anonymous: { max: 5,  window: 60 },  session: { max: 5,  window: 60 },  'api-key': { max: 5,  window: 60 } },
  'session.create':      { anonymous: { max: 10, window: 60 },  session: { max: 10, window: 60 },  'api-key': { max: 30, window: 60 } },
  'session.read':        { anonymous: { max: 60, window: 60 },  session: { max: 120, window: 60 }, 'api-key': { max: 120, window: 60 } },
  'session.delete':      { anonymous: { max: 30, window: 60 },  session: { max: 30, window: 60 },  'api-key': { max: 30, window: 60 } },
};

const GLOBAL_POLICIES: Record<Mode, { max: number; window: number }> = {
  anonymous: { max: 300, window: 60 },
  session:   { max: 300, window: 60 },
  'api-key': { max: 600, window: 60 },
};

const getClientIp = (request: Request) => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || 'unknown';
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
};

const parseCookieValue = (cookieHeader: string, name: string): string | null => {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq).trim() === name) {
      return trimmed.slice(eq + 1).trim();
    }
  }
  return null;
};

const checkRateLimitByKey = async (
  key: string,
  max: number,
  windowSeconds: number
): Promise<boolean> => {
  const result = await storage.atomicIncrement(key, { ex: windowSeconds });
  return result.count > max;
};

const getIdentityHash = (mode: AuthMode, request: Request, apiKeyToken?: string, sessionToken?: string): string => {
  if (mode === 'api-key' && apiKeyToken) {
    return crypto.createHash('sha256').update(apiKeyToken).digest('hex').slice(0, 16);
  }
  if (mode === 'homepage-session' && sessionToken) {
    return crypto.createHash('sha256').update(sessionToken).digest('hex').slice(0, 16);
  }
  return getClientIp(request);
};

const modeToPolicyKey = (mode: AuthMode): Mode => {
  if (mode === 'api-key') return 'api-key';
  if (mode === 'homepage-session') return 'session';
  return 'anonymous';
};

export const authorizeApiRequest = async (
  request: Request,
  options?: AuthorizeOptions
): Promise<AuthResult> => {
  const cookieHeader = request.headers.get('cookie') || '';
  const category = options?.category || 'config.read';

  const apiKeyProvided =
    request.headers.get('x-api-key')?.trim() ||
    parseCookieValue(cookieHeader, API_KEY_COOKIE);
  let queryKey: string | null = null;
  try {
    queryKey = new URL(request.url).searchParams.get('key')?.trim() || null;
  } catch {
  }
  const apiKeyToken = apiKeyProvided || queryKey;

  let mode: AuthMode;
  let identityHash: string;

  if (apiKeyToken) {
    const valid = await validateApiKey(apiKeyToken);
    if (valid) {
      mode = 'api-key';
    } else {
      return { mode: 'denied', rateLimitBlocked: false };
    }
    identityHash = getIdentityHash(mode, request, apiKeyToken);
  } else {
    const sessionToken = parseCookieValue(cookieHeader, HOMEPAGE_SESSION_COOKIE);
    if (sessionToken) {
      const valid = await validateHomepageSession(sessionToken);
      if (valid) {
        mode = 'homepage-session';
        identityHash = getIdentityHash(mode, request, undefined, sessionToken);
      } else {
        const lockSettings = await getHomepageLockSettings();
        if (lockSettings.enabled && !options?.skipHomepageLockDenial) {
          return { mode: 'denied', rateLimitBlocked: false };
        }
        mode = 'anonymous';
        identityHash = getIdentityHash(mode, request);
      }
    } else {
      const lockSettings = await getHomepageLockSettings();
      if (lockSettings.enabled && !options?.skipHomepageLockDenial) {
        return { mode: 'denied', rateLimitBlocked: false };
      }
      mode = 'anonymous';
      identityHash = getIdentityHash(mode, request);
    }
  }

  if (options?.browserOnly) {
    const bypassAllowed = mode === 'api-key' && options.allowApiKeyBypassBrowserGuard;
    if (!bypassAllowed) {
      const guard = requireBrowserUiRequest(request);
      if (!guard.ok) {
        return { mode: 'denied', rateLimitBlocked: false, browserGuardBlocked: true, reason: guard.reason };
      }
    }
  }

  const policyKey = modeToPolicyKey(mode);
  const globalPolicy = GLOBAL_POLICIES[policyKey];
  const categoryPolicy = RATE_POLICIES[category]?.[policyKey] || RATE_POLICIES['config.read'][policyKey];

  const globalKey = `rl:${policyKey}:${identityHash}:global`;
  const globalBlocked = await checkRateLimitByKey(globalKey, globalPolicy.max, globalPolicy.window);
  if (globalBlocked) {
    return { mode, rateLimitBlocked: true };
  }

  const categoryKey = `rl:${policyKey}:${identityHash}:${category}`;
  const categoryBlocked = await checkRateLimitByKey(categoryKey, categoryPolicy.max, categoryPolicy.window);
  if (categoryBlocked) {
    return { mode, rateLimitBlocked: true };
  }

  return { mode, rateLimitBlocked: false };
};

export const authorizeWebhookRequest = async (request: Request): Promise<{ blocked: boolean }> => {
  const ip = getClientIp(request);
  const blocked = await checkRateLimitByKey(`webhook:rl:${ip}`, 120, 60);
  return { blocked };
};

export const authorizeCronRequest = async (): Promise<{ blocked: boolean }> => {
  const blocked = await checkRateLimitByKey('cron:rl:global', 1, 300);
  return { blocked };
};

export const checkApiRateLimit = async (
  request: Request,
  category?: RateLimitCategory,
  options?: Omit<AuthorizeOptions, 'category'>
): Promise<{ blocked: boolean; reason?: string }> => {
  const result = await authorizeApiRequest(request, { category, ...options });
  return { blocked: result.rateLimitBlocked || result.mode === 'denied', reason: result.reason };
};

export const validateApiRequest = async (
  request: Request,
  category?: RateLimitCategory,
  options?: Omit<AuthorizeOptions, 'category'>
): Promise<boolean> => {
  const result = await authorizeApiRequest(request, { category, ...options });
  return result.mode !== 'denied' && !result.rateLimitBlocked;
};

export const registerApiRateLimitFailure = async (): Promise<{ blocked: boolean }> => {
  return { blocked: false };
};

export const resetApiRateLimit = async () => {};
