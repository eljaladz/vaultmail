# Vaultmail Deployment Guide

Complete guide for deploying Vaultmail to Netlify (free tier) + Cloudflare Worker + MongoDB.

## Prerequisites

- A GitHub repo with the Vaultmail code
- A MongoDB deployment (Atlas free tier or self-hosted)
- A Cloudflare account with your domains configured
- Node.js 20+ for local testing

---

## Phase 1: MongoDB Setup

### Option A: MongoDB Atlas (Free Tier, Recommended for Production)

1. Create a free cluster at https://www.mongodb.com/atlas
2. Create a database user (username + password)
3. Add network access: `0.0.0.0/0` (allow from anywhere — Netlify functions have dynamic IPs)
4. Get the connection string: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/vaultmail`

### Option B: Local Docker (For Development)

```bash
docker run -d \
  --name vaultmail-mongo \
  -p 27017:27017 \
  -v vaultmail-mongo-data:/data/db \
  mongo:7
```

Connection string: `mongodb://localhost:27017`

---

## Phase 2: Netlify Deployment

### Step 1: Push to GitHub

Push the `vaultmail/` directory to your GitHub repo. The repo root should contain:
- `app/`, `components/`, `lib/`, `worker/`, `public/`
- `package.json`, `next.config.ts`, `netlify.toml`, `tsconfig.json`

### Step 2: Create Netlify Site

1. Go to https://app.netlify.com → Add new site → Import from Git
2. Select your GitHub repo
3. Netlify auto-detects Next.js — build settings pre-fill automatically:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
4. Click **Deploy site**

Note: Netlify auto-detects Next.js 16 and uses the Next.js Runtime automatically. No manual plugin needed.

### Step 3: Set Environment Variables

Go to Site settings → Environment variables. Add each with scope **Functions** (and **Builds** for `NEXT_PUBLIC_` vars):

| Variable | Scope | Value | Required |
|----------|-------|-------|----------|
| `MONGODB_URI` | Functions | `mongodb+srv://...` | Yes |
| `MONGODB_DB` | Functions | `vaultmail` | Yes |
| `ADMIN_PASSWORD` | Functions | `<strong password>` | Yes |
| `WEBHOOK_SECRET` | Functions | `<random 32-char string>` | Yes |
| `CRON_SECRET` | Functions | `<random string>` | Recommended |
| `NEXT_PUBLIC_APP_URL` | Builds | `https://<your-app>.netlify.app` | Recommended |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | Builds | `en` or `id` | Optional |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | Builds | `<AdSense client ID>` | Optional |
| `ATTACHMENT_MAX_BYTES` | Functions | `2000000` | Optional |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Builds | `<Cloudflare site key>` | Optional* |
| `TURNSTILE_SECRET_KEY` | Functions | `<Cloudflare secret key>` | Optional |

