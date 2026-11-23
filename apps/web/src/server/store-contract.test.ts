// The same API scenarios run against both stores: in-memory and Postgres.
// Postgres runs on PGlite, a throwaway in-memory database. No real database is touched.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sha256Hex, type VendorStatus } from "@etimaad/core";
import { apiKeys, reasonCodeRows, reasonCodes, scoreModelRow, scoreModelVersions, vendors } from "@etimaad/db";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { APPROVAL_CHECKS, reviewApplication } from "./application-review";
import { authenticate } from "./auth";
import { findCustomerByPhone, loadCustomerDetail, recomputeForAdmin } from "./customer-detail";
import { manageVendor } from "./vendor-management";
import type { InviteResult } from "./account-invites";
import { AGREEMENT_VERSION, acceptAgreement, hasCurrentAgreement } from "./agreement";
import { inviteVendorUser, setVendorUserStatus } from "./vendor-accounts";
import { createOwnApiKey, revokeOwnApiKey, saveOwnSettings } from "./vendor-self-service";
import { ingestEvents } from "./ingest";
import { InMemoryStore } from "./memory-store";
import { PostgresStore } from "./postgres-store";
import { riskCheck } from "./risk";
import { sealSecret } from "./secret-box";
import type { EtimaadStore, VendorRecord } from "./store";
import { ALL_SCOPES, NOW, PEPPER, event, keyFor, refusal, secretFor, signedHeaders } from "./test-helpers";

const SIGNING_KEY = "test-signing-key-0123456789-abcdefghij";
const LETTERS = ["a", "b", "c", "d"] as const;
type Letter = (typeof LETTERS)[number];
const VENDOR_ID: Record<Letter, string> = {
  a: "00000000-0000-4000-8000-0000000000a1",
  b: "00000000-0000-4000-8000-0000000000b1",
  c: "00000000-0000-4000-8000-0000000000c1",
  d: "00000000-0000-4000-8000-0000000000d1",
};

interface Harness {
  store: EtimaadStore;
  close: () => Promise<void>;
}

const migrationsDir = fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url));
const statements = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .flatMap((f) => readFileSync(join(migrationsDir, f), "utf8").split("--> statement-breakpoint"))
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

async function memoryHarness(statuses: Partial<Record<Letter, VendorStatus>> = {}): Promise<Harness> {
  const store = new InMemoryStore();
  for (const l of LETTERS) {
    store.addVendor({
      id: VENDOR_ID[l],
      displayName: `Vendor ${l}`,
      status: statuses[l] ?? "ACTIVE",
      trustWeight: 1,
      faultClaimBias: 1,
      settings: {},
    });
    store.addApiKey(
      {
        id: `key-${l}`,
        vendorId: VENDOR_ID[l],
        keyPrefix: `test${l.repeat(4)}`,
        keyHash: sha256Hex(keyFor(l)),
        scopes: ALL_SCOPES,
        signingSecretRef: `ref-${l}`,
        status: "ACTIVE",
        expiresAt: null,
      },
      secretFor(l),
    );
  }
  return { store, close: async () => {} };
}

async function postgresHarness(statuses: Partial<Record<Letter, VendorStatus>> = {}): Promise<Harness> {
  const client = new PGlite();
  for (const statement of statements) await client.exec(statement);
  // The migration creates partitions from the real date; make sure the test month exists too.
  for (const table of ["order_events", "lookup_audit_log"]) {
    await client.query(`select ensure_monthly_partition($1, $2::date)`, [table, NOW.toISOString().slice(0, 10)]);
  }

  const db = drizzle(client);
  await db.insert(scoreModelVersions).values(scoreModelRow(NOW));
  await db.insert(reasonCodes).values(reasonCodeRows());
  for (const l of LETTERS) {
    await db.insert(vendors).values({
      id: VENDOR_ID[l],
      legalName: `Vendor ${l} Pvt Ltd`,
      displayName: `Vendor ${l}`,
      category: "ecommerce",
      status: statuses[l] ?? "ACTIVE",
      trustWeight: 1,
      faultClaimBias: 1,
      settings: {},
    });
    await db.insert(apiKeys).values({
      vendorId: VENDOR_ID[l],
      keyPrefix: `test${l.repeat(4)}`,
      keyHash: sha256Hex(keyFor(l)),
      scopes: [...ALL_SCOPES],
      signingSecretRef: sealSecret(secretFor(l), SIGNING_KEY),
    });
  }
  return { store: new PostgresStore(db, { signingKey: SIGNING_KEY }), close: () => client.close() };
}

