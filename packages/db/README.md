# @etimaad/db

Drizzle schema and SQL migrations. Design: blueprint section 8.1.

## Files

| File | What it is |
|---|---|
| `src/enums.ts` | Postgres enums. Shared values come from `@etimaad/core`. |
| `src/schema.ts` | All 21 tables |
| `src/client.ts` | `createDb(url)` for the Supabase pooler (prepared statements off) |
| `migrations/` | Generated SQL plus hand edits |

## Hand edits in `0000_init.sql`

- `order_events` and `lookup_audit_log` are `PARTITION BY RANGE` (monthly).
- `ensure_monthly_partition(parent, month)` creates a month partition.
- The migration creates partitions for the current month and the next 2.

Drizzle does not know about partitioning. Keep these edits if the migration is regenerated.

## Commands

```bash
pnpm db:generate
```

- `db:generate` only writes SQL files. It does not connect to a database.
- There is no migrate or seed script on purpose. Applying migrations or writing data needs explicit approval.