**Turnstile setup:** The widget on `/admin` is rendered by the browser, so it needs the **public** site key (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`). The server verifies tokens with `TURNSTILE_SECRET_KEY`. If you set the secret but forget the public key, login will fail because the widget never appears. Set both and redeploy.

**Do NOT add the following Worker-only variables to Netlify** — they belong in the Cloudflare Worker (see Phase 3): `WEBHOOK_URL`, `FORWARD_DOMAINS`, `FORWARD_EMAIL`.

Generate secrets:
```bash
openssl rand -hex 16   # WEBHOOK_SECRET
openssl rand -hex 16   # CRON_SECRET
```

**Local development only:** set `ALLOW_UNAUTHENTICATED_WEBHOOK=true` in `.env.local` so the webhook works without the shared secret. Never enable this in production.

### Step 4: Deploy

Click **Trigger deploy** → wait for build to complete. Note your site URL: `https://<site-name>.netlify.app`.

### Step 5: Configure Custom Domain (Optional)

1. Netlify Dashboard → Domain management → Add custom domain
2. If using Netlify DNS: change nameservers at your registrar
3. If using external DNS: add CNAME pointing to `<site-name>.netlify.app`
4. SSL is automatic via Let's Encrypt

---

## Phase 3: Cloudflare Worker Deployment

The worker receives inbound emails from Cloudflare Email Routing and forwards them to your Netlify webhook.

### Step 1: Deploy Worker

You can deploy manually with Wrangler or automatically with GitHub Actions.

#### Option A: GitHub Actions (Recommended)

The repo includes `.github/workflows/worker-deploy.yml`. It deploys the Worker on every push to `main` that changes the `worker/` directory.

Required repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Value | How to get it |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | Create below |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Right sidebar in Cloudflare dashboard |
| `WEBHOOK_URL` | `https://<your-app>.netlify.app/api/webhook` | Your Netlify app URL |
| `WEBHOOK_SECRET` | Same random string as Netlify `WEBHOOK_SECRET` | `openssl rand -hex 16` |
| `FORWARD_DOMAINS` | `yourdomain.com,other.com` | Comma-separated domains |
| `FORWARD_EMAIL` | Optional forward mailbox | Leave empty if not forwarding |

**Cloudflare API token:**

1. Cloudflare Dashboard → **My Profile** → **API Tokens** → **Create Token**
2. Select the **Edit Cloudflare Workers** template
3. Permissions should include:
   - **Account** → **Workers Scripts Write**
   - **Zone** → **Workers Routes Write**
   - (Optional) **Zone** → **Email Routing Edit** and **Zone Read** if you use `scripts/setup-email-routing.mjs`
4. **Account resources** → **Include** → your account
5. **Zone resources** → **Include** → **All zones from an account** → your account
6. Continue → Create token → copy it into the `CLOUDFLARE_API_TOKEN` GitHub secret

**Cloudflare Account ID:**

- In the Cloudflare dashboard, open any domain overview. The **Account ID** is shown in the right sidebar.
- It looks like: `1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p`

After setting the secrets, push to `main` and the workflow will deploy.

#### Option B: Manual Deploy

Deploy the inbound email Worker. Make sure it is the **only** `email()` handler and has no `fetch()` handler, otherwise it will not appear in the Email Routing "Send to a Worker" dropdown.

```bash
cd worker
npm install
npx wrangler deploy
```

After deploying, verify the Worker appears in **Cloudflare Dashboard** → **Compute** → **Workers & Pages** and has the name `dispomail-forwarder`.

### Step 2: Set Worker Secrets

Set these from inside the `worker/` directory. These are **worker-only** and are NOT added to Netlify.

**Important:** `WEBHOOK_SECRET` is a secret and must be set with `npx wrangler secret put`. Never pass it via `--var` or commit it — it would be visible in the Cloudflare dashboard as plain text.

```bash
cd worker

# The webhook URL (your Netlify app)
npx wrangler secret put WEBHOOK_URL
# Enter: https://<site-name>.netlify.app/api/webhook

# Shared secret (must match Netlify WEBHOOK_SECRET)
npx wrangler secret put WEBHOOK_SECRET
# Enter: <same value as Netlify env>

# Domains to accept email for (comma-separated, no spaces)
npx wrangler secret put FORWARD_DOMAINS
# Enter: yourdomain.com,other.com

# Optional: forward copies to a real mailbox
# Privacy note: this sends ALL inbound mail to an external mailbox. If the address
# is publicly known or belongs to a third-party provider, sender/content privacy is
# reduced. Leave empty if you only need the Vaultmail inbox and webhook.
npx wrangler secret put FORWARD_EMAIL
# Enter: your@email.com (or leave empty)
```

The GitHub Actions workflow (`worker-deploy.yml`) deploys the Worker and then sets `WEBHOOK_SECRET` automatically from the `WEBHOOK_SECRET` repository secret.

### Step 3: Configure Cloudflare Email Routing

For each domain you want to receive email on:

1. Cloudflare Dashboard → **Compute** → **Email Service** → **Email Routing**
2. Select your domain and click **Enable Email Routing** (or **Onboard Domain** if not yet enabled)
3. Go to the **Routing Rules** tab
4. Click **Create routing rule** (or edit the existing **Catch-all** rule)
5. Set:
   - Email pattern: **Catch-all address**
   - Action: **Send to a Worker**
   - Destination: **`dispomail-forwarder`**
6. Click **Save**

Repeat for each domain.

**Important:** inbound Email Routing does **not** use a Worker binding like `send_email`. The "binding" is the routing rule itself. The Worker only needs to export an `email()` handler.

**If the dropdown says "No deployed Email Workers found":**
- Make sure you deployed the Worker with `npx wrangler deploy` from the `worker/` directory
- Make sure `worker/src/index.js` only exports an `email()` handler and no `fetch()` handler
- Try refreshing the page or waiting a minute for the dashboard to sync
- Confirm the Worker name in `worker/wrangler.toml` matches the name shown in the dropdown
- If it still does not appear, try creating the rule directly from **Email Service** → **Email Routing** → **Routing Rules** after the domain is onboarded

### Step 4: Configure via Cloudflare API (Alternative)

If the dashboard dropdown still does not list the Worker, you can create the catch-all rule directly through the Cloudflare API.

1. Get your **Zone ID** from the Cloudflare Dashboard (domain overview, right sidebar)
2. Create an API token with **Email Routing** edit permissions
3. Run:

```bash
export CLOUDFLARE_API_TOKEN=your_token
export CLOUDFLARE_ZONE_ID=your_zone_id

# Preview changes without applying
DRY_RUN=true node scripts/setup-email-routing.mjs

# Apply changes
node scripts/setup-email-routing.mjs
```

This creates (or updates) the catch-all rule to route all emails to the `dispomail-forwarder` Worker.

### Step 5: Test Real Email

Send a test email to `anything@yourdomain.com`:
- It arrives at Cloudflare Email Routing
- Worker parses it with postal-mime
- Worker POSTs to your Netlify webhook with `x-webhook-secret`
- App stores it in MongoDB
- Open your Netlify app → enter `anything@yourdomain.com` → see the email

---

## Phase 4: Post-Deploy Configuration

### Step 1: Admin Setup

1. Open `https://<site-name>.netlify.app/admin`
2. Login with your `ADMIN_PASSWORD`
3. **Domains** → add your domains (root + subdomains if using multi-subdomain)
4. **Retention** → set email lifespan (default 24h)
5. **Branding** → set app name, upload favicon, pick accent color
6. **API Keys** → generate keys for programmatic access
7. **Homepage Lock** → optionally enable password protection

### Step 2: Optional Features

- **Cloudflare Turnstile**: Get free keys from Cloudflare Dashboard → Turnstile. Set `TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` in Netlify env.
- **IMAP Fetch**: Configure in Admin → IMAP section (alternative to webhook, uses raw TLS)
- **Telegram Notifications**: Configure in Admin → Telegram section (bot token + chat ID)
- **Domain Expiration Cron**: Set up a cron scheduler to call `GET /api/cron/domain-expiration` with `x-cron-secret` header every 24h

### Step 3: Seed Domains (Alternative to Admin UI)

```bash
# Edit lib/domain-config.seed.ts to add your domains, then:
npx tsx scripts/seed-domains.ts
```

---

## Phase 5: Local Development

### Quick Start

```bash
# Start MongoDB
docker run -d --name vaultmail-mongo -p 27017:27017 -v vaultmail-mongo-data:/data/db mongo:7

# Install
cd vaultmail && npm install

# Configure
cp .env.example .env.local
# Edit .env.local (minimum for local dev):
#   MONGODB_URI=mongodb://localhost:27017
#   MONGODB_DB=vaultmail
#   ADMIN_PASSWORD=dev-admin-password
#   ALLOW_UNAUTHENTICATED_WEBHOOK=true
#   NEXT_PUBLIC_APP_URL=http://localhost:3000

# Run
npm run dev
```

### Test Email Ingestion Locally

Cloudflare Email Routing can't reach localhost. Simulate the webhook:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "sender@example.com",
    "to": "test@example.com",
    "subject": "Test email",
    "text": "Hello from local test",
    "html": "<p>Hello from local test</p>",
    "attachments": []
  }'