const HARNESSES = [
  ["in-memory store", memoryHarness],
  ["Postgres store (PGlite)", postgresHarness],
] as const;

async function vendorOf(store: EtimaadStore, l: Letter): Promise<VendorRecord> {
  const v = await store.getVendor(VENDOR_ID[l]);
  if (!v) throw new Error(`Missing vendor ${l}`);
  return v;
}

const ctx = (store: EtimaadStore) => ({ store, pepper: PEPPER, keyVersion: 1, now: NOW });

// Stands in for Supabase: hands out new login ids and records password links.
function fakeInviter() {
  const inviter = {
    sendsEmail: true,
    lastId: null as string | null,
    next: null as InviteResult | null,
    links: [] as string[],
    async invite(): Promise<InviteResult> {
      const result = inviter.next ?? { status: "INVITED" as const, authUserId: crypto.randomUUID() };
      inviter.next = null;
      if (result.status === "INVITED") inviter.lastId = result.authUserId;
      return result;
    },
    async sendPasswordLink(email: string) {
      inviter.links.push(email);
      return true;
    },
  };
  return inviter;
}

const APPLICATION = {
  legalName: "Acme Traders Pvt Ltd",
  displayName: "Acme",
  category: "ecommerce" as const,
  businessType: "PVT_LTD" as const,
  platform: "WOOCOMMERCE" as const,
  storeUrl: "https://acme.pk",
  contactName: "Ali",
  contactEmail: "ali@acme.pk",
  ipHash: "hash-9",
  status: "NEW" as const,
};

async function report(store: EtimaadStore, l: Letter, events: unknown[]) {
  return ingestEvents(ctx(store), await vendorOf(store, l), { events });
}

async function check(store: EtimaadStore, l: Letter, phone: string, orderValue = 3000) {
  const apiKey = await store.findApiKeyByPrefix(`test${l.repeat(4)}`);
  if (!apiKey) throw new Error(`Missing API key for ${l}`);
  return riskCheck(ctx(store), await vendorOf(store, l), apiKey.id, { phone, order_value_pkr: orderValue });
}

async function withHarness(make: () => Promise<Harness>, run: (store: EtimaadStore) => Promise<void>) {
  const h = await make();
  try {
    await run(h.store);
  } finally {
    await h.close();
  }
}

