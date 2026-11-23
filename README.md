# Etimaad

Cross-vendor customer trust and COD risk scoring for Pakistani merchants.

Full design: [docs/BLUEPRINT.md](docs/BLUEPRINT.md)

## Structure

| Path | What it is |
|---|---|
| `apps/web` | Next.js app: public API (`/v1/*`), job routes, admin console |
| `apps/shopify` | Shopify app (not generated yet) |
| `packages/core` | Scoring, reason codes, state machine, phone rules. No I/O. |
| `packages/db` | Drizzle schema and SQL migrations |
| `packages/sdk` | TypeScript client for the public API |
| `plugins/woocommerce` | WooCommerce plugin (PHP) |
| `docs` | Blueprint and guides |

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

## Local API

In development the API uses an in-memory dev store (not a database), even when `DATABASE_URL` is set.
It is seeded with 3 demo vendors from `apps/web/src/server/dev-credentials.json`. Data is lost when the
server restarts. Set `ETIMAAD_STORE=postgres` only when you mean to use the real database locally.

```bash
pnpm dev
pnpm --filter @etimaad/web demo
```

| Endpoint | Auth |
|---|---|
| `POST /v1/order-events` | API key + signature |
| `POST /v1/risk/check` | API key |
| `GET /v1/health` | None |

In production the API uses the Postgres store. It needs `DATABASE_URL`, `PHONE_PEPPER_V1` and
`SIGNING_SECRET_KEY` (see `.env.example`), and answers `503` when they are missing. The database also needs
the migrations and the reference data (reason codes, scoring model v1) before the API can save orders.

## Local login

- `/vendor/*` and `/admin/*` need a login. `src/proxy.ts` checks the session cookie, and each portal layout checks again.
- Local accounts (vendor owner, vendor staff, admin) and the shared dev password are in `apps/web/src/server/dev-credentials.json`.
- Only the vendor owner can open API keys and Settings.
- In production, Supabase Auth checks the email and password. The user must also be linked in `admin_users` or `vendor_users`.
- Production needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SESSION_SECRET`. Without them the login page says it is not available.
- Locally, set `ETIMAAD_AUTH=supabase` to try Supabase login instead of the dev accounts.

### Add a portal user (production)

1. Supabase: Authentication > Users > Add user (email and password). Etimaad never sees the password.
2. Link the user (writes to the database, needs approval):

```bash
DATABASE_MIGRATION_URL=... pnpm --filter @etimaad/web link-user --kind admin --email you@company.pk --name "Your Name" --role ADMIN --yes
```

## Rules

- All repo files are in English.
- Do not write or delete database data without explicit approval. This includes seeds and data migrations.
- Never commit `.env` files or secrets.
