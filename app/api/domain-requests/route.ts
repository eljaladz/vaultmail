import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkApiRateLimit } from '@/lib/api-key-middleware';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { hashIp, getRequestIp } from '@/lib/ip-hash';
import { createDomainRequest } from '@/lib/domain-requests';
import { sendTelegramMessage } from '@/lib/telegram';
import { storage } from '@/lib/storage';
import { withPrefix } from '@/lib/storage-keys';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_KEY = withPrefix('domain-request:rate');

const schema = z.object({
  domain: z.string().min(1).max(253),
  type: z.enum(['add', 'remove']),
  turnstileToken: z.string().optional(),
});

export async function POST(req: Request) {
  const rateLimit = await checkApiRateLimit(req, 'domain.request');
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

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
  }

  const turnstileOk = await verifyTurnstileToken(parsed.data.turnstileToken ?? '', {
    expectedAction: 'domain-request',
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
    const { request, created } = await createDomainRequest(
      parsed.data.domain,
      parsed.data.type,
      ipHash,
      turnstileOk
    );

    if (created) {
      const message = [
        `🔔 New Domain Request (${request.type === 'add' ? 'Add' : 'Remove'})`,
        `Domain: ${request.domain}`,
        `Requested: ${new Date(request.requestedAt).toLocaleString()}`,
        `ID: ${request.id}`,
      ].join('\n');
      await sendTelegramMessage(message);
    }

    const nameservers = process.env.NEXT_PUBLIC_CLOUDFLARE_ACCOUNT_NAMESERVERS;
    return NextResponse.json({
      success: true,
      alreadyExists: !created,
      nameservers: nameservers
        ? nameservers.split(',').map((ns) => ns.trim()).filter(Boolean)
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
