# API Key Request Feature Plan

## Overview
Add an API key request flow that mirrors the domain request feature. A user without an key can open the `/api-access` page, submit a request with a label/use-case, and later check its status via a UUID token. Admins review requests in the admin dashboard and approve/reject them. When approved, an API key is generated and shown once to the admin. The requester sees only an 'approved' status and must obtain the actual key from the admin out-of-band. Telegram only notifies admins of new requests, matching the domain-request pattern.

## Scope
- Public form in `/api-access` to request an API key.
- Public status endpoint to poll the request by UUID token.
- Admin list + review endpoints and UI section.
- Rate limiting, Turnstile, IP hash, and privacy consistent with existing domain-request feature.
- No new external dependencies, no Zod.

## Out of Scope
- Telegram DM delivery of keys to requesters.
- Email notifications.
- Paid/tiered approval workflows.

## Data Model

### `ApiKeyRequest` (stored in `kv_store`)
```ts
{
  id: string;                // crypto.randomUUID()
  label: string;             // user-provided label, max 50 chars
  purpose: string;             // optional use-case, max 255 chars
  status: 'pending' | 'approved' | 'rejected';
  requesterIpHash: string;   // HMAC-SHA256 of IP
  turnstileVerified: boolean;
  requestedAt: string;         // ISO timestamp
  updatedAt: string;
  adminNote?: string;
  keyHash?: string;          // SHA-256 hash of generated key (only when approved)
}
```

## Storage Keys
Mirror the domain-request naming convention:
- `api-key:request:<uuid>` → individual request record
- `api-key:request-by-ip:<ipHash>` → dedup/one-pending-per-IP key (TTL 24h)
- `api-key-request:rate:<ipHash>` → per-IP cooldown (TTL 60s)

## API Surface

### `POST /api/api-key-requests`
- Validates Turnstile action `api-key-request`.
- Applies rate limit category `api-key.request` (3/300s anon, 5/300s session, 10/300s api-key) and a 60s per-IP cooldown.
- Hashes IP and stores it.
- Deduplicates by IP: if a pending request already exists for the IP, return the existing one.
- Creates record with `status: 'pending'`.
- Sends Telegram admin notification: `🔔 New API Key Request
Label: <label>
Purpose: <purpose>
ID: <id>`.
- Returns sanitized public token `{ token, label, status, requestedAt }`.

### `GET /api/api-key-requests/status?token=<uuid>`
- Validates token format.
- Applies rate limit category `api-key.status` (10/60s anon).
- Returns sanitized fields: `id, label, status, requestedAt, updatedAt, message`.
- The public status page shows only `approved` and a short message. The actual API key is not stored in the request record and cannot be recovered from the hash. The requester must obtain the key from the admin out-of-band.

### `GET /api/admin/api-key-requests`
- Returns list of pending/approved/rejected requests, sorted by requestedAt descending.
- Requires admin session.

### `PATCH /api/admin/api-key-requests/[id]`
- Body: `{ action: 'approve' | 'reject' | 'delete'; adminNote?: string }`.
- `approve`:
  - Enforces that the request is currently `pending`. If already approved, return the existing `keyHash` and inform the admin that the key was already generated.
  - Calls `addApiKey(label)` to generate a real API key.
  - Calls `hashApiKey(plainKey)` to obtain the key hash and stores it in the request record.
  - Sets status to `approved`, stores `keyHash`, optional `adminNote`.
  - Returns the generated plain key (shown once in admin UI).
- `reject`:
  - Sets status to `rejected`, optional `adminNote`.
- `delete`:
  - Removes request from storage.

## UI Changes

### `/api-access` page (`components/api-access-page.tsx`)
- Add a "Request API Key" button next to existing unlock form.
- Click opens a modal (reuse `RequestDomainModal` style) with:
  - Tab 1: Request form (label + purpose + Turnstile + submit)
  - Tab 2: Check status (token/localStorage list)
- Store submitted request tokens in `localStorage` key `apiKeyRequestTokens` (same pattern as domain requests).

### New `components/inbox/request-api-key-modal.tsx`
- Mirror `request-domain-modal.tsx` styling and behavior.
- Two tabs, localStorage list, status polling, copy buttons.
- On approved status, show a message instructing the user to check with the admin for the actual key.

### New `components/admin/api-key-requests-section.tsx`
- Mirror `domain-requests-section.tsx`.
- Table/list of requests with status badges.
- Approve/reject/delete buttons.
- On approve, open a one-time key display modal (reuse `api-keys-section.tsx` key display pattern).

### Update `components/admin-dashboard.tsx`
- Add `<ApiKeyRequestsSection />` below existing API keys section.

### Update `components/turnstile-widget.tsx`
- Add `'api-key-request'` to `TurnstileAction` union.

### Update `lib/api-key-middleware.ts`
- Add `api-key.request` and `api-key.status` categories.
- Use domain-request policy values as baseline.

### No change to `lib/admin-auth.ts`
No new `settings:*` key is required for this feature. All per-request data lives under `api-key:request:*` and rate-limit keys.

## Security & Privacy
- IP hash stored via `hashIp(getRequestIp(req))`.
- Turnstile verified on every public mutation.
- Rate limits applied.
- Admin routes protected by `requireAdminRequest`.
- Key hash stored only; plain key shown once on approval in admin UI.
- No email/Telegram of keys to requesters.

## Files to Create/Modify
- Create:
  - `lib/api-key-requests.ts`
  - `app/api/api-key-requests/route.ts`
  - `app/api/api-key-requests/status/route.ts`
  - `app/api/admin/api-key-requests/route.ts`
  - `app/api/admin/api-key-requests/[id]/route.ts`
  - `components/inbox/request-api-key-modal.tsx`
  - `components/admin/api-key-requests-section.tsx`
- Modify:
  - `components/api-access-page.tsx`
  - `components/admin-dashboard.tsx`
  - `components/turnstile-widget.tsx`
  - `lib/api-key-middleware.ts`
  - `lib/i18n.ts` (add translations)
  - `lib/admin-auth.ts` (settings key constants)

## Verification
- `npm run lint` must pass.
- `MONGODB_URI= npm run build` must pass.
- `npm test` must pass if a test suite exists.

## Risks
- Reusing the existing API key generator means approved keys are real and active globally. Revoking a request after approval should not delete the global API key; only admin API key revocation should.
- The admin UI must clearly show that the generated key is one-time and that the user should copy it.
