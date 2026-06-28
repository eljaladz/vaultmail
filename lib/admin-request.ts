import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth';
import { requireCsrf } from '@/lib/csrf';
import { requireBrowserUiRequest } from '@/lib/browser-request-guard';

export type AdminGuardResult = { ok: true } | { ok: false; status: 401 | 403; reason?: string };

export async function requireAdminRequest(req: Request): Promise<AdminGuardResult> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const sessionValid = await isAdminSessionValid(sessionToken);
  if (!sessionValid) {
    return { ok: false, status: 401 };
  }

  const browser = requireBrowserUiRequest(req);
  if (!browser.ok) {
    return { ok: false, status: 403, reason: browser.reason };
  }

  const csrf = requireCsrf(req);
  if (!csrf.ok) {
    return { ok: false, status: 403, reason: csrf.reason };
  }

  return { ok: true };
}
