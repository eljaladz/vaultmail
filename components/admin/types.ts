export type TelegramSettings = {
  enabled: boolean;
  botToken: string;
  chatId: string;
  allowedDomains?: string[];
};

export type RetentionSettings = {
  seconds: number;
};

export type BrandingSettings = {
  appName: string;
};

export type HomepageLockSettings = {
  enabled: boolean;
  hasPassword: boolean;
  updatedAt?: string;
};

export type DomainsSettings = {
  domains: string[];
};

export type AdminStats = {
  inboxCount: number;
  messageCount: number;
  latestReceivedAt: string | null;
};

export type ImapSettings = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  rejectUnauthorized: boolean;
  maxFetch: number;
  updatedAt?: string;
};

export type ApiKeyView = {
  hash: string;
  label: string;
  createdAt: string;
  lastUsedAt?: string;
};

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

export type CloudflareOnboardingListResponse = {
  records: OnboardingRecord[];
  configured: boolean;
};
