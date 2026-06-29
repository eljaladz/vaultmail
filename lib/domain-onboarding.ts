import 'server-only';

import { storage } from '@/lib/storage';
import { withPrefix } from '@/lib/storage-keys';
import {
  CloudflareApiError,
  type CfZone,
  createZone,
  deleteZone,
  enableEmailRouting,
  findZoneByName,
  getZone,
  setCatchAllRule,
  triggerActivationCheck,
} from '@/lib/cloudflare-zones';
import { DOMAINS_SETTINGS_KEY, DOMAINS_CONFIG_SETTINGS_KEY } from '@/lib/admin-auth';
import { normalizeDomains, parseDomains } from '@/lib/domains';
import type { MasterDomainConfig } from '@/lib/domain-config';

export type OnboardingStep =
  | 'pending_ns'
  | 'active'
  | 'email_routing_enabled'
  | 'catch_all_configured'
  | 'added_to_app'
  | 'failed_retryable'
  | 'failed_terminal';

export type OnboardingSource = 'admin' | 'user-request';

export type OnboardingRecord = {
  domain: string;
  zoneId: string | null;
  nameservers: string[] | null;
  cfStatus: string | null;
  step: OnboardingStep;
  source: OnboardingSource;
  error?: { code: number; message: string; retryable: boolean };
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
  removedFromAppAt?: string | null;
};

const ONBOARDING_PREFIX = withPrefix('domain:onboarding:');
const onboardingKey = (domain: string) => `${ONBOARDING_PREFIX}${domain}`;
const lockKey = (domain: string) => `${withPrefix('domain:onboarding-lock:')}${domain}`;
const DOMAINS_GLOBAL_LOCK_KEY = withPrefix('domain:settings-domains-lock');
const LOCK_TTL_SECONDS = 60;
const WORKER_NAME = 'dispomail-forwarder';

const nowIso = () => new Date().toISOString();

const HOSTNAME_REGEX = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const normalizeDomain = (domain: string): string =>
  domain.toLowerCase().trim().replace(/\.+$/, '');

const isValidDomain = (domain: string): boolean => {
  if (!domain || domain.length > 253) return false;
  if (domain.includes('://') || domain.includes('/') || domain.includes('?')) return false;
  if (domain.includes(' ') || domain.includes('\t')) return false;
  return HOSTNAME_REGEX.test(domain);
};

const normalizeRecord = (raw: unknown): OnboardingRecord | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<OnboardingRecord>;
  return {
    domain: r.domain ?? '',
    zoneId: r.zoneId ?? null,
    nameservers: r.nameservers ?? null,
    cfStatus: r.cfStatus ?? null,
    step: r.step ?? 'pending_ns',
    source: r.source === 'user-request' ? 'user-request' : 'admin',
    error: r.error,
    createdAt: r.createdAt ?? nowIso(),
    updatedAt: r.updatedAt ?? nowIso(),
    lastCheckedAt: r.lastCheckedAt ?? null,
    removedFromAppAt: r.removedFromAppAt ?? undefined,
  };
};

const readRecord = async (domain: string): Promise<OnboardingRecord | null> => {
  const raw = await storage.get(onboardingKey(domain));
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return normalizeRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return normalizeRecord(raw);
};

const writeRecord = async (record: OnboardingRecord): Promise<void> => {
  await storage.set(onboardingKey(record.domain), record);
};

const releaseLock = async (domain: string): Promise<void> => {
  await storage.del(lockKey(domain));
};

const fromCfError = (err: unknown): OnboardingRecord['error'] => {
  if (err instanceof CloudflareApiError) {
    return {
      code: err.cfError.code,
      message: err.cfError.message,
      retryable: err.cfError.retryable,
    };
  }
  if (err instanceof Error) {
    return { code: 0, message: err.message, retryable: true };
  }
  return { code: 0, message: 'Unknown error', retryable: true };
};

const isTerminal = (err: unknown): boolean => {
  if (err instanceof CloudflareApiError) {
    return !err.cfError.retryable;
  }
  return false;
};

const TERMINAL_CF_STATUSES = new Set(['moved', 'deleted']);

const stepFromZoneStatus = (status: string): OnboardingStep => {
  if (status === 'active') return 'active';
  if (TERMINAL_CF_STATUSES.has(status)) return 'failed_terminal';
  return 'pending_ns';
};

