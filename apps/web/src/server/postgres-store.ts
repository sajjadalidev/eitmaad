// Postgres store for the API (blueprint sections 3.4, 6.7, 8.1). Works with any Drizzle Postgres driver.

import {
  adminUsers,
  apiKeys,
  customerIdentifiers,
  customers,
  customerTrustProfiles,
  idempotencyKeys,
  lookupAuditLog,
  orderEvents,
  orders,
  vendorApplications,
  vendorCustomerScores,
  vendorUsers,
  vendors,
} from "@etimaad/db";
import { vendorCanUseApi } from "@etimaad/core";
import type { PortalUser } from "./users";
import type { ScoreBreakdown, TrustProfile, VendorCustomerScore } from "@etimaad/core";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { openSecret } from "./secret-box";
import type {
  ApiKeyRecord,
  ApiScope,
  EtimaadStore,
  LookupRecord,
  OrderEventRecord,
  OrderRecord,
  VendorApplicationRecord,
  VendorRecord,
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

export class PostgresStore implements EtimaadStore {
  constructor(
    private readonly db: AnyPgDatabase,
    private readonly options: PostgresStoreOptions,
  ) {}

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
