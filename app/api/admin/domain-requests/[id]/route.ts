import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminRequest } from '@/lib/admin-request';
import {
  getDomainRequest,
  updateDomainRequest,
  deleteDomainRequest,
} from '@/lib/domain-requests';
import { startOnboarding, removeFromApp, getOnboarding } from '@/lib/domain-onboarding';
import { isCloudflareConfigured } from '@/lib/cloudflare-zones';

export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['approve', 'reject', 'delete']),
  adminNote: z.string().optional().default(''),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminRequest(req);
  if (!guard.ok) {
    if (guard.status === 401) return new NextResponse('Unauthorized', { status: 401 });
    return NextResponse.json({ error: 'Forbidden', reason: guard.reason }, { status: 403 });
  }

  const { id } = await params;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const request = await getDomainRequest(id);
  if (!request) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  if (parsed.data.action === 'delete') {
    await deleteDomainRequest(id);
    return NextResponse.json({ success: true });
  }

  if (parsed.data.action === 'reject') {
    const updated = await updateDomainRequest(id, {
      status: 'rejected',
      adminNote: parsed.data.adminNote,
    });
    return NextResponse.json({ request: updated });
  }

  if (parsed.data.action === 'approve') {
    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'Request is not pending' }, { status: 400 });
    }

    if (request.type === 'add') {
      if (!isCloudflareConfigured()) {
        return NextResponse.json(
          { error: 'Cloudflare is not configured. Set CLOUDFLARE_ADMIN_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.' },
          { status: 503 }
        );
      }

      const existingOnboarding = await getOnboarding(request.domain);
      if (existingOnboarding?.step === 'added_to_app' && !existingOnboarding.removedFromAppAt) {
        return NextResponse.json(
          { error: `${request.domain} is already active in the app.` },
          { status: 409 }
        );
      }

      try {
        const record = await startOnboarding(request.domain, { source: 'user-request' });
        const updated = await updateDomainRequest(id, {
          status: 'approved',
          adminNote: parsed.data.adminNote,
          onboardingStatus: 'started',
        });
        return NextResponse.json({ request: updated, onboarding: record });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Onboarding failed';
        const updated = await updateDomainRequest(id, {
          onboardingStatus: 'failed',
          onboardingError: message,
        });
        return NextResponse.json(
          { error: `Onboarding failed: ${message}`, request: updated },
          { status: 502 }
        );
      }
    }

    if (request.type === 'remove') {
      try {
        const record = await removeFromApp(request.domain, { actor: 'admin' });
        const updated = await updateDomainRequest(id, {
          status: 'approved',
          adminNote: parsed.data.adminNote,
        });
        return NextResponse.json({ request: updated, onboarding: record });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Remove failed';
        return NextResponse.json(
          { error: `Remove failed: ${message}` },
          { status: 502 }
        );
      }
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