const buildRecordFromZone = (zone: CfZone, source: OnboardingSource = 'admin'): OnboardingRecord => {
  const ts = nowIso();
  return {
    domain: zone.name,
    zoneId: zone.id,
    nameservers: zone.name_servers,
    cfStatus: zone.status,
    step: stepFromZoneStatus(zone.status),
    source,
    createdAt: ts,
    updatedAt: ts,
    lastCheckedAt: ts,
  };
};

const canRetryStart = (record: OnboardingRecord | null): boolean => {
  if (!record) return true;
  if (record.step === 'added_to_app') return false;
  if (record.step === 'failed_terminal') return false;
  if (record.step === 'failed_retryable' && !record.zoneId) return true;
  return false;
};

export async function startOnboarding(
  domainInput: string,
  options?: { source?: OnboardingSource }
): Promise<OnboardingRecord> {
  const domain = normalizeDomain(domainInput);
  const source: OnboardingSource = options?.source ?? 'admin';
  if (!isValidDomain(domain)) {
    throw new Error('Invalid domain. Use a valid hostname like example.com (no scheme, path, or query).');
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID is not configured');
  }

  const existing = await readRecord(domain);
  if (existing && !canRetryStart(existing)) {
    return existing;
  }

  const acquired = await storage.setIfAbsent(lockKey(domain), '1', { ex: LOCK_TTL_SECONDS });
  if (!acquired) {
    const locked = await readRecord(domain);
    if (locked) return locked;
    throw new Error('Another onboarding is in progress. Try again in a minute.');
  }

  try {
    const existingZone = await findZoneByName(domain);
    let zone: CfZone;
    if (existingZone) {
      zone = existingZone;
    } else {
      zone = await createZone(domain, accountId);
    }

    const record = buildRecordFromZone(zone, source);
    const prev = await readRecord(domain);
    if (prev) {
      record.createdAt = prev.createdAt;
      record.source = prev.source ?? source;
    }
    await writeRecord(record);
    return record;
  } catch (err) {
    const prev = await readRecord(domain);
    const record: OnboardingRecord = {
      domain,
      zoneId: prev?.zoneId ?? null,
      nameservers: prev?.nameservers ?? null,
      cfStatus: prev?.cfStatus ?? null,
      step: isTerminal(err) ? 'failed_terminal' : 'failed_retryable',
      source: prev?.source ?? source,
      error: fromCfError(err),
      createdAt: prev?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      lastCheckedAt: nowIso(),
    };
    await writeRecord(record);
    return record;
  } finally {
    await releaseLock(domain);
  }
}

export async function syncOnboarding(domainInput: string): Promise<OnboardingRecord> {
  const domain = normalizeDomain(domainInput);
  const record = await readRecord(domain);
  if (!record) {
    throw new Error(`No onboarding record for ${domain}`);
  }
  if (record.step === 'added_to_app' || record.step === 'failed_terminal') {
    return record;
  }

  const acquired = await storage.setIfAbsent(lockKey(domain), '1', { ex: LOCK_TTL_SECONDS });
  if (!acquired) {
    throw new Error('Another sync is in progress. Try again in a minute.');
  }

  try {
    if (!record.zoneId) {
      throw new Error('Missing zoneId — cannot sync. Re-add the domain to retry.');
    }

    // On retry, re-check from the beginning. All CF operations are idempotent.
    if (record.step === 'failed_retryable') {
      record.step = 'pending_ns';
      record.error = undefined;
    }

    if (record.step === 'pending_ns') {
      const zone = await getZone(record.zoneId);
      record.cfStatus = zone.status;
      record.lastCheckedAt = nowIso();

      if (TERMINAL_CF_STATUSES.has(zone.status)) {
        record.step = 'failed_terminal';
        record.error = {
          code: 0,
          message: `Zone status is "${zone.status}". Manual intervention required.`,
          retryable: false,
        };
        record.updatedAt = nowIso();
        await writeRecord(record);
        return record;
      }

      if (zone.status === 'active') {
        record.step = 'active';
        record.error = undefined;
      } else {
        try {
          await triggerActivationCheck(record.zoneId);
        } catch {
          // Activation check is rate-limited (1/hr free, 1/5min paid); ignore failures.
        }
      }
      await writeRecord(record);
      if (record.step !== 'active') return record;
    }

    if (record.step === 'active') {
      await enableEmailRouting(record.zoneId);
      record.step = 'email_routing_enabled';
      record.error = undefined;
      record.updatedAt = nowIso();
      await writeRecord(record);
    }

    if (record.step === 'email_routing_enabled') {
      await setCatchAllRule(record.zoneId, WORKER_NAME);
      record.step = 'catch_all_configured';
      record.error = undefined;
      record.updatedAt = nowIso();
      await writeRecord(record);
    }

    if (record.step === 'catch_all_configured') {
      const globalAcquired = await storage.setIfAbsent(DOMAINS_GLOBAL_LOCK_KEY, '1', { ex: LOCK_TTL_SECONDS });
      if (!globalAcquired) {
        throw new Error('Settings are being updated by another operation. Try sync again.');
      }
      try {
        const storedRaw = await storage.get(DOMAINS_SETTINGS_KEY);
        const current = normalizeDomains(parseDomains(storedRaw));
        const next = normalizeDomains([...current, record.domain]);
        await storage.set(DOMAINS_SETTINGS_KEY, { domains: next });
      } finally {
        await storage.del(DOMAINS_GLOBAL_LOCK_KEY);
      }
      record.step = 'added_to_app';
      record.updatedAt = nowIso();
      record.error = undefined;
      await writeRecord(record);
    }

    return record;
  } catch (err) {
    record.step = isTerminal(err) ? 'failed_terminal' : 'failed_retryable';
    record.error = fromCfError(err);
    record.updatedAt = nowIso();
    await writeRecord(record);
    return record;
  } finally {
    await releaseLock(domain);
  }
}

