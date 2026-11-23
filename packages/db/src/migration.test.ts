// Runs all SQL migrations on a throwaway in-memory Postgres (PGlite).
// No real database is touched. Checks structure only, no rows are inserted.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema";

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));
const statements = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .flatMap((file) => readFileSync(join(migrationsDir, file), "utf8").split("--> statement-breakpoint"))
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const schemaTableNames = Object.values(schema as Record<string, unknown>)
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableName(table))
  .sort();

describe("migrations on in-memory Postgres", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    for (const statement of statements) await db.exec(statement);
  });

  afterAll(async () => {
    await db.close();
  });

  it("creates every table from the Drizzle schema, and nothing else", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
       order by c.relname`,
    );
    expect(schemaTableNames).toHaveLength(21);
    expect(rows.map((r) => r.relname)).toEqual(schemaTableNames);
  });

  it("partitions order_events and lookup_audit_log by range", async () => {
    const { rows } = await db.query<{ relname: string; strategy: string }>(
      `select c.relname, p.partstrat as strategy from pg_partitioned_table p
       join pg_class c on c.oid = p.partrelid order by c.relname`,
    );
    expect(rows).toEqual([
      { relname: "lookup_audit_log", strategy: "r" },
      { relname: "order_events", strategy: "r" },
    ]);
  });

  it("creates partitions for this month and the next 2", async () => {
    const { rows } = await db.query<{ parent: string; count: number }>(
      `select parent.relname as parent, count(*)::int as count from pg_inherits i
       join pg_class parent on parent.oid = i.inhparent
       where parent.relkind = 'p'
       group by parent.relname order by parent.relname`,
    );
    expect(rows).toEqual([
      { parent: "lookup_audit_log", count: 3 },
      { parent: "order_events", count: 3 },
    ]);
  });

  it("partition helper is idempotent and refuses other tables", async () => {
    await db.query(`select ensure_monthly_partition('order_events', current_date)`);
    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count from pg_inherits i
       join pg_class parent on parent.oid = i.inhparent where parent.relname = 'order_events'`,
    );
    expect(rows[0]?.count).toBe(3);
    await expect(db.query(`select ensure_monthly_partition('orders', current_date)`)).rejects.toThrow(
      /unsupported table/,
    );
  });

  it("has the partial unique indexes", async () => {
    const { rows } = await db.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
       where indexname in ('customer_identifiers_active_uq', 'disputes_one_open_per_order_uq')
       order by indexname`,
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.indexdef).toMatch(/UNIQUE INDEX/);
      expect(row.indexdef).toMatch(/WHERE/);
    }
  });

  it("enforces one order per vendor reference", async () => {
    const { rows } = await db.query<{ conname: string }>(
      `select conname from pg_constraint where conname = 'orders_vendor_ref_uq' and contype = 'u'`,
    );
    expect(rows).toHaveLength(1);
  });
});
