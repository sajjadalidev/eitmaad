# @etimaad/db

Drizzle schema and SQL migrations. Design: blueprint section 8.1.

## Files

| File | What it is |
|---|---|
| `src/enums.ts` | Postgres enums. Shared values come from `@etimaad/core`. |
| `src/schema.ts` | All 22 tables |
| `src/client.ts` | `createDb(url)` for the Supabase pooler (prepared statements off) |
| `src/seed-data.ts` | Rows for `reason_codes` and `score_model_versions`. Builds rows only. |
| `migrations/` | Generated SQL plus hand-written parts |
| `scripts/migrate.mjs` | Applies pending migrations. Needs `--yes`. |

## Hand-written SQL

| Migration | What |
|---|---|
| `0000_init.sql` | `order_events` and `lookup_audit_log` are `PARTITION BY RANGE` (monthly); `ensure_monthly_partition()`; partitions for the current month and the next 2 |
| `0003_lock_down_public_access.sql` | Row level security on every table, no grants for Supabase `anon` and `authenticated`, new partitions get row level security too |
| `0004_vendor_applications.sql` | Last line: row level security on the new table. **Every new table needs this line.** |

Drizzle does not know about partitioning or row level security. Keep these parts if a migration is regenerated.

## Commands

```bash
pnpm db:generate
```

- Writes SQL files only. Does not connect to a database.

```bash
DATABASE_MIGRATION_URL=... pnpm db:migrate --yes
```

- **Changes a real database. Run only with explicit approval.**
- Use the Supabase "Session pooler" string (port 5432).
```bash
DATABASE_MIGRATION_URL=... pnpm db:seed-reference --yes
```

- **Writes to a real database. Run only with explicit approval.**
- Inserts the 16 reason codes and scoring model v1. Existing rows are never changed, so running it again is safe.

## Status

- Supabase (Mumbai): migrations 0000 to 0004 applied.
- Reference data seeded: 16 reason codes, scoring model v1. All other tables are empty.