export async function getOnboarding(domainInput: string): Promise<OnboardingRecord | null> {
  return readRecord(normalizeDomain(domainInput));
}

export async function listOnboarding(): Promise<OnboardingRecord[]> {
  const pattern = `${ONBOARDING_PREFIX}*`;
  const keys = await storage.kvKeys(pattern);
  const records: OnboardingRecord[] = [];
  for (const key of keys) {
    const raw = await storage.get(key);
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      continue;
    }
    const record = normalizeRecord(parsed);
    if (record) records.push(record);
  }
  return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const setConfigEnabled = async (domain: string, enabled: boolean): Promise<void> => {
  const raw = await storage.get(DOMAINS_CONFIG_SETTINGS_KEY);
  let config: MasterDomainConfig[] = [];
  if (typeof raw === 'string') {
    try { config = JSON.parse(raw) as MasterDomainConfig[]; } catch { config = []; }
  } else if (Array.isArray(raw)) {
    config = raw as MasterDomainConfig[];
  }
  const idx = config.findIndex(
    (c) => c.domain.toLowerCase().trim() === domain.toLowerCase().trim()
  );
  if (idx >= 0) {
    config[idx].enabled = enabled;
    await storage.set(DOMAINS_CONFIG_SETTINGS_KEY, config);
  }
};

export class DomainStateError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'DomainStateError';
    this.statusCode = statusCode;
  }
}

const acquireLock = async (domain: string): Promise<boolean> => {
  return storage.setIfAbsent(lockKey(domain), '1', { ex: LOCK_TTL_SECONDS });
};

const acquireGlobalLock = async (): Promise<boolean> => {
  return storage.setIfAbsent(DOMAINS_GLOBAL_LOCK_KEY, '1', { ex: LOCK_TTL_SECONDS });
};

/**
 * Soft remove: remove domain from app active list but keep CF zone intact.
 */
export async function removeFromApp(
  domainInput: string,
  options?: { actor?: 'admin' | 'user' }
): Promise<OnboardingRecord> {
  const domain = normalizeDomain(domainInput);
  const actor = options?.actor ?? 'admin';
  const record = await readRecord(domain);
  if (!record) {
    throw new DomainStateError(`No onboarding record for ${domain}`, 404);
  }
  if (record.step !== 'added_to_app') {
    throw new DomainStateError(`Domain must be in added_to_app state to remove (current: ${record.step})`, 400);
  }
  if (actor === 'user' && record.source !== 'user-request') {
    throw new DomainStateError('This domain was assigned by an admin and cannot be removed via user request.', 403);
  }

  const acquired = await acquireLock(domain);
  if (!acquired) {
    throw new DomainStateError('Another operation is in progress. Try again in a minute.', 409);
  }

  try {
    const globalAcquired = await acquireGlobalLock();
    if (!globalAcquired) {
      throw new DomainStateError('Settings are being updated by another operation. Try again.', 409);
    }
    try {
      const storedRaw = await storage.get(DOMAINS_SETTINGS_KEY);
      const current = normalizeDomains(parseDomains(storedRaw));
      const next = current.filter((d) => d !== domain);
      await storage.set(DOMAINS_SETTINGS_KEY, { domains: next });
      await setConfigEnabled(domain, false);

      record.removedFromAppAt = nowIso();
      record.updatedAt = nowIso();
      await writeRecord(record);
      return record;
    } finally {
      await storage.del(DOMAINS_GLOBAL_LOCK_KEY);
    }
  } finally {
    await releaseLock(domain);
  }
}