```

### Run Tests

```bash
npm run lint     # 0 errors expected
npm test         # 214 tests
npm run build    # turbopack build
```

---

## Netlify Free Tier Limitations

| Resource | Free Tier Limit |
|----------|----------------|
| Compute credits | 300/month |
| Serverless function timeout | 60 seconds |
| Streaming timeout | 10 seconds |
| Function memory | 1 GB |
| Request payload size | 6 MB |
| Build minutes | 300/month |

**Tips to stay within free tier:**
- Inbox polling is 10s (not 5s) to reduce function invocations
- MongoDB connection is cached globally to avoid reconnect per request
- `maxPoolSize: 3` on MongoDB client to prevent connection exhaustion
- Rate limits prevent abuse from exhausting credits
- Static assets (favicon, branding) are cached by the browser

---

## Architecture Diagram

```
                    ┌─────────────────────┐
                    │   Cloudflare DNS    │
                    │   + Email Routing   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Cloudflare Worker  │
                    │  (dispomail-        │
                    │   forwarder)        │
                    │  - postal-mime      │
                    │  - x-webhook-secret │
                    └──────────┬──────────┘
                               │ POST /api/webhook
                    ┌──────────▼──────────┐
                    │   Netlify (Next.js) │
                    │  - Auth (3-mode)    │
                    │  - Rate limiting    │
                    │  - Zod validation   │
                    │  - Turnstile        │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │    MongoDB Atlas    │
                    │  - kv_store (TTL)   │
                    │  - list_meta        │
                    │  - list_items       │
                    └─────────────────────┘
