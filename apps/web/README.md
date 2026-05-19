# FoodNearMe Web App

Next.js App Router frontend and API routes for `foodnear.me`.

## Core Routes

- `/` marketing landing page
- `/tokenization` tokenization explainer page
- `POST /api/leads` lead capture endpoint (Supabase insert + optional Resend email)
- `GET /api/health/leads` integration health check

## Anti-Spam Controls

Lead endpoint includes:
- honeypot field (`companyWebsite`)
- IP burst protection
- IP rolling-window rate limit
- email rolling-window rate limit
- origin/referrer allowlist check
- lightweight scripted-client user-agent filter (silently ignored)
- randomized response delay (250-450ms) for silently ignored spam-like requests
- randomized response delay (250-450ms) for 429 rate-limit responses

## Setup

1. Copy root `.env.example` values into your local `.env`.
2. Apply DB migration:
   - `database/migrations/20260505_create_audit_leads.sql`
3. Start dev server from repo root:

```bash
npm run dev
```

## Validate Lead Integration

Call health endpoint:

```bash
curl -s http://localhost:3000/api/health/leads
```

If correctly configured, returns:

```json
{ "ok": true, "message": "Lead capture integration is healthy", "resendConfigured": true }
```

## Required Environment Variables (Lead Capture)

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Optional (Email Notifications)

- `RESEND_API_KEY`
- `LEADS_NOTIFICATION_TO`
- `LEADS_FROM_EMAIL`
- `LEADS_ALLOWED_ORIGINS` (comma-separated; optional but recommended)