/**
 * Restore: re-add a soft-removed domain back to the app active list.
 */
export async function restoreToApp(domainInput: string): Promise<OnboardingRecord> {
  const domain = normalizeDomain(domainInput);
  const record = await readRecord(domain);
  if (!record) {
    throw new DomainStateError(`No onboarding record for ${domain}`, 404);
  }
  if (!record.removedFromAppAt) {
    throw new DomainStateError('Domain is not removed from app', 400);
  }

  const acquired = await acquireLock(domain);
  if (!acquired) {
    throw new DomainStateError('Another operation is in progress. Try again in a minute.', 409);
  }

  try {
    const globalAcquired = await acquireGlobalLock();
    if (!globalAcquired) {
      throw new DomainStateError('Settings are being updated by another operation. Try again.', 409);
    }
    try {
      const storedRaw = await storage.get(DOMAINS_SETTINGS_KEY);
      const current = normalizeDomains(parseDomains(storedRaw));
      if (!current.includes(domain)) {
        const next = normalizeDomains([...current, domain]);
        await storage.set(DOMAINS_SETTINGS_KEY, { domains: next });
      }
      await setConfigEnabled(domain, true);

      record.removedFromAppAt = null;
      record.updatedAt = nowIso();
      await writeRecord(record);
      return record;
    } finally {
      await storage.del(DOMAINS_GLOBAL_LOCK_KEY);
    }
  } finally {
    await releaseLock(domain);
  }
}

/**
 * Full remove: delete CF zone + clean all local state. Irreversible.
 */
export async function fullRemoveFromCloudflare(domainInput: string): Promise<void> {
  const domain = normalizeDomain(domainInput);
  const record = await readRecord(domain);

  const acquired = await acquireLock(domain);
  if (!acquired) {
    throw new DomainStateError('Another operation is in progress. Try again in a minute.', 409);
  }

  try {
    if (record?.zoneId) {
      try {
        await deleteZone(record.zoneId);
      } catch (err) {
        if (err instanceof CloudflareApiError && err.cfError.status === 404) {
          // Zone already deleted — proceed with local cleanup
        } else {
          throw err;
        }
      }
    }

    const globalAcquired = await acquireGlobalLock();
    if (!globalAcquired) {
      throw new DomainStateError('Settings are being updated by another operation. Try again.', 409);
    }
    try {
      const storedRaw = await storage.get(DOMAINS_SETTINGS_KEY);
      const current = normalizeDomains(parseDomains(storedRaw));
      const next = current.filter((d) => d !== domain);
      await storage.set(DOMAINS_SETTINGS_KEY, { domains: next });
    } finally {
      await storage.del(DOMAINS_GLOBAL_LOCK_KEY);
    }

    await storage.del(onboardingKey(domain));
  } finally {
    await releaseLock(domain);
  }
}

/**
 * Cancel onboarding: delete onboarding record for pending/failed domains.
 * Optionally deletes the CF zone if zoneId exists and confirmZoneDelete is true.
 */
export async function cancelOnboarding(domainInput: string, confirmZoneDelete: boolean): Promise<void> {
  const domain = normalizeDomain(domainInput);
  const record = await readRecord(domain);
  if (!record) {
    throw new DomainStateError(`No onboarding record for ${domain}`, 404);
  }

  if (record.step === 'added_to_app' && !record.removedFromAppAt) {
    throw new DomainStateError('Cannot cancel onboarding for active domain. Use removeFromApp instead.', 400);
  }

  const acquired = await acquireLock(domain);
  if (!acquired) {
    throw new DomainStateError('Another operation is in progress. Try again in a minute.', 409);
  }

  try {
    if (record.zoneId && confirmZoneDelete) {
      try {
        await deleteZone(record.zoneId);
      } catch (err) {
        if (err instanceof CloudflareApiError && err.cfError.status === 404) {
          // Zone already deleted
        } else {
          throw err;
        }
      }
    }

    await storage.del(onboardingKey(domain));
  } finally {
    await releaseLock(domain);
  }
}
