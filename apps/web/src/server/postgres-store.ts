// Postgres store for the API (blueprint sections 3.4, 6.7, 8.1). Works with any Drizzle Postgres driver.

import {
  adminUsers,
  apiKeys,
  auditLog,
  customerIdentifiers,
  customers,
  customerTrustProfiles,
  disputes,
  idempotencyKeys,
  lookupAuditLog,
  orderEvents,
  orders,
  vendorApplications,
  vendorCustomerScores,
  vendorUsers,
  vendors,
} from "@etimaad/db";
import { FAULT_CLASSES, vendorCanUseApi } from "@etimaad/core";
import { VENDOR_ENTITY, toVendorEvent, vendorAuditRow } from "./vendor-audit";
import { adminAuditValues, toAdminAuditRow } from "./admin-audit";
import type { PortalUser } from "./users";
import type { ScoreBreakdown, TrustProfile, VendorCustomerScore } from "@etimaad/core";
import { and, count, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { APPLICATION_ENTITY, applicationAuditRow, toApplicationEvent } from "./application-audit";
import { openSecret } from "./secret-box";
import { createVendorWithKey } from "./vendor-admin";
import type {
  AdminOverview,
  ApiKeyRecord,
  ApplicationChange,
  ApplicationDetail,
  ApplicationEvent,
  ApplicationMatches,
  ApprovedVendorInput,
  AdminAuditEntry,
  AdminAuditRow,
  CustomerLookupCount,
  CustomerRecord,
  FaultCounts,
  VendorApiKeyRow,
  VendorChange,
  VendorEvent,
  VendorProfile,
  VendorUserRow,
  VendorOverview,
  ApiScope,
  EtimaadStore,
  LookupRecord,
  OrderEventRecord,
  OrderRecord,
  VendorApplicationRecord,
  VendorLookupRow,
  VendorRecord,
  VendorSummary,
} from "./store";

// Any Drizzle Postgres database or transaction (postgres-js in production, PGlite in tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPgDatabase = PgDatabase<any, any, any>;

export interface PostgresStoreOptions {
  // Key material for opening encrypted signing secrets. Null disables signed requests.
  signingKey: string | null;
}

type OrderRow = typeof orders.$inferSelect;

function toOrderRecord(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    vendorId: row.vendorId,
    externalOrderRef: row.externalOrderRef,
    customerId: row.customerId,
    checkoutRef: row.checkoutRef,
    sourcePlatform: row.sourcePlatform,
    paymentMethod: row.paymentMethod,
    orderValuePkr: row.orderValuePkr,
    status: row.status,
    reasonCode: row.reasonCode,
    derivedFault: row.derivedFault,
    vendorClaimedFault: row.vendorClaimedFault,
    cancellationStage: row.cancellationStage,
    deliveryAttempts: row.deliveryAttempts,
    consentNoticeVersion: row.consentNoticeVersion,
    isBackfill: row.isBackfill,
    isDisputed: row.isDisputed,
    scoringExcludedReason: row.scoringExcludedReason,
    occurredAt: row.occurredAt,
    lastTerminalAt: row.lastTerminalAt,
    version: row.version,
  };
}

function orderValues(order: OrderRecord) {
  return {
    id: order.id,
    vendorId: order.vendorId,
    externalOrderRef: order.externalOrderRef,
    customerId: order.customerId,
    checkoutRef: order.checkoutRef,
    sourcePlatform: order.sourcePlatform,
    paymentMethod: order.paymentMethod,
    orderValuePkr: order.orderValuePkr,
    status: order.status,
    reasonCode: order.reasonCode,
    derivedFault: order.derivedFault,
    vendorClaimedFault: order.vendorClaimedFault,
    cancellationStage: order.cancellationStage,
    deliveryAttempts: order.deliveryAttempts,
    consentNoticeVersion: order.consentNoticeVersion,
    isBackfill: order.isBackfill,
    isDisputed: order.isDisputed,
    scoringExcludedReason: order.scoringExcludedReason,
    occurredAt: order.occurredAt,
    lastTerminalAt: order.lastTerminalAt,
    version: order.version,
  };
}

