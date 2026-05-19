# FoodNearMe

AI-native local food discovery and ordering infrastructure.

## Repository Layout

- `apps/web` - Next.js app (landing, dashboard, API routes, public agent files)
- `apps/admin` - optional separate internal admin panel
- `services/api` - optional standalone backend service
- `services/worker` - background jobs (ADO scoring, sync tasks, webhooks)
- `services/ingestion` - menu import/extraction pipeline (PDF/image -> MP)
- `packages/menu-protocol` - shared Menu Protocol schema, validators, and types
- `packages/x402-middleware` - shared x402 payment middleware
- `packages/shared` - shared utilities and domain types
- `database/migrations` - SQL migrations
- `database/seeds` - local/dev seed data
- `database/views` - analytics/KPI SQL views
- `database/schema.sql` - canonical schema snapshot
- `infra` - deployment and infra configs (Vercel, Supabase, Meilisearch, monitoring)
- `scripts` - one-off and repeatable maintenance scripts
- `tests/e2e` - end-to-end tests
- `tests/integration` - integration tests
- `tests/contracts` - smart contract/payment flow tests
- `docs/strategy` - business strategy docs
- `docs/product` - product/technical planning docs
- `docs/ops` - operating docs, checklists, and metrics

## First Setup Steps

1. Initialize git and package manager workspace.
2. Scaffold `apps/web` with Next.js App Router.
3. Connect Supabase and apply migrations in `database/migrations`.
4. Implement x402 middleware in `packages/x402-middleware`.
5. Publish `apps/web/SKILL.md` and `apps/web/.well-known/agent.json`.

## Notes

- This structure is optimized for scaling from single-app MVP to multi-service architecture.
- Keep business docs in `docs/*` and implementation code in `apps/services/packages`.

## Lead Capture Integration

Food landing page lead form is wired to:
- Supabase table: `public.audit_leads`
- Optional notification emails via Resend

Migration:
- `database/migrations/20260505_create_audit_leads.sql`

Health check endpoint:
- `GET /api/health/leads`
