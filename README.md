# Vaultmail

A privacy-focused disposable email service built with **Next.js 16**, **React 19**, **TypeScript**, and **MongoDB**. Features real-time inbox, custom domain support, IMAP fetch, API key protection, Cloudflare Turnstile, and a dark glassmorphism UI.

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![MongoDB](https://img.shields.io/badge/MongoDB-47A248)

**For detailed deployment instructions, see [GUIDE.md](./GUIDE.md).**

## Architecture

```
Sender email
    ->
Cloudflare Email Routing (catch-all on your domain)
    ->
Cloudflare Worker (dispomail-forwarder)
    - Parse with postal-mime
    - Optionally forward copy to FORWARD_EMAIL
    - POST to /api/webhook with x-webhook-secret header
    ->
Netlify app: POST /api/webhook
    - Validate shared secret (fail-closed)
    - Validate recipient domain
    - Store in MongoDB (inbox:<address>)
    - Set TTL (configurable retention)
    - Optional Telegram notification
    ->
User browses / -> InboxInterface polls GET /api/inbox -> displays emails
```

**IMAP fetch** (optional): Admin configures an IMAP account. `GET /api/inbox` pulls new emails via raw TLS IMAP client, deduplicates by `sourceId`, stores alongside webhook emails.

## Features

- Privacy-first: emails stored in MongoDB with auto-expiry (30 min to 1 week)
- Custom domains: admin-configured, multi-subdomain support (root + subdomain pools)
- Cloudflare domain onboarding: add domains via Cloudflare API from the admin UI (auto-configures nameservers, Email Routing, catch-all rule)
- Domain request modal: public "Request domain" button on homepage with Turnstile-protected submission flow, nameserver display, and admin notification panel
- Telegram notifications: admin gets Telegram message on new domain request (no email notifications for privacy)
- Real-time inbox: auto-refreshes every 10 seconds
- 3-mode auth: API key (50 req/min), session (15 req/min), anonymous (rate-limited)
- Per-endpoint rate limits with global abuse ceiling
- Cloudflare Turnstile: free bot protection on admin login
- Timing-safe admin password verification (SHA-256 hash + crypto.timingSafeEqual)
- HSTS + forced secure cookies in production
- Settings cache: in-memory TTL cache for `settings:*` reads (reduces MongoDB load)
- Domain source tracking: `admin` vs `user-request` — only user-requested domains can be removed via user request flow
- Dynamic branding: admin-configurable app name, favicon, and accent color
- Donation button: floating coffee icon on all pages with EVM address QR code (admin-configurable)
- Dark glassmorphism UI with responsive mobile design
- Tools: 2FA generator, Gmail dot trick, token generator, URL codec, email breach checker
- Developer API access page (gated by API key)
- IMAP fetch (raw TLS, runtime-hardened with socket timeouts)
- Vitest test suite (225 tests)
- Zod validation at all API boundaries
- CI/CD via GitHub Actions (lint + test + build)

## Quick Start

```bash
# 1. Start MongoDB
docker run -d --name vaultmail-mongo -p 27017:27017 -v vaultmail-mongo-data:/data/db mongo:7

# 2. Install
cd vaultmail && npm install

# 3. Configure env
cp .env.example .env.local
# Edit .env.local: set MONGODB_URI, ADMIN_PASSWORD, ALLOW_UNAUTHENTICATED_WEBHOOK=true

# 4. Run
npm run dev
```

Open http://localhost:3000 → admin at /admin → configure domains, branding, API keys.

For full deployment instructions (Netlify + Cloudflare Worker + Email Routing), see **[GUIDE.md](./GUIDE.md)**.

## Verification

```bash
npm run lint     # eslint (0 errors)
npm test         # vitest (214 tests)
npm run build    # next build (turbopack)
```

## License

MIT License. Feel free to fork and deploy your own private email shield.

## Credits

Based on [Yimikami/vaultmail](https://github.com/Yimikami/vaultmail) (original), [yasirarism/vaultmail](https://github.com/yasirarism/vaultmail), and [jawkills/vaultmail](https://github.com/jawkills/vaultmail). Modified with extensive security, testing, and feature additions.