function eventValues(event: OrderEventRecord) {
  return {
    id: event.id,
    receivedAt: event.receivedAt,
    orderId: event.orderId,
    vendorId: event.vendorId,
    externalOrderRef: event.externalOrderRef,
    eventId: event.eventId,
    idempotencyKey: event.idempotencyKey,
    payloadHash: event.payloadHash,
    status: event.status,
    reasonCode: event.reasonCode,
    isCorrection: event.isCorrection,
    metadata: event.metadata,
    occurredAt: event.occurredAt,
    result: event.result,
    rejectCode: event.rejectCode,
  };
}

class StaleChange extends Error {}

async function updateApplication(db: AnyPgDatabase, change: ApplicationChange, vendorId: string | null): Promise<boolean> {
  const rows = await db
    .update(vendorApplications)
    .set({
      status: change.toStatus,
      requestedDocuments: change.requestedDocuments,
      reviewedAt: change.now,
      ...(change.note !== null ? { reviewerNote: change.note } : {}),
      ...(vendorId !== null ? { vendorId } : {}),
    })
    .where(and(eq(vendorApplications.id, change.applicationId), eq(vendorApplications.status, change.fromStatus)))
    .returning({ id: vendorApplications.id });
  return rows.length > 0;
}

export class PostgresStore implements EtimaadStore {
  constructor(
    private readonly db: AnyPgDatabase,
    private readonly options: PostgresStoreOptions,
  ) {}

  async adminOverview(): Promise<AdminOverview> {
    const [[applications], [openDisputes], [activeVendors]] = await Promise.all([
      this.db
        .select({ n: count() })
        .from(vendorApplications)
        .where(inArray(vendorApplications.status, ["NEW", "REVIEWING"])),
      this.db
        .select({ n: count() })
        .from(disputes)
        .where(inArray(disputes.status, ["OPEN", "AWAITING_VENDOR"])),
      this.db.select({ n: count() }).from(vendors).where(eq(vendors.status, "ACTIVE")),
    ]);
    return {
      applicationsWaiting: applications?.n ?? 0,
      disputesForReview: openDisputes?.n ?? 0,
      activeVendors: activeVendors?.n ?? 0,
    };
  }

  async vendorOverview(vendorId: string, since30Days: Date, dayStart: Date): Promise<VendorOverview> {
    const [[reported], [lookups], [missing], [open]] = await Promise.all([
      this.db
        .select({ n: count() })
        .from(orders)
        .where(and(eq(orders.vendorId, vendorId), gte(orders.occurredAt, since30Days))),
      this.db
        .select({ n: count() })
        .from(lookupAuditLog)
        .where(and(eq(lookupAuditLog.vendorId, vendorId), gte(lookupAuditLog.createdAt, dayStart))),
      this.db
        .select({ n: count() })
        .from(orders)
        .where(and(eq(orders.vendorId, vendorId), eq(orders.reasonCode, "OTHER"))),
      this.db
        .select({ n: count() })
        .from(disputes)
        .innerJoin(orders, eq(orders.id, disputes.orderId))
        .where(and(eq(orders.vendorId, vendorId), inArray(disputes.status, ["OPEN", "AWAITING_VENDOR"]))),
    ]);
    return {
      ordersReported30Days: reported?.n ?? 0,
      lookupsToday: lookups?.n ?? 0,
      ordersMissingReason: missing?.n ?? 0,
      openDisputes: open?.n ?? 0,
    };
  }