```

---

## Troubleshooting

### Webhook returns 401
- Check `WEBHOOK_SECRET` is set in BOTH Netlify and Worker
- Worker must send `x-webhook-secret` header with the same value
- For local dev: set `ALLOW_UNAUTHENTICATED_WEBHOOK=true`

### Inbox shows no emails
- Verify domains are configured in Admin → Domains
- Check MongoDB connection (`MONGODB_URI` must be reachable from Netlify)
- Try `curl "https://<app>.netlify.app/api/inbox?address=test@yourdomain.com"`

### Rate limited (429)
- Inbox polling: 15 req/min for anonymous/session, 60/min for API key
- Domain expiration: 10 req/min for anonymous
- Global limit: 120 req/min anonymous, 180/min session, 300/min API key

### Build fails on Netlify
- Ensure `MONGODB_URI` is set with scope **Functions** (not just Build)
- Check `npm run build` passes locally with `MONGODB_URI= npm run build`

### Worker not receiving emails
- Verify Cloudflare Email Routing is enabled for the domain
- Check catch-all route points to `dispomail-forwarder`
- Check worker logs: `npx wrangler tail`

### "No deployed Email Workers found" in the routing rule dropdown
- Confirm the Worker was deployed with `npx wrangler deploy` from the `worker/` directory
- Confirm `worker/src/index.js` only exports an `email()` handler (no `fetch()` handler)
- Confirm the Worker name in `worker/wrangler.toml` is `dispomail-forwarder`
- Refresh the Cloudflare dashboard page after deploying
- Make sure the domain is fully onboarded in **Email Service** → **Email Routing** before creating the rule

---

## Security Checklist

- [ ] `WEBHOOK_SECRET` set in both Netlify + Worker (fail-closed)
- [ ] `ADMIN_PASSWORD` is a strong random string
- [ ] `CRON_SECRET` set (cron endpoint is fail-closed)
- [ ] `.env.local` is NOT committed to git
- [ ] Homepage lock enabled if you want private access
- [ ] API keys generated only for trusted users
- [ ] Turnstile enabled on admin login
- [ ] MongoDB Atlas network access set to `0.0.0.0/0` (or Netlify IPs)
