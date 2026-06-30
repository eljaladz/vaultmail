import { NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-request';
import {
  getApiKeyRequest,
  updateApiKeyRequest,
  deleteApiKeyRequest,
} from '@/lib/api-key-requests';
import { addApiKey, hashApiKey } from '@/lib/api-key';
import { storage } from '@/lib/storage';
import { withPrefix } from '@/lib/storage-keys';

export const dynamic = 'force-dynamic';

const lockKey = (id: string) => withPrefix(`api-key:request-lock:${id}`);

const isValidAction = (value: unknown): value is 'approve' | 'reject' | 'delete' =>
  value === 'approve' || value === 'reject' || value === 'delete';

const sanitizeAdminNote = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : undefined;
};

const acquireLock = async (id: string): Promise<boolean> =>
  storage.setIfAbsent(lockKey(id), '1', { ex: 60 });

const releaseLock = async (id: string): Promise<void> =>
  storage.del(lockKey(id));

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

  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { action: rawAction, adminNote: rawAdminNote } = payload as Record<string, unknown>;

  if (!isValidAction(rawAction)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const request = await getApiKeyRequest(id);
  if (!request) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  const adminNote = sanitizeAdminNote(rawAdminNote);

  const lockAcquired = await acquireLock(id);
  if (!lockAcquired) {
    return NextResponse.json({ error: 'Request is being processed. Try again.' }, { status: 429 });
  }

  try {
    if (rawAction === 'delete') {
      await deleteApiKeyRequest(id);
      return NextResponse.json({ success: true });
    }

    if (rawAction === 'reject') {
      const latest = await getApiKeyRequest(id);
      if (!latest || latest.status !== 'pending') {
        return NextResponse.json({ error: 'Request is not pending' }, { status: 409 });
      }
      const updated = await updateApiKeyRequest(id, { status: 'rejected', adminNote });
      return NextResponse.json({ request: updated });
    }

    if (rawAction === 'approve') {
      const latest = await getApiKeyRequest(id);
      if (!latest) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }

      if (latest.status === 'approved' && latest.keyHash) {
        return NextResponse.json(
          {
            request: latest,
            apiKey: null,
            message: 'Request already approved. The key was shown once.',
          },
          { status: 200 }
        );
      }

      if (latest.status !== 'pending') {
        return NextResponse.json({ error: 'Request is not pending' }, { status: 409 });
      }

      try {
        const plainKey = await addApiKey(latest.label);
        const keyHash = hashApiKey(plainKey);
        const updated = await updateApiKeyRequest(id, {
          status: 'approved',
          keyHash,
          adminNote,
        });
        return NextResponse.json({ request: updated, apiKey: plainKey }, { status: 200 });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate API key';
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } finally {
    await releaseLock(id);
  }
}
