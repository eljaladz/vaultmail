import { NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-request';
import { listDomainRequests } from '@/lib/domain-requests';
import type { DomainRequestStatus } from '@/lib/domain-requests';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const guard = await requireAdminRequest(req);
  if (!guard.ok) {
    if (guard.status === 401) return new NextResponse('Unauthorized', { status: 401 });
    return NextResponse.json({ error: 'Forbidden', reason: guard.reason }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') as DomainRequestStatus | null;

  const requests = await listDomainRequests(status ?? undefined);
  return NextResponse.json({ requests });
}
