// Maps Supabase Auth user ids to admin and vendor users on a throwaway PGlite database.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { adminUsers, vendorUsers, vendors } from "@etimaad/db";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linkPortalUser } from "./portal-user-admin";
import { PostgresStore } from "./postgres-store";

const migrationsDir = fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url));
const statements = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .flatMap((f) => readFileSync(join(migrationsDir, f), "utf8").split("--> statement-breakpoint"))
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const AUTH = {
  admin: "10000000-0000-4000-8000-000000000001",
  owner: "10000000-0000-4000-8000-000000000002",
  disabledStaff: "10000000-0000-4000-8000-000000000003",
  terminatedVendorUser: "10000000-0000-4000-8000-000000000004",
  both: "10000000-0000-4000-8000-000000000005",
  unknown: "10000000-0000-4000-8000-000000000099",
};
const ACTIVE_VENDOR = "20000000-0000-4000-8000-000000000001";
const TERMINATED_VENDOR = "20000000-0000-4000-8000-000000000002";

describe("PostgresStore.findPortalUserByAuthId", () => {
  let client: PGlite;
  let store: PostgresStore;

  beforeAll(async () => {
    client = new PGlite();
    for (const s of statements) await client.exec(s);
    const db = drizzle(client);
    await db.insert(vendors).values([
      { id: ACTIVE_VENDOR, legalName: "Active Ltd", displayName: "Active", category: "ecommerce", status: "ACTIVE" },
      { id: TERMINATED_VENDOR, legalName: "Gone Ltd", displayName: "Gone", category: "food", status: "TERMINATED" },
    ]);
    await db.insert(adminUsers).values([
      { authUserId: AUTH.admin, name: "Admin", workEmail: "admin@etimaad.pk", role: "ADMIN" },
      { authUserId: AUTH.both, name: "Both", workEmail: "both@etimaad.pk", role: "SUPPORT" },
    ]);
    await db.insert(vendorUsers).values([
      { vendorId: ACTIVE_VENDOR, authUserId: AUTH.owner, name: "Owner", email: "owner@active.pk", role: "OWNER" },
      {
        vendorId: ACTIVE_VENDOR,
        authUserId: AUTH.disabledStaff,
        name: "Staff",
        email: "staff@active.pk",
        role: "STAFF",
        status: "DISABLED",
      },
      { vendorId: TERMINATED_VENDOR, authUserId: AUTH.terminatedVendorUser, name: "Old", email: "old@gone.pk", role: "OWNER" },
      { vendorId: ACTIVE_VENDOR, authUserId: null, name: "Both as vendor", email: "both@active.pk", role: "STAFF" },
    ]);
    store = new PostgresStore(db, { signingKey: null });
  });

  afterAll(async () => {
    await client.close();
  });

  it("maps an admin", async () => {
    expect(await store.findPortalUserByAuthId(AUTH.admin)).toMatchObject({
      kind: "admin",
      role: "ADMIN",
      email: "admin@etimaad.pk",
      vendorId: null,
      status: "ACTIVE",
    });
  });

  it("maps a vendor owner with the vendor id", async () => {
    expect(await store.findPortalUserByAuthId(AUTH.owner)).toMatchObject({
      kind: "vendor",
      role: "OWNER",
      vendorId: ACTIVE_VENDOR,
      status: "ACTIVE",
    });
  });

  it("marks a disabled user and a terminated vendor's user as DISABLED", async () => {
    expect((await store.findPortalUserByAuthId(AUTH.disabledStaff))?.status).toBe("DISABLED");
    expect((await store.findPortalUserByAuthId(AUTH.terminatedVendorUser))?.status).toBe("DISABLED");
  });

  it("returns null for an unknown Supabase user", async () => {
    expect(await store.findPortalUserByAuthId(AUTH.unknown)).toBeNull();
  });

  it("links a new admin, and re-links an existing email instead of duplicating it", async () => {
    const db = drizzle(client);
    const first = "30000000-0000-4000-8000-000000000001";
    const second = "30000000-0000-4000-8000-000000000002";
    const id1 = await linkPortalUser(db, { kind: "admin", email: "New@Etimaad.pk", name: "New", role: "SUPPORT" }, first);
    const id2 = await linkPortalUser(db, { kind: "admin", email: "new@etimaad.pk", name: "New", role: "ADMIN" }, second);
    expect(id2).toBe(id1);
    expect(await store.findPortalUserByAuthId(first)).toBeNull();
    expect(await store.findPortalUserByAuthId(second)).toMatchObject({ kind: "admin", role: "ADMIN", email: "new@etimaad.pk" });
  });

  it("links a vendor user to its vendor", async () => {
    const db = drizzle(client);
    const auth = "30000000-0000-4000-8000-000000000003";
    await linkPortalUser(
      db,
      { kind: "vendor", email: "staff2@active.pk", name: "Staff 2", role: "STAFF", vendorId: ACTIVE_VENDOR },
      auth,
    );
    expect(await store.findPortalUserByAuthId(auth)).toMatchObject({ kind: "vendor", vendorId: ACTIVE_VENDOR, role: "STAFF" });
  });
});
