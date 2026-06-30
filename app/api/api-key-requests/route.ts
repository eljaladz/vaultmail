import { NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-key-middleware';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { hashIp, getRequestIp } from '@/lib/ip-hash';
import { createApiKeyRequest } from '@/lib/api-key-requests';
import { sendTelegramMessage } from '@/lib/telegram';
import { storage } from '@/lib/storage';
import { withPrefix } from '@/lib/storage-keys';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_KEY = withPrefix('api-key-request:rate');

const isValidLabel = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 50;

const sanitizePurpose = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 255);
};

export async function POST(req: Request) {
  const rateLimit = await checkApiRateLimit(req, 'api-key.request');
  if (rateLimit.blocked) {
    if (rateLimit.reason) {
      return NextResponse.json({ error: 'Forbidden', reason: rateLimit.reason }, { status: 403 });
    }
    return NextResponse.json({ error: 'Too many requests. Please wait a few minutes.' }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { label: rawLabel, purpose: rawPurpose, turnstileToken: rawToken } = payload as Record<string, unknown>;

  if (!isValidLabel(rawLabel)) {
    return NextResponse.json({ error: 'Label is required and must be 1-50 characters.' }, { status: 400 });
  }

  const turnstileOk = await verifyTurnstileToken(typeof rawToken === 'string' ? rawToken : '', {
    expectedAction: 'api-key-request',
  });
  if (!turnstileOk) {
    return NextResponse.json({ error: 'Bot verification failed. Please try again.' }, { status: 403 });
  }

  const ip = getRequestIp(req);
  const ipHash = hashIp(ip);

  const ipRateKey = `${RATE_LIMIT_KEY}:${ipHash}`;
  const ipRateAcquired = await storage.setIfAbsent(ipRateKey, '1', { ex: 60 });
  if (!ipRateAcquired) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 });
  }

  try {
    const { request, created } = await createApiKeyRequest(
      rawLabel,
      sanitizePurpose(rawPurpose),
      ipHash,
      turnstileOk
    );

    if (created) {
      await sendTelegramMessage(
        `\uD83D\uDD14 New API Key Request\nLabel: ${request.label}\nPurpose: ${request.purpose || '(none)'}\nID: ${request.id}`
      );
    }

    return NextResponse.json(
      {
        token: request.id,
        label: request.label,
        status: request.status,
        requestedAt: request.requestedAt,
      },
      { status: created ? 201 : 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