  async listVendorSummaries(since: Date): Promise<VendorSummary[]> {
    const [vendorRows, orderRows, lookupRows, userRows] = await Promise.all([
      this.db
        .select({
          id: vendors.id,
          displayName: vendors.displayName,
          status: vendors.status,
          trustWeight: vendors.trustWeight,
        })
        .from(vendors)
        .orderBy(vendors.displayName),
      this.db
        .select({
          vendorId: orders.vendorId,
          n: count(),
          userFaults: sql<number>`count(*) filter (where ${orders.derivedFault} = 'USER')`.mapWith(Number),
        })
        .from(orders)
        .where(gte(orders.occurredAt, since))
        .groupBy(orders.vendorId),
      this.db
        .select({ vendorId: lookupAuditLog.vendorId, n: count() })
        .from(lookupAuditLog)
        .where(gte(lookupAuditLog.createdAt, since))
        .groupBy(lookupAuditLog.vendorId),
      this.db.select({ vendorId: vendorUsers.vendorId, n: count() }).from(vendorUsers).groupBy(vendorUsers.vendorId),
    ]);
    const ordersBy = new Map(orderRows.map((r) => [r.vendorId, r]));
    const lookupsBy = new Map(lookupRows.map((r) => [r.vendorId, r.n]));
    const usersBy = new Map(userRows.map((r) => [r.vendorId, r.n]));
    return vendorRows.map((v) => ({
      ...v,
      orders30Days: ordersBy.get(v.id)?.n ?? 0,
      userFaults30Days: ordersBy.get(v.id)?.userFaults ?? 0,
      lookups30Days: lookupsBy.get(v.id) ?? 0,
      portalUsers: usersBy.get(v.id) ?? 0,
    }));
  }