describe.each(HARNESSES)("%s", (_name, make) => {
  it("authenticates a signed request", async () => {
    await withHarness(make, async (store) => {
      const body = '{"events":[]}';
      const result = await authenticate({
        headers: signedHeaders("a", body),
        rawBody: body,
        now: NOW,
        store,
        scope: "events:write",
        requireSignature: true,
      });
      expect(result.vendor.id).toBe(VENDOR_ID.a);
    });
  });

  it("accepts, deduplicates and detects conflicts", async () => {
    await withHarness(make, async (store) => {
      const e = event();
      expect((await report(store, "a", [e])).body.results[0]?.result).toBe("ACCEPTED");
      expect((await report(store, "a", [e])).body.results[0]?.result).toBe("DUPLICATE");
      expect((await report(store, "a", [{ ...e, order_value_pkr: 1 }])).body.results[0]?.code).toBe(
        "IDEMPOTENCY_CONFLICT",
      );
    });
  });

  it("handles the same event sent twice at the same time", async () => {
    await withHarness(make, async (store) => {
      const e = event();
      const [first, second] = await Promise.all([report(store, "a", [e]), report(store, "a", [e])]);
      const results = [first.body.results[0]?.result, second.body.results[0]?.result].sort();
      expect(results).toEqual(["ACCEPTED", "DUPLICATE"]);
    });
  });

  it("applies corrections to the stored order", async () => {
    await withHarness(make, async (store) => {
      const r = refusal();
      await report(store, "a", [r]);
      const fix = { ...r, event_id: `${String(r.event_id)}-fix`, reason_code: "RIDER_ISSUE", is_correction: true };
      expect((await report(store, "a", [fix])).body.results[0]?.result).toBe("ACCEPTED");
      const order = await store.findOrder(VENDOR_ID.a, String(r.external_order_ref));
      expect(order?.derivedFault).toBe("LOGISTICS");
      expect(order?.version).toBe(2);
    });
  });

  it("marks refusals from 2 merchants as HIGH", async () => {
    await withHarness(make, async (store) => {
      await report(store, "a", [refusal({ phone: "03004444444" })]);
      await report(store, "b", [refusal({ phone: "03004444444" })]);
      const r = await check(store, "c", "03004444444");
      expect(r.risk_tier).toBe("HIGH");
      expect(r.recommended_action).toBe("PREPAID_ONLY");
    });
  });

  it("shows the score only with 3 or more merchants", async () => {
    await withHarness(make, async (store) => {
      for (const l of ["a", "b", "c"] as const) await report(store, l, [event({ phone: "03005555555" })]);
      const r = await check(store, "d", "03005555555");
      expect(typeof r.score).toBe("number");
      expect(r.network_signal?.vendor_count_band).toBe("2-4");
    });
  });

  it("applies the vendor's own history rule", async () => {
    await withHarness(make, async (store) => {
      await report(store, "a", [refusal({ phone: "03006666666" }), refusal({ phone: "03006666666" })]);
      const own = await check(store, "a", "03006666666");
      expect(own.recommended_action).toBe("PREPAID_ONLY");
      expect(own.your_history).toMatchObject({ orders: 2, user_fault: 2 });
    });
  });

  it("answers an unknown phone like a thin-data customer", async () => {
    await withHarness(make, async (store) => {
      await report(store, "a", [event({ phone: "03007777777" })]);
      expect(await check(store, "c", "03007777777")).toEqual(await check(store, "c", "03008888888"));
    });
  });

  it("saves, counts and lists vendor applications", async () => {
    await withHarness(make, async (store) => {
      const base = {
        legalName: "Acme Traders Pvt Ltd",
        displayName: "Acme",
        category: "ecommerce" as const,
        businessType: "PVT_LTD" as const,
        platform: "WOOCOMMERCE" as const,
        storeUrl: null,
        contactName: "Ali",
        ipHash: "hash-1",
        status: "NEW" as const,
      };
      await store.saveApplication({ ...base, id: "00000000-0000-4000-8000-000000000001", contactEmail: "a@shop.pk", createdAt: new Date(NOW.getTime() - 2 * 3_600_000) });
      await store.saveApplication({ ...base, id: "00000000-0000-4000-8000-000000000002", contactEmail: "a@shop.pk", createdAt: NOW });
      await store.saveApplication({ ...base, id: "00000000-0000-4000-8000-000000000003", contactEmail: "b@shop.pk", createdAt: NOW, ipHash: "hash-2" });

      const hourAgo = new Date(NOW.getTime() - 3_600_000);
      expect(await store.countApplicationsSince({ contactEmail: "a@shop.pk" }, hourAgo)).toBe(1);
      expect(await store.countApplicationsSince({ contactEmail: "a@shop.pk" }, new Date(0))).toBe(2);
      expect(await store.countApplicationsSince({ ipHash: "hash-1" }, new Date(0))).toBe(2);

      const list = await store.listApplications(2);
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.createdAt.getTime() === NOW.getTime())).toBe(true);
    });
  });

  it("reports admin and vendor overview counts", async () => {
    await withHarness(make, async (store) => {
      await report(store, "a", [event({ phone: "03001010101" }), refusal({ phone: "03001010101", reason_code: "OTHER" })]);
      await check(store, "a", "03001010101");
      await store.saveApplication({
        id: "00000000-0000-4000-8000-000000000010",
        legalName: "Acme Traders Pvt Ltd",
        displayName: "Acme",
        category: "ecommerce",
        businessType: "PVT_LTD",
        platform: "API",
        storeUrl: null,
        contactName: "Ali",
        contactEmail: "a@shop.pk",
        ipHash: null,
        status: "NEW",
        createdAt: NOW,
      });

      expect(await store.adminOverview()).toEqual({
        applications: { NEW: 1, REVIEWING: 0, DOCUMENTS_REQUESTED: 0, APPROVED: 0, REJECTED: 0 },
        vendors: { PENDING_VERIFICATION: 0, PROBATION: 0, ACTIVE: 4, RESTRICTED: 0, TERMINATED: 0 },
        disputesForReview: 0,
      });
      expect(await store.listApplications(10, "NEW")).toHaveLength(1);
      expect(await store.listApplications(10, "APPROVED")).toHaveLength(0);
      expect(
        await store.vendorOverview(VENDOR_ID.a, new Date(NOW.getTime() - 30 * 86_400_000), new Date(NOW.getTime() - 3_600_000)),
      ).toEqual({ ordersReported30Days: 2, lookupsToday: 1, ordersMissingReason: 1, openDisputes: 0 });
      expect(
        await store.vendorOverview(VENDOR_ID.b, new Date(NOW.getTime() - 30 * 86_400_000), new Date(NOW.getTime() - 3_600_000)),
      ).toEqual({ ordersReported30Days: 0, lookupsToday: 0, ordersMissingReason: 0, openDisputes: 0 });
    });
  });

  it("lists vendor summaries, orders and lookups", async () => {
    await withHarness(make, async (store) => {
      await report(store, "a", [event({ phone: "03001212121" }), refusal({ phone: "03001212121" })]);
      await check(store, "a", "03001212121", 4500);
      const since = new Date(NOW.getTime() - 30 * 86_400_000);

      const summaries = await store.listVendorSummaries(since);
      expect(summaries.map((s) => s.displayName)).toEqual(["Vendor a", "Vendor b", "Vendor c", "Vendor d"]);
      expect(summaries[0]).toMatchObject({ orders30Days: 2, userFaults30Days: 1, lookups30Days: 1, portalUsers: 0 });
      expect(summaries[0]?.legalName).toMatch(/^Vendor a/);
      expect(summaries[0]?.createdAt).toBeInstanceOf(Date);
      expect(summaries[1]).toMatchObject({ orders30Days: 0, userFaults30Days: 0, lookups30Days: 0 });

      const orders = await store.listVendorOrders(VENDOR_ID.a, 10);
      expect(orders).toHaveLength(2);
      expect(orders[0]!.occurredAt.getTime()).toBeGreaterThanOrEqual(orders[1]!.occurredAt.getTime());
      expect(await store.listVendorOrders(VENDOR_ID.b, 10)).toEqual([]);

      const lookups = await store.listVendorLookups(VENDOR_ID.a, 10);
      expect(lookups).toHaveLength(1);
      expect(lookups[0]).toMatchObject({ orderValuePkr: 4500 });
      expect(lookups[0]).not.toHaveProperty("phoneHash");
    });
  });

  it("runs the application review flow up to approval", async () => {
    await withHarness(make, async (store) => {
      const appId = "00000000-0000-4000-8000-000000000020";
      await store.saveApplication({ ...APPLICATION, id: appId, createdAt: NOW });
      const review = (role: string, input: Record<string, unknown>) =>
        reviewApplication({ store, now: NOW }, { id: `user-${role}`, name: `${role} user`, role }, { applicationId: appId, ...input });

      expect(await review("SUPPORT", { action: "START_REVIEW" })).toEqual({ status: "SAVED" });
      expect(await review("SUPPORT", { action: "REQUEST_DOCUMENTS", documents: [] })).toMatchObject({ status: "ERROR" });
      expect(
        await review("SUPPORT", { action: "REQUEST_DOCUMENTS", documents: ["NTN_CERTIFICATE", "OWNER_CNIC"], note: "Please send" }),
      ).toEqual({ status: "SAVED" });
      expect(await store.getApplication(appId)).toMatchObject({
        status: "DOCUMENTS_REQUESTED",
        requestedDocuments: ["NTN_CERTIFICATE", "OWNER_CNIC"],
        reviewerNote: "Please send",
      });
      expect(await review("SUPPORT", { action: "APPROVE" })).toMatchObject({ status: "ERROR" });
      expect(await review("SUPPORT", { action: "DOCUMENTS_RECEIVED" })).toEqual({ status: "SAVED" });
      expect((await store.getApplication(appId))?.requestedDocuments).toEqual([]);

      const approve = { action: "APPROVE", kycLevel: "LIGHT", checks: Object.keys(APPROVAL_CHECKS) };
      expect(await review("SUPPORT", { ...approve, trustWeight: "0.5" })).toMatchObject({ status: "ERROR" });
      expect(await review("ADMIN", { ...approve, checks: ["NTN_ACTIVE"], trustWeight: "0.5" })).toMatchObject({ status: "ERROR" });
      expect(await review("ADMIN", { ...approve, trustWeight: "0.9" })).toMatchObject({ status: "ERROR" });

      const approved = await review("ADMIN", { ...approve, trustWeight: "0.6" });
      if (approved.status !== "SAVED" || !approved.credentials) throw new Error("Approval failed");
      const { vendorId, keyPrefix, signingSecret } = approved.credentials;

      expect(await store.getVendor(vendorId)).toMatchObject({ displayName: "Acme", status: "PROBATION", trustWeight: 0.6 });
      expect(await store.getApplication(appId)).toMatchObject({ status: "APPROVED", vendorId });
      const key = await store.findApiKeyByPrefix(keyPrefix);
      expect(key?.vendorId).toBe(vendorId);
      expect(await store.resolveSigningSecret(key!.signingSecretRef)).toBe(signingSecret);

      const history = await store.listApplicationHistory(appId);
      expect(history.map((h) => h.action)).toEqual(["START_REVIEW", "REQUEST_DOCUMENTS", "DOCUMENTS_RECEIVED", "APPROVE"]);
      expect(history[1]).toMatchObject({ actorName: "SUPPORT user", documents: ["NTN_CERTIFICATE", "OWNER_CNIC"] });
      expect(history[3]).toMatchObject({ fromStatus: "REVIEWING", toStatus: "APPROVED" });

      expect(await review("ADMIN", { action: "REJECT", note: "too late" })).toMatchObject({ status: "ERROR" });
      expect(await review("ADMIN", { action: "ADD_NOTE", note: "Keys sent by email" })).toEqual({ status: "SAVED" });
    });
  });

  it("rejects with a reason and saves only one of two parallel decisions", async () => {
    await withHarness(make, async (store) => {
      const appId = "00000000-0000-4000-8000-000000000021";
      await store.saveApplication({ ...APPLICATION, id: appId, createdAt: NOW });
      const admin = { id: "admin-1", name: "Admin", role: "ADMIN" };
      const run = (input: Record<string, unknown>) =>
        reviewApplication({ store, now: NOW }, admin, { applicationId: appId, ...input });

      expect(await run({ action: "REJECT" })).toMatchObject({ status: "ERROR" });
      const results = await Promise.all([
        run({ action: "REJECT", note: "Fake store" }),
        run({ action: "START_REVIEW" }),
      ]);
      expect(results.filter((r) => r.status === "SAVED")).toHaveLength(1);
      expect(await store.listApplicationHistory(appId)).toHaveLength(1);
    });
  });

  it("finds matching applications and vendors", async () => {
    await withHarness(make, async (store) => {
      await store.saveApplication({ ...APPLICATION, id: "00000000-0000-4000-8000-000000000030", createdAt: NOW });
      await store.saveApplication({ ...APPLICATION, id: "00000000-0000-4000-8000-000000000031", createdAt: NOW });
      const app = await store.getApplication("00000000-0000-4000-8000-000000000031");
      const matches = await store.findApplicationMatches({ ...app!, displayName: "Vendor a" });
      expect(matches.otherApplicationsSameEmail).toBe(1);
      expect(matches.otherApplicationsSameNetwork).toBe(1);
      expect(matches.similarVendors.map((v) => v.displayName)).toEqual(["Vendor a"]);
    });
  });

  it("moves a vendor through restrict, lift, trust change and terminate", async () => {
    await withHarness(make, async (store) => {
      const admin = { id: "admin-1", name: "Admin", role: "ADMIN" };
      const act = (input: Record<string, unknown>, who = admin) =>
        manageVendor({ store, now: NOW }, who, { vendorId: VENDOR_ID.a, ...input });

      expect(await store.getVendorProfile(VENDOR_ID.a)).toMatchObject({ status: "ACTIVE", trustWeight: 1, displayName: "Vendor a" });
      expect(await act({ action: "RESTRICT" })).toMatchObject({ status: "ERROR" });
      expect(await act({ action: "RESTRICT", note: "Too many refusals" })).toEqual({ status: "SAVED" });
      expect(await store.getVendor(VENDOR_ID.a)).toMatchObject({ status: "RESTRICTED", trustWeight: 0.2 });

      expect(await act({ action: "LIFT_RESTRICTION", targetStatus: "ACTIVE", trustWeight: "0.5", note: "Fixed" })).toMatchObject({
        status: "ERROR",
      });
      expect(await act({ action: "LIFT_RESTRICTION", targetStatus: "ACTIVE", trustWeight: "0.8", note: "Fixed" })).toEqual({
        status: "SAVED",
      });
      expect(await act({ action: "SET_TRUST_WEIGHT", trustWeight: "0.9" }, { ...admin, role: "SUPPORT" })).toMatchObject({
        status: "ERROR",
      });
      expect(await act({ action: "SET_TRUST_WEIGHT", trustWeight: "0.9" })).toEqual({ status: "SAVED" });
      expect(await act({ action: "ADD_NOTE", note: "Called the owner" }, { ...admin, role: "SUPPORT" })).toEqual({ status: "SAVED" });

      expect(await act({ action: "TERMINATE", note: "Fake orders" })).toEqual({ status: "SAVED" });
      expect((await store.getVendor(VENDOR_ID.a))?.status).toBe("TERMINATED");
      expect((await store.listVendorApiKeys(VENDOR_ID.a)).every((k) => k.status === "REVOKED")).toBe(true);
      expect(await act({ action: "SET_TRUST_WEIGHT", trustWeight: "0.8" })).toMatchObject({ status: "ERROR" });

      const history = await store.listVendorHistory(VENDOR_ID.a);
      expect(history.map((h) => h.action)).toEqual(["RESTRICT", "LIFT_RESTRICTION", "SET_TRUST_WEIGHT", "ADD_NOTE", "TERMINATE"]);
      expect(history[0]).toMatchObject({ fromStatus: "ACTIVE", toStatus: "RESTRICTED", fromTrust: 1, toTrust: 0.2, actorName: "Admin" });
      expect(history[2]).toMatchObject({ fromTrust: 0.8, toTrust: 0.9 });
    });
  });

  it("revokes one API key so it stops working", async () => {
    await withHarness(make, async (store) => {
      const [key] = await store.listVendorApiKeys(VENDOR_ID.b);
      expect(key).toMatchObject({ keyPrefix: "testbbbb", status: "ACTIVE" });
      const admin = { id: "admin-1", name: "Admin", role: "ADMIN" };
      const revoke = () => manageVendor({ store, now: NOW }, admin, { vendorId: VENDOR_ID.b, action: "REVOKE_KEY", keyId: key!.id });
      expect(await revoke()).toEqual({ status: "SAVED" });
      expect(await revoke()).toMatchObject({ status: "ERROR" });

      const body = '{"events":[]}';
      await expect(
        authenticate({ headers: signedHeaders("b", body), rawBody: body, now: NOW, store, scope: "events:write", requireSignature: true }),
      ).rejects.toMatchObject({ code: "INVALID_KEY" });
      expect((await store.listVendorHistory(VENDOR_ID.b))[0]).toMatchObject({ action: "REVOKE_KEY", keyPrefix: "testbbbb" });
    });
  });

  it("saves only one of two parallel vendor changes", async () => {
    await withHarness(make, async (store) => {
      const admin = { id: "admin-1", name: "Admin", role: "ADMIN" };
      const set = (w: string) =>
        manageVendor({ store, now: NOW }, admin, { vendorId: VENDOR_ID.c, action: "SET_TRUST_WEIGHT", trustWeight: w });
      const results = await Promise.all([set("0.8"), set("0.9")]);
      expect(results.filter((r) => r.status === "SAVED")).toHaveLength(1);
      expect(await store.listVendorHistory(VENDOR_ID.c)).toHaveLength(1);
    });
  });

  it("counts orders by fault for a vendor and the network", async () => {
    await withHarness(make, async (store) => {
      await report(store, "a", [event({ phone: "03001313131" }), refusal({ phone: "03001313131" })]);
      await report(store, "b", [refusal({ phone: "03001414141", reason_code: "RIDER_ISSUE" })]);
      const since = new Date(NOW.getTime() - 30 * 86_400_000);
      expect(await store.countFaults(VENDOR_ID.a, since)).toMatchObject({ NONE: 1, USER: 1, LOGISTICS: 0 });
      expect(await store.countFaults(null, since)).toMatchObject({ NONE: 1, USER: 1, LOGISTICS: 1 });
    });
  });

  it("finds a customer by phone and shows the detail with an audit trail", async () => {
    await withHarness(make, async (store) => {
      const phone = "03001515151";
      await report(store, "a", [event({ phone }), refusal({ phone })]);
      await report(store, "b", [refusal({ phone, reason_code: "RIDER_ISSUE" })]);
      await check(store, "c", phone);
      await check(store, "c", phone);
      const admin = { id: "admin-1", name: "Admin", role: "ANALYST" };
      const ctxs = { store, pepper: PEPPER, keyVersion: 1, now: NOW };

      expect(await findCustomerByPhone(ctxs, admin, "12345")).toEqual({ status: "INVALID_PHONE" });
      expect(await findCustomerByPhone(ctxs, admin, "03009090909")).toEqual({ status: "NOT_FOUND" });
      const found = await findCustomerByPhone(ctxs, admin, "+92 300 1515151");
      if (found.status !== "FOUND") throw new Error("Customer not found");

      const detail = await loadCustomerDetail({ store, now: NOW }, admin, found.customerId);
      expect(detail?.customer.id).toBe(found.customerId);
      expect(detail?.profile?.totalNetworkOrders).toBe(3);
      expect(detail?.orders).toHaveLength(3);
      const byName = Object.fromEntries((detail?.stores ?? []).map((s) => [s.vendorName, s]));
      expect(byName["Vendor a"]).toMatchObject({ orders: 2, lookups: 0 });
      expect(byName["Vendor a"]?.score).toMatchObject({ delivered: 1, userFault: 1 });
      expect(byName["Vendor b"]?.score).toMatchObject({ logisticsFault: 1 });
      expect(byName["Vendor c"]).toMatchObject({ orders: 0, lookups: 2 });
      expect(detail?.accessLog.map((a) => a.action)).toEqual(["CUSTOMER_VIEW"]);

      expect(await recomputeForAdmin({ store, now: NOW }, admin, found.customerId)).toMatchObject({ status: "ERROR" });
      const later = new Date(NOW.getTime() + 1000);
      expect(await recomputeForAdmin({ store, now: later }, { ...admin, role: "SUPPORT" }, found.customerId)).toEqual({
        status: "SAVED",
      });
      const log = await store.listAdminAudit("customer", found.customerId, 10);
      expect(log.map((a) => a.action)).toEqual(["CUSTOMER_RECOMPUTE", "CUSTOMER_VIEW"]);
      expect(await store.listAdminAudit("customer_search", "none", 10)).toHaveLength(1);
    });
  });

  it("invites vendor users and applies the team rules", async () => {
    await withHarness(make, async (store) => {
      const inviter = fakeInviter();
      const ctxs = { store, inviter, redirectTo: "https://example.test/set-password", now: NOW };
      const admin = { type: "ADMIN" as const, id: "admin-1", name: "Admin", role: "ADMIN", vendorId: null };

      const owner = await inviteVendorUser(ctxs, admin, { vendorId: VENDOR_ID.a, email: "Owner@A.pk", name: "Owner A", role: "OWNER" });
      expect(owner.status).toBe("INVITED");
      const ownerUser = (await store.listVendorUsers(VENDOR_ID.a))[0]!;
      expect(ownerUser).toMatchObject({ email: "owner@a.pk", role: "OWNER", status: "ACTIVE", linked: true });
      const portal = await store.findPortalUserByAuthId(inviter.lastId!);
      expect(portal).toMatchObject({ kind: "vendor", vendorId: VENDOR_ID.a, role: "OWNER" });

      // Inviting again sends a new set-password link instead.
      expect((await inviteVendorUser(ctxs, admin, { vendorId: VENDOR_ID.a, email: "owner@a.pk", name: "Owner A", role: "OWNER" })).status).toBe("LINK_SENT");
      expect(inviter.links).toEqual(["owner@a.pk"]);

      const ownerActor = { type: "VENDOR" as const, id: ownerUser.id, name: "Owner A", role: "OWNER", vendorId: VENDOR_ID.a };
      expect((await inviteVendorUser(ctxs, ownerActor, { vendorId: VENDOR_ID.a, email: "x@a.pk", name: "X", role: "OWNER" })).status).toBe("ERROR");
      expect((await inviteVendorUser(ctxs, ownerActor, { vendorId: VENDOR_ID.b, email: "x@b.pk", name: "X", role: "STAFF" })).status).toBe("ERROR");
      expect((await inviteVendorUser(ctxs, ownerActor, { vendorId: VENDOR_ID.a, email: "staff@a.pk", name: "Staff A", role: "STAFF" })).status).toBe("INVITED");
      const staffAuthId = inviter.lastId!;

      // The same login cannot join another store.
      inviter.next = { status: "INVITED", authUserId: staffAuthId };
      expect((await inviteVendorUser(ctxs, admin, { vendorId: VENDOR_ID.b, email: "staff@a.pk", name: "Staff", role: "STAFF" })).message).toMatch(/another/);

      const staff = (await store.listVendorUsers(VENDOR_ID.a)).find((u) => u.role === "STAFF")!;
      const statusCtx = { store, now: NOW };
      expect((await setVendorUserStatus(statusCtx, admin, { vendorId: VENDOR_ID.a, userId: ownerUser.id, status: "DISABLED" })).message).toMatch(/at least one active owner/);
      expect((await setVendorUserStatus(statusCtx, ownerActor, { vendorId: VENDOR_ID.a, userId: staff.id, status: "DISABLED" })).status).toBe("SAVED");
      expect((await store.findPortalUserByAuthId(staffAuthId))?.status).toBe("DISABLED");
    });
  });

  it("lets an owner accept the agreement, manage keys and save settings", async () => {
    await withHarness(make, async (store) => {
      const ctxs = { store, now: NOW };
      const owner = { id: "u-owner", sub: "u-owner", name: "Owner", role: "OWNER", vendorId: VENDOR_ID.d };
      const staff = { ...owner, id: "u-staff", sub: "u-staff", role: "STAFF" };

      expect(await hasCurrentAgreement(store, VENDOR_ID.d)).toBe(false);
      expect((await acceptAgreement(ctxs, staff, { signedByName: "Staff Person", accepted: "yes" })).status).toBe("ERROR");
      expect((await acceptAgreement(ctxs, owner, { signedByName: "Owner Person" })).status).toBe("ERROR");
      expect(await acceptAgreement(ctxs, owner, { signedByName: "Owner Person", accepted: "yes" })).toEqual({ status: "SAVED" });
      expect(await hasCurrentAgreement(store, VENDOR_ID.d)).toBe(true);
      expect(await store.getAgreement(VENDOR_ID.d)).toMatchObject({ signedByName: "Owner Person", agreementVersion: AGREEMENT_VERSION });

      expect((await createOwnApiKey(ctxs, staff)).status).toBe("ERROR");
      const created = await createOwnApiKey(ctxs, owner);
      if (created.status !== "SAVED") throw new Error("Key not created");
      const prefix = created.secret.apiKey.split("_")[1]!;
      const key = await store.findApiKeyByPrefix(prefix);
      expect(await store.resolveSigningSecret(key!.signingSecretRef)).toBe(created.secret.signingSecret);
      expect((await createOwnApiKey(ctxs, owner)).status).toBe("SAVED");
      // Vendor d already has one key from the test setup, so this is the fourth.
      expect((await createOwnApiKey(ctxs, owner)).status).toBe("ERROR");
      expect(await revokeOwnApiKey(ctxs, owner, key!.id)).toEqual({ status: "SAVED" });
      expect((await revokeOwnApiKey(ctxs, owner, key!.id)).status).toBe("ERROR");

      expect((await saveOwnSettings(ctxs, owner, { high_value_threshold_pkr: -5 })).status).toBe("ERROR");
      expect((await saveOwnSettings(ctxs, staff, { high_value_threshold_pkr: 9000 })).status).toBe("ERROR");
      expect(await saveOwnSettings(ctxs, owner, { high_value_threshold_pkr: 9000 })).toEqual({ status: "SAVED" });
      expect((await store.getVendor(VENDOR_ID.d))?.settings).toMatchObject({ high_value_threshold_pkr: 9000 });
    });
  });

  it("counts lookups for the quota", async () => {
    await withHarness(make, async (store) => {
      for (let i = 0; i < 3; i++) await check(store, "a", "03009999999");
      expect(await store.countLookupsSince(VENDOR_ID.a, new Date(NOW.getTime() - 60_000))).toBe(3);
    });
  });
});
