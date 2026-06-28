import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { storage } from '@/lib/storage';
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_PREFIX } from '@/lib/admin-auth';
import {
  checkRateLimit,
  registerRateLimitFailure,
  resetRateLimit
} from '@/lib/auth-rate-limit';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { adminLoginSchema } from '@/lib/schemas/admin-auth';
import { checkApiRateLimit } from '@/lib/api-key-middleware';
import { createCsrfToken, CSRF_COOKIE } from '@/lib/csrf';

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'admin-login');
  if (rateLimit.blocked) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 5 minutes.' },
      { status: 429 }
    );
  }

  const guard = await checkApiRateLimit(request, 'admin.login', { browserOnly: true, allowApiKeyBypassBrowserGuard: false, skipHomepageLockDenial: true });
  if (guard.blocked) {
    if (guard.reason) {
      return NextResponse.json({ error: 'Forbidden', reason: guard.reason }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized or rate limited' }, { status: 401 });
  }

  const parsed = adminLoginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.format() },
      { status: 400 }
    );
  }
  const { password, turnstileToken } = parsed.data;

  if (process.env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken || !turnstileToken.trim()) {
      return NextResponse.json(
        { error: 'Turnstile token required. Ensure NEXT_PUBLIC_TURNSTILE_SITE_KEY is set and the widget is rendered.' },
        { status: 400 }
      );
    }
    const turnstileOk = await verifyTurnstileToken(turnstileToken.trim());
    if (!turnstileOk) {
      return NextResponse.json(
        { error: 'Turnstile verification failed.' },
        { status: 400 }
      );
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('TURNSTILE_SECRET_KEY is not set in production. Admin login bot protection is disabled.');
  }

  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || password !== adminPassword) {
    const failure = await registerRateLimitFailure(request, 'admin-login');
    if (failure.blocked) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in 5 minutes.' },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await resetRateLimit(request, 'admin-login');

  const token = crypto.randomUUID();
  const key = `${ADMIN_SESSION_PREFIX}${token}`;
  const maxAge = 60 * 60;

  await storage.set(key, '1');
  await storage.expire(key, maxAge);

  const response = NextResponse.json({ success: true });
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isHttps =
    forwardedProto === 'https' || new URL(request.url).protocol === 'https:';
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge
  });
  response.cookies.set({
    name: CSRF_COOKIE,
    value: createCsrfToken(),
    httpOnly: false,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge
  });

  return response;
}