  async listVendorOrders(vendorId: string, limit: number): Promise<OrderRecord[]> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.vendorId, vendorId))
      .orderBy(desc(orders.occurredAt))
      .limit(limit);
    return rows.map(toOrderRecord);
  }

  async listVendorLookups(vendorId: string, limit: number): Promise<VendorLookupRow[]> {
    const rows = await this.db
      .select({
        createdAt: lookupAuditLog.createdAt,
        orderValuePkr: lookupAuditLog.orderValuePkr,
        returnedTier: lookupAuditLog.returnedTier,
        returnedAction: lookupAuditLog.returnedAction,
        latencyMs: lookupAuditLog.latencyMs,
      })
      .from(lookupAuditLog)
      .where(eq(lookupAuditLog.vendorId, vendorId))
      .orderBy(desc(lookupAuditLog.createdAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, orderValuePkr: r.orderValuePkr ?? 0, latencyMs: r.latencyMs ?? 0 }));
  }

  async getVendorProfile(vendorId: string): Promise<VendorProfile | null> {
    const [[v], [application]] = await Promise.all([
      this.db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1),
      this.db
        .select({ id: vendorApplications.id })
        .from(vendorApplications)
        .where(eq(vendorApplications.vendorId, vendorId))
        .limit(1),
    ]);
    if (!v) return null;
    return {
      id: v.id,
      legalName: v.legalName,
      displayName: v.displayName,
      category: v.category,
      status: v.status,
      trustWeight: v.trustWeight,
      faultClaimBias: v.faultClaimBias,
      kycLevel: v.kycLevel,
      kycReference: v.kycReference,
      kycVerifiedAt: v.kycVerifiedAt,
      kycReviewerNote: v.kycReviewerNote,
      probationEndsAt: v.probationEndsAt,
      createdAt: v.createdAt,
      applicationId: application?.id ?? null,
    };
  }

  async listVendorApiKeys(vendorId: string): Promise<VendorApiKeyRow[]> {
    return this.db
      .select({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        status: apiKeys.status,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.vendorId, vendorId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async listVendorUsers(vendorId: string): Promise<VendorUserRow[]> {
    const rows = await this.db
      .select()
      .from(vendorUsers)
      .where(eq(vendorUsers.vendorId, vendorId))
      .orderBy(vendorUsers.createdAt);
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      linked: u.authUserId !== null,
      lastLoginAt: u.lastLoginAt,
    }));
  }

  async countFaults(vendorId: string | null, since: Date): Promise<FaultCounts> {
    const conditions = [gte(orders.occurredAt, since)];
    if (vendorId !== null) conditions.push(eq(orders.vendorId, vendorId));
    const rows = await this.db
      .select({ fault: orders.derivedFault, n: count() })
      .from(orders)
      .where(and(...conditions))
      .groupBy(orders.derivedFault);
    const out = Object.fromEntries(FAULT_CLASSES.map((f) => [f, 0])) as FaultCounts;
    for (const r of rows) out[r.fault] = r.n;
    return out;
  }

  async listVendorHistory(vendorId: string): Promise<VendorEvent[]> {
    const rows = await this.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, VENDOR_ENTITY), eq(auditLog.entityId, vendorId)))
      .orderBy(auditLog.createdAt);
    return rows.map((r) => toVendorEvent(r.id, r.action, r.before, r.after, r.createdAt));
  }

  async updateVendor(change: VendorChange): Promise<"SAVED" | "STALE"> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(vendors)
        .set({ status: change.toStatus, trustWeight: change.toTrust, updatedAt: change.now })
        .where(
          and(
            eq(vendors.id, change.vendorId),
            eq(vendors.status, change.fromStatus),
            eq(vendors.trustWeight, change.fromTrust),
          ),
        )
        .returning({ id: vendors.id });
      if (updated.length === 0) return "STALE" as const;

      const revoke = { status: "REVOKED" as const, revokedAt: change.now };
      if (change.action === "REVOKE_KEY") {
        const revoked = await tx
          .update(apiKeys)
          .set(revoke)
          .where(
            and(
              eq(apiKeys.id, change.keyId ?? ""),
              eq(apiKeys.vendorId, change.vendorId),
              eq(apiKeys.status, "ACTIVE"),
            ),
          )
          .returning({ id: apiKeys.id });
        // Rolls back the vendor update too.
        if (revoked.length === 0) throw new StaleChange();
      } else if (change.action === "TERMINATE") {
        await tx
          .update(apiKeys)
          .set(revoke)
          .where(and(eq(apiKeys.vendorId, change.vendorId), eq(apiKeys.status, "ACTIVE")));
      }

      await tx.insert(auditLog).values(vendorAuditRow(change));
      return "SAVED" as const;
    }).catch((error: unknown) => {
      if (error instanceof StaleChange) return "STALE" as const;
      throw error;
    });
  }

  async getCustomer(customerId: string): Promise<CustomerRecord | null> {
    const [row] = await this.db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    return row ? { id: row.id, status: row.status, createdAt: row.createdAt, lastActivityAt: row.lastActivityAt } : null;
  }

  async listCustomerLookupCounts(customerId: string): Promise<CustomerLookupCount[]> {
    const rows = await this.db
      .select({
        vendorId: lookupAuditLog.vendorId,
        count: count(),
        lastAt: sql<Date>`max(${lookupAuditLog.createdAt})`.mapWith(lookupAuditLog.createdAt),
      })
      .from(lookupAuditLog)
      .where(eq(lookupAuditLog.customerId, customerId))
      .groupBy(lookupAuditLog.vendorId);
    return rows;
  }

  async recordAdminAudit(entry: AdminAuditEntry): Promise<void> {
    await this.db.insert(auditLog).values(adminAuditValues(entry));
  }

  async listAdminAudit(entityType: string, entityId: string, limit: number): Promise<AdminAuditRow[]> {
    const rows = await this.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
    return rows.map((r) => toAdminAuditRow(r.id, r.action, r.after, r.createdAt));
  }

  async findPortalUserByAuthId(authUserId: string): Promise<PortalUser | null> {
    const [admin] = await this.db.select().from(adminUsers).where(eq(adminUsers.authUserId, authUserId)).limit(1);
    if (admin) {
      return {
        id: admin.id,
        email: admin.workEmail,
        name: admin.name,
        kind: "admin",
        role: admin.role,
        vendorId: null,
        status: admin.status,
      };
    }

    const [row] = await this.db
      .select({ user: vendorUsers, vendorStatus: vendors.status })
      .from(vendorUsers)
      .innerJoin(vendors, eq(vendors.id, vendorUsers.vendorId))
      .where(eq(vendorUsers.authUserId, authUserId))
      .limit(1);
    if (!row) return null;
    // A pending vendor may still log in (for example to finish KYC); a terminated vendor may not.
    const vendorOpen = row.vendorStatus === "PENDING_VERIFICATION" || vendorCanUseApi(row.vendorStatus);
    return {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      kind: "vendor",
      role: row.user.role,
      vendorId: row.user.vendorId,
      status: row.user.status === "ACTIVE" && vendorOpen ? "ACTIVE" : "DISABLED",
    };
  }

  async saveApplication(a: VendorApplicationRecord): Promise<void> {
    await this.db.insert(vendorApplications).values({
      id: a.id,
      legalName: a.legalName,
      displayName: a.displayName,
      category: a.category,
      businessType: a.businessType,
      platform: a.platform,
      storeUrl: a.storeUrl,
      contactName: a.contactName,
      contactEmail: a.contactEmail,
      ipHash: a.ipHash,
      status: a.status,
      createdAt: a.createdAt,
    });
  }

  async countApplicationsSince(filter: { contactEmail?: string; ipHash?: string }, since: Date): Promise<number> {
    const conditions = [gte(vendorApplications.createdAt, since)];
    if (filter.contactEmail !== undefined) conditions.push(eq(vendorApplications.contactEmail, filter.contactEmail));
    if (filter.ipHash !== undefined) conditions.push(eq(vendorApplications.ipHash, filter.ipHash));
    const [row] = await this.db
      .select({ n: count() })
      .from(vendorApplications)
      .where(and(...conditions));
    return row?.n ?? 0;
  }

  async listApplications(limit: number): Promise<VendorApplicationRecord[]> {
    const rows = await this.db
      .select()
      .from(vendorApplications)
      .orderBy(desc(vendorApplications.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      legalName: r.legalName,
      displayName: r.displayName,
      category: r.category,
      businessType: r.businessType,
      platform: r.platform,
      storeUrl: r.storeUrl,
      contactName: r.contactName,
      contactEmail: r.contactEmail,
      ipHash: r.ipHash,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  async getApplication(id: string): Promise<ApplicationDetail | null> {
    const [r] = await this.db.select().from(vendorApplications).where(eq(vendorApplications.id, id)).limit(1);
    if (!r) return null;
    return {
      id: r.id,
      legalName: r.legalName,
      displayName: r.displayName,
      category: r.category,
      businessType: r.businessType,
      platform: r.platform,
      storeUrl: r.storeUrl,
      contactName: r.contactName,
      contactEmail: r.contactEmail,
      ipHash: r.ipHash,
      status: r.status,
      createdAt: r.createdAt,
      reviewerNote: r.reviewerNote,
      reviewedAt: r.reviewedAt,
      requestedDocuments: r.requestedDocuments,
      vendorId: r.vendorId,
    };
  }

  async listApplicationHistory(id: string): Promise<ApplicationEvent[]> {
    const rows = await this.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, APPLICATION_ENTITY), eq(auditLog.entityId, id)))
      .orderBy(auditLog.createdAt);
    return rows.map((r) => toApplicationEvent(r.id, r.action, r.actorId, r.before, r.after, r.createdAt));
  }

  async findApplicationMatches(a: VendorApplicationRecord): Promise<ApplicationMatches> {
    const pattern = `%${a.displayName.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const [[sameEmail], [sameNetwork], similar] = await Promise.all([
      this.db
        .select({ n: count() })
        .from(vendorApplications)
        .where(and(eq(vendorApplications.contactEmail, a.contactEmail), ne(vendorApplications.id, a.id))),
      a.ipHash
        ? this.db
            .select({ n: count() })
            .from(vendorApplications)
            .where(and(eq(vendorApplications.ipHash, a.ipHash), ne(vendorApplications.id, a.id)))
        : Promise.resolve([{ n: 0 }]),
      this.db
        .select({ id: vendors.id, displayName: vendors.displayName, status: vendors.status })
        .from(vendors)
        .where(
          or(
            ilike(vendors.displayName, pattern),
            sql`lower(${vendors.legalName}) = lower(${a.legalName})`,
          ),
        )
        .limit(10),
    ]);
    return {
      otherApplicationsSameEmail: sameEmail?.n ?? 0,
      otherApplicationsSameNetwork: sameNetwork?.n ?? 0,
      similarVendors: similar,
    };
  }

  async reviewApplication(change: ApplicationChange): Promise<"SAVED" | "STALE"> {
    return this.db.transaction(async (tx) => {
      const saved = await updateApplication(tx, change, null);
      if (!saved) return "STALE" as const;
      await tx.insert(auditLog).values(applicationAuditRow(change));
      return "SAVED" as const;
    });
  }

  async approveApplication(change: ApplicationChange, vendor: ApprovedVendorInput) {
    const signingKey = this.options.signingKey;
    if (!signingKey) throw new Error("SIGNING_SECRET_KEY is not set, so API keys cannot be created.");
    return this.db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(vendorApplications)
        .where(and(eq(vendorApplications.id, change.applicationId), eq(vendorApplications.status, change.fromStatus)))
        .for("update")
        .limit(1);
      if (!application) return { status: "STALE" as const };

      const created = await createVendorWithKey(
        tx as AnyPgDatabase,
        {
          legalName: application.legalName,
          displayName: application.displayName,
          category: application.category,
          status: "PROBATION",
          trustWeight: vendor.trustWeight,
          kycReference: `APP-${application.id.slice(0, 8)}`,
          kycLevel: vendor.kycLevel,
          kycVerifiedAt: change.now,
          kycReviewerNote: change.note,
          probationEndsAt: vendor.probationEndsAt,
        },
        signingKey,
      );
      await updateApplication(tx, change, created.vendorId);
      await tx.insert(auditLog).values(applicationAuditRow(change, created.vendorId));
      return {
        status: "SAVED" as const,
        credentials: {
          vendorId: created.vendorId,
          keyPrefix: created.keyPrefix,
          apiKey: created.apiKey,
          signingSecret: created.signingSecret,
        },
      };
    });
  }

  async findApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    const [row] = await this.db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, prefix)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      vendorId: row.vendorId,
      keyPrefix: row.keyPrefix,
      keyHash: row.keyHash,
      scopes: row.scopes as ApiScope[],
      signingSecretRef: row.signingSecretRef,
      status: row.status,
      expiresAt: row.expiresAt,
    };
  }

  async resolveSigningSecret(ref: string): Promise<string | null> {
    return this.options.signingKey ? openSecret(ref, this.options.signingKey) : null;
  }

  async getVendor(id: string): Promise<VendorRecord | null> {
    return (await this.getVendors([id])).get(id) ?? null;
  }

  async getVendors(ids: readonly string[]): Promise<Map<string, VendorRecord>> {
    const out = new Map<string, VendorRecord>();
    if (ids.length === 0) return out;
    const rows = await this.db
      .select()
      .from(vendors)
      .where(inArray(vendors.id, [...ids]));
    for (const row of rows) {
      out.set(row.id, {
        id: row.id,
        displayName: row.displayName,
        status: row.status,
        trustWeight: row.trustWeight,
        faultClaimBias: row.faultClaimBias,
        settings: row.settings,
      });
    }
    return out;
  }

  async findIdempotencyKey(key: string) {
    const [row] = await this.db
      .select({ payloadHash: idempotencyKeys.payloadHash })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.idempotencyKey, key))
      .limit(1);
    return row ?? null;
  }

  async findCustomerIdByPhoneHash(phoneHash: string, keyVersion: number): Promise<string | null> {
    const [row] = await this.db
      .select({ customerId: customerIdentifiers.customerId })
      .from(customerIdentifiers)
      .where(
        and(
          eq(customerIdentifiers.identifierType, "PHONE_HASH"),
          eq(customerIdentifiers.valueHash, phoneHash),
          eq(customerIdentifiers.keyVersion, keyVersion),
          eq(customerIdentifiers.isActive, true),
        ),
      )
      .limit(1);
    return row?.customerId ?? null;
  }

  // Safe when two requests create the same customer at once: the loser reuses the winner's row.
  async createCustomer(phoneHash: string, keyVersion: number, now: Date): Promise<string> {
    const created = await this.db.transaction(async (tx) => {
      const [customer] = await tx
        .insert(customers)
        .values({ lastActivityAt: now, createdAt: now })
        .returning({ id: customers.id });
      if (!customer) throw new Error("Customer insert returned no row");
      const inserted = await tx
        .insert(customerIdentifiers)
        .values({
          customerId: customer.id,
          identifierType: "PHONE_HASH",
          valueHash: phoneHash,
          keyVersion,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: customerIdentifiers.id });
      if (inserted.length === 0) {
        await tx.delete(customers).where(eq(customers.id, customer.id));
        return null;
      }
      return customer.id;
    });
    if (created) return created;

    const existing = await this.findCustomerIdByPhoneHash(phoneHash, keyVersion);
    if (!existing) throw new Error("Customer identifier conflict without an existing customer");
    return existing;
  }

  async findOrder(vendorId: string, externalOrderRef: string): Promise<OrderRecord | null> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.vendorId, vendorId), eq(orders.externalOrderRef, externalOrderRef)))
      .limit(1);
    return row ? toOrderRecord(row) : null;
  }

  async saveAcceptedEvent(event: OrderEventRecord, order: OrderRecord): Promise<"SAVED" | "DUPLICATE_KEY"> {
    return this.db.transaction(async (tx) => {
      const claimed = await tx
        .insert(idempotencyKeys)
        .values({
          idempotencyKey: event.idempotencyKey,
          orderEventId: event.id,
          receivedAt: event.receivedAt,
          payloadHash: event.payloadHash,
        })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.idempotencyKey });
      if (claimed.length === 0) return "DUPLICATE_KEY" as const;

      const values = orderValues(order);
      const { id: _id, vendorId: _v, externalOrderRef: _r, ...changes } = values;
      await tx
        .insert(orders)
        .values(values)
        .onConflictDoUpdate({
          target: [orders.vendorId, orders.externalOrderRef],
          set: { ...changes, updatedAt: event.receivedAt },
        });

      await tx.insert(orderEvents).values(eventValues(event));
      await tx.update(customers).set({ lastActivityAt: event.receivedAt }).where(eq(customers.id, order.customerId));
      return "SAVED" as const;
    });
  }

  async saveRejectedEvent(event: OrderEventRecord): Promise<void> {
    await this.db.insert(orderEvents).values(eventValues(event));
  }

  async withCustomerLock<T>(customerId: string, fn: (store: EtimaadStore) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      // Transaction-level lock: works through the Supabase transaction pooler (blueprint section 18.4).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${customerId}))`);
      return fn(new PostgresStore(tx as AnyPgDatabase, this.options));
    });
  }

  async listCustomerOrders(customerId: string): Promise<OrderRecord[]> {
    const rows = await this.db.select().from(orders).where(eq(orders.customerId, customerId));
    return rows.map(toOrderRecord);
  }

  async saveScores(
    customerId: string,
    profile: TrustProfile,
    scores: ReadonlyMap<string, VendorCustomerScore>,
  ): Promise<void> {
    const now = new Date(profile.breakdown.calculated_at);
    const profileValues = {
      customerId,
      totalNetworkOrders: profile.totalNetworkOrders,
      scoreableOrders: profile.scoreableOrders,
      totalDelivered: profile.totalDelivered,
      totalUserFault: profile.totalUserFault,
      distinctVendorCount: profile.distinctVendorCount,
      negativeVendorCount: profile.negativeVendorCount,
      positiveEvidence: profile.positiveEvidence,
      negativeEvidence: profile.negativeEvidence,
      cumulativeScore: profile.cumulativeScore,
      riskTier: profile.riskTier,
      hasRecentUserFault: profile.hasRecentUserFault,
      hasOpenDispute: profile.hasOpenDispute,
      scoreVersion: profile.scoreVersion,
      scoreBreakdown: profile.breakdown as unknown as Record<string, unknown>,
      lastOrderAt: profile.lastOrderAt,
      lastCalculatedAt: now,
      nextDecayRecalcAt: profile.nextDecayRecalcAt,
    };
    const { customerId: _c, ...profileChanges } = profileValues;
    await this.db
      .insert(customerTrustProfiles)
      .values(profileValues)
      .onConflictDoUpdate({ target: customerTrustProfiles.customerId, set: profileChanges });

    for (const [vendorId, s] of scores) {
      const scoreValues = {
        customerId,
        vendorId,
        totalOrders: s.totalOrders,
        delivered: s.delivered,
        partiallyDelivered: s.partiallyDelivered,
        userFault: s.userFault,
        vendorFault: s.vendorFault,
        logisticsFault: s.logisticsFault,
        neutral: s.neutral,
        unknown: s.unknown,
        successRate: s.successRate,
        scoreVersion: s.scoreVersion,
        updatedAt: now,
      };
      const { customerId: _sc, vendorId: _sv, ...scoreChanges } = scoreValues;
      await this.db
        .insert(vendorCustomerScores)
        .values(scoreValues)
        .onConflictDoUpdate({
          target: [vendorCustomerScores.customerId, vendorCustomerScores.vendorId],
          set: scoreChanges,
        });
    }
  }

  async getProfile(customerId: string): Promise<TrustProfile | null> {
    const [row] = await this.db
      .select()
      .from(customerTrustProfiles)
      .where(eq(customerTrustProfiles.customerId, customerId))
      .limit(1);
    if (!row) return null;
    return {
      scoreVersion: row.scoreVersion,
      cumulativeScore: row.cumulativeScore,
      riskTier: row.riskTier,
      totalNetworkOrders: row.totalNetworkOrders,
      scoreableOrders: row.scoreableOrders,
      totalDelivered: row.totalDelivered,
      totalUserFault: row.totalUserFault,
      distinctVendorCount: row.distinctVendorCount,
      negativeVendorCount: row.negativeVendorCount,
      positiveEvidence: row.positiveEvidence,
      negativeEvidence: row.negativeEvidence,
      hasRecentUserFault: row.hasRecentUserFault,
      hasOpenDispute: row.hasOpenDispute,
      lastOrderAt: row.lastOrderAt,
      nextDecayRecalcAt: row.nextDecayRecalcAt,
      breakdown: row.scoreBreakdown as unknown as ScoreBreakdown,
    };
  }

  async getVendorCustomerScore(customerId: string, vendorId: string): Promise<VendorCustomerScore | null> {
    const [row] = await this.db
      .select()
      .from(vendorCustomerScores)
      .where(and(eq(vendorCustomerScores.customerId, customerId), eq(vendorCustomerScores.vendorId, vendorId)))
      .limit(1);
    if (!row) return null;
    return {
      scoreVersion: row.scoreVersion,
      totalOrders: row.totalOrders,
      delivered: row.delivered,
      partiallyDelivered: row.partiallyDelivered,
      userFault: row.userFault,
      vendorFault: row.vendorFault,
      logisticsFault: row.logisticsFault,
      neutral: row.neutral,
      unknown: row.unknown,
      successRate: row.successRate,
    };
  }

  async countLookupsSince(vendorId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(lookupAuditLog)
      .where(and(eq(lookupAuditLog.vendorId, vendorId), gte(lookupAuditLog.createdAt, since)));
    return row?.n ?? 0;
  }

  async countOrdersReportedSince(vendorId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.vendorId, vendorId), gte(orders.occurredAt, since)));
    return row?.n ?? 0;
  }

  async recordLookup(record: LookupRecord): Promise<void> {
    await this.db.insert(lookupAuditLog).values({
      id: record.id,
      createdAt: record.createdAt,
      vendorId: record.vendorId,
      apiKeyId: record.apiKeyId,
      customerId: record.customerId,
      phoneHash: record.phoneHash,
      checkoutRef: record.checkoutRef,
      orderValuePkr: record.orderValuePkr,
      returnedTier: record.returnedTier,
      returnedAction: record.returnedAction,
      mode: record.mode,
      latencyMs: record.latencyMs,
    });
  }
}
