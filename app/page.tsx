import { HomePage } from "@/components/home-page";
import { HomepageLock } from "@/components/homepage-lock";
import { cookies } from "next/headers";
import {
  getHomepageLockSettings,
} from "@/lib/homepage-lock";
import {
  HOMEPAGE_SESSION_COOKIE,
  validateHomepageSession,
  HOMEPAGE_LOCK_COOKIE,
  createHomepageSession,
} from "@/lib/homepage-session";
import { getStoredAppName } from "@/lib/branding-settings";
import { getDomains } from "@/lib/domains";
import { storage } from "@/lib/storage";
import { RETENTION_SETTINGS_KEY } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const getRetentionSeconds = async (): Promise<number> => {
  const raw = await storage.get(RETENTION_SETTINGS_KEY);
  if (raw && typeof raw === 'object') {
    const val = raw as { seconds?: number };
    if (typeof val.seconds === 'number') return val.seconds;
  }
  return 86400;
};

export default async function Home() {
  const [settings, appName, retentionSeconds, domains] = await Promise.all([
    getHomepageLockSettings(),
    getStoredAppName(),
    getRetentionSeconds(),
    getDomains(),
  ]);

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(HOMEPAGE_SESSION_COOKIE);

  if (sessionCookie?.value) {
    const valid = await validateHomepageSession(sessionCookie.value);
    if (valid) return <HomePage appName={appName} retentionSeconds={retentionSeconds} initialDomains={domains} />;
  }

  if (!settings.enabled || !settings.passwordHash) {
    return <HomePage appName={appName} retentionSeconds={retentionSeconds} initialDomains={domains} />;
  }

  const oldCookie = cookieStore.get(HOMEPAGE_LOCK_COOKIE);
  if (oldCookie?.value === settings.passwordHash) {
    const newToken = await createHomepageSession();
    cookieStore.set(HOMEPAGE_SESSION_COOKIE, newToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24,
      path: '/',
    });
    cookieStore.delete(HOMEPAGE_LOCK_COOKIE);
    return <HomePage appName={appName} retentionSeconds={retentionSeconds} initialDomains={domains} />;
  }

  return <HomepageLock appName={appName} />;
}
