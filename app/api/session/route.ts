import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  API_KEY_COOKIE,
  isApiKeyConfigured,
  validateApiKey
} from '@/lib/api-key';
import {
  checkRateLimit,
  registerRateLimitFailure,
  resetRateLimit
} from '@/lib/auth-rate-limit';
import { checkApiRateLimit } from '@/lib/api-key-middleware';
import { createCsrfToken, requireCsrf, CSRF_COOKIE } from '@/lib/csrf';
import { verifyTurnstileToken } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

type SessionBody = {
  apiKey?: string;
  turnstileToken?: string;
};

export async function GET(req: Request) {
  const rateLimit = await checkApiRateLimit(req, 'session.read', { browserOnly: true, allowApiKeyBypassBrowserGuard: false });
  if (rateLimit.blocked) {
    if (rateLimit.reason) {
      return NextResponse.json({ error: 'Forbidden', reason: rateLimit.reason }, { status: 403 });
    }
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(API_KEY_COOKIE)?.value;
  const keysConfigured = await isApiKeyConfigured();

  const response = NextResponse.json({
    valid: cookieValue ? await validateApiKey(cookieValue) : false,
    keysConfigured
  });

  if (!cookieStore.get(CSRF_COOKIE)) {
    const isHttps = process.env.NODE_ENV === 'production';
    response.cookies.set({
      name: CSRF_COOKIE,
      value: createCsrfToken(),
      httpOnly: false,
      sameSite: 'lax',
      secure: isHttps,
      path: '/',
      maxAge: COOKIE_MAX_AGE
    });
  }

  return response;
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'session');
  if (rateLimit.blocked) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 5 minutes.' },
      { status: 429 }
    );
  }

  const guard = await checkApiRateLimit(request, 'session.create', { browserOnly: true, allowApiKeyBypassBrowserGuard: false });
  if (guard.blocked) {
    if (guard.reason) {
      return NextResponse.json({ error: 'Forbidden', reason: guard.reason }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized or rate limited' }, { status: 401 });
  }

  const csrfCheck = requireCsrf(request);
  if (!csrfCheck.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: csrfCheck.reason }, { status: 403 });
  }

  let body: SessionBody;
  try {
    body = (await request.json()) as SessionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'API key required' }, { status: 400 });
  }

  const turnstileOk = await verifyTurnstileToken(body.turnstileToken ?? '', {
    expectedAction: 'api-access',
  });
  if (!turnstileOk) {
    return NextResponse.json({ error: 'Bot verification failed' }, { status: 403 });
  }

  const valid = await validateApiKey(apiKey);
  if (!valid) {
    const failure = await registerRateLimitFailure(request, 'session');
    if (failure.blocked) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in 5 minutes.' },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  await resetRateLimit(request, 'session');

  const response = NextResponse.json({ success: true });
  const isHttps = process.env.NODE_ENV === 'production';
  response.cookies.set({
    name: API_KEY_COOKIE,
    value: apiKey,
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: COOKIE_MAX_AGE
  });
  response.cookies.set({
    name: CSRF_COOKIE,
    value: createCsrfToken(),
    httpOnly: false,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: COOKIE_MAX_AGE
  });
  return response;
}

export async function DELETE(req: Request) {
  const rateLimit = await checkApiRateLimit(req, 'session.delete', { browserOnly: true, allowApiKeyBypassBrowserGuard: false });
  if (rateLimit.blocked) {
    if (rateLimit.reason) {
      return NextResponse.json({ error: 'Forbidden', reason: rateLimit.reason }, { status: 403 });
    }
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }

  const csrfCheck = requireCsrf(req);
  if (!csrfCheck.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: csrfCheck.reason }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: API_KEY_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return response;
}
