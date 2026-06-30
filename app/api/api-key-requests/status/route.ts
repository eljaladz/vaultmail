import { NextResponse } from 'next/server';
import { checkApiRateLimit } from '@/lib/api-key-middleware';
import { getPublicApiKeyRequestStatus } from '@/lib/api-key-requests';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const rateLimit = await checkApiRateLimit(req, 'api-key.status');
  if (rateLimit.blocked) {
    if (rateLimit.reason) {
      return NextResponse.json({ error: 'Forbidden', reason: rateLimit.reason }, { status: 403 });
    }
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }
  if (!UUID_REGEX.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const status = await getPublicApiKeyRequestStatus(token);

  if (!status) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
