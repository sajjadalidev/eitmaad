// In-memory store for local development and tests. Data lives only in this process.

import { randomUUID } from "node:crypto";
import { FAULT_CLASSES, VENDOR_STATUSES, sha256Hex, type TrustProfile, type VendorCustomerScore } from "@etimaad/core";
import { toVendorEvent, vendorAuditRow, type VendorAuditRow } from "./vendor-audit";
import { adminAuditValues, toAdminAuditRow } from "./admin-audit";
import { applicationAuditRow, toApplicationEvent, type AuditRowValues } from "./application-audit";
import { API_SCOPES, APPLICATION_STATUSES, type ApplicationStatus } from "./store";
import type { PortalUser } from "./users";
import { generateApiCredentials } from "./vendor-admin";
import type {
  AdminOverview,
  ApiKeyRecord,
  ApplicationChange,
  ApplicationDetail,
  ApplicationEvent,
  ApplicationMatches,
  ApprovedVendorInput,
  AgreementRecord,
  NewVendorUser,
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
  EtimaadStore,
  LookupRecord,
  OrderEventRecord,
  OrderRecord,
  VendorApplicationRecord,
  VendorLookupRow,
  VendorRecord,
  VendorSummary,
} from "./store";

const orderKey = (vendorId: string, ref: string) => JSON.stringify([vendorId, ref]);
const scoreKey = (customerId: string, vendorId: string) => `${customerId}|${vendorId}`;
const phoneKey = (hash: string, version: number) => `${version}:${hash}`;

export class InMemoryStore implements EtimaadStore {
  readonly apiKeys = new Map<string, ApiKeyRecord>();
  readonly signingSecrets = new Map<string, string>();
  readonly vendors = new Map<string, VendorRecord>();
  readonly idempotency = new Map<string, { payloadHash: string; orderEventId: string }>();
  readonly phones = new Map<string, string>();
  readonly orders = new Map<string, OrderRecord>();
  readonly events: OrderEventRecord[] = [];
  readonly profiles = new Map<string, TrustProfile>();
  readonly vendorScores = new Map<string, VendorCustomerScore>();
  readonly lookups: LookupRecord[] = [];
  readonly applications: VendorApplicationRecord[] = [];
  readonly portalUsers = new Map<string, PortalUser>();
  readonly reviews = new Map<
    string,
    { reviewerNote: string | null; reviewedAt: Date | null; requestedDocuments: string[]; vendorId: string | null }
  >();
  readonly audit: (AuditRowValues & { id: string })[] = [];
  readonly vendorAudit: (VendorAuditRow & { id: string })[] = [];
  readonly customers = new Map<string, CustomerRecord>();
  readonly agreements = new Map<string, AgreementRecord>();
  // Local stand-in for Supabase Auth users: email to auth user id.
  readonly devAuthUsers = new Map<string, string>();
  readonly adminAudit: (ReturnType<typeof adminAuditValues> & { id: string })[] = [];
  // Stands in for dates the dev vendors do not have.
  readonly startedAt = new Date();
  readonly keyTimes = new Map<string, { createdAt: Date; revokedAt: Date | null }>();
  readonly vendorExtras = new Map<
    string,
    Partial<Pick<VendorProfile, "legalName" | "category" | "kycLevel" | "kycReference" | "kycVerifiedAt" | "kycReviewerNote" | "probationEndsAt" | "createdAt">>
  >();

  async adminOverview(): Promise<AdminOverview> {
    const applications = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as AdminOverview["applications"];
    for (const a of this.applications) applications[a.status]++;
    const vendors = Object.fromEntries(VENDOR_STATUSES.map((s) => [s, 0])) as AdminOverview["vendors"];
    for (const v of this.vendors.values()) vendors[v.status]++;
    return { applications, vendors, disputesForReview: 0 };
  }

  async vendorOverview(vendorId: string, since30Days: Date, dayStart: Date): Promise<VendorOverview> {
    const own = [...this.orders.values()].filter((o) => o.vendorId === vendorId);
    return {
      ordersReported30Days: own.filter((o) => o.occurredAt >= since30Days).length,
      lookupsToday: this.lookups.filter((l) => l.vendorId === vendorId && l.createdAt >= dayStart).length,
      ordersMissingReason: own.filter((o) => o.reasonCode === "OTHER").length,
      openDisputes: 0,
    };
  }

  async listVendorSummaries(since: Date): Promise<VendorSummary[]> {
    const orders = [...this.orders.values()].filter((o) => o.occurredAt >= since);
    const users = [...this.portalUsers.values()];
    return [...this.vendors.values()]
      .map((v) => {
        const own = orders.filter((o) => o.vendorId === v.id);
        const extra = this.vendorExtras.get(v.id);
        return {
          id: v.id,
          displayName: v.displayName,
          legalName: extra?.legalName ?? v.displayName,
          category: extra?.category ?? ("ecommerce" as const),
          status: v.status,
          trustWeight: v.trustWeight,
          kycLevel: extra?.kycLevel ?? null,
          createdAt: extra?.createdAt ?? this.startedAt,
          probationEndsAt: extra?.probationEndsAt ?? null,
          orders30Days: own.length,
          userFaults30Days: own.filter((o) => o.derivedFault === "USER").length,
          lookups30Days: this.lookups.filter((l) => l.vendorId === v.id && l.createdAt >= since).length,
          portalUsers: users.filter((u) => u.vendorId === v.id).length,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async listVendorOrders(vendorId: string, limit: number) {
    return [...this.orders.values()]
      .filter((o) => o.vendorId === vendorId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit)
      .map((o) => ({ ...o }));
  }

  async listVendorLookups(vendorId: string, limit: number): Promise<VendorLookupRow[]> {
    return this.lookups
      .filter((l) => l.vendorId === vendorId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((l) => ({
        createdAt: l.createdAt,
        orderValuePkr: l.orderValuePkr,
        returnedTier: l.returnedTier,
        returnedAction: l.returnedAction,
        latencyMs: l.latencyMs,
      }));
  }

  async findPortalUserByAuthId(authUserId: string) {
    return this.portalUsers.get(authUserId) ?? null;
  }

  async saveApplication(application: VendorApplicationRecord) {
    this.applications.push({ ...application });
  }

  async countApplicationsSince(filter: { contactEmail?: string; ipHash?: string }, since: Date) {
    return this.applications.filter(
      (a) =>
        a.createdAt >= since &&
        (filter.contactEmail === undefined || a.contactEmail === filter.contactEmail) &&
        (filter.ipHash === undefined || a.ipHash === filter.ipHash),
    ).length;
  }

  async listApplications(limit: number, status?: ApplicationStatus) {
    return this.applications.filter((a) => !status || a.status === status).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  }

  async getApplication(id: string): Promise<ApplicationDetail | null> {
    const a = this.applications.find((x) => x.id === id);
    if (!a) return null;
    const review = this.reviews.get(id);
    return {
      ...a,
      reviewerNote: review?.reviewerNote ?? null,
      reviewedAt: review?.reviewedAt ?? null,
      requestedDocuments: [...(review?.requestedDocuments ?? [])],
      vendorId: review?.vendorId ?? null,
    };
  }

  async listApplicationHistory(id: string): Promise<ApplicationEvent[]> {
    return this.audit
      .filter((r) => r.entityId === id)
      .map((r) => toApplicationEvent(r.id, r.action, r.actorId, r.before, r.after, r.createdAt));
  }

  async findApplicationMatches(a: VendorApplicationRecord): Promise<ApplicationMatches> {
    const others = this.applications.filter((x) => x.id !== a.id);
    const name = a.displayName.toLowerCase();
    return {
      otherApplicationsSameEmail: others.filter((x) => x.contactEmail === a.contactEmail).length,
      otherApplicationsSameNetwork: a.ipHash ? others.filter((x) => x.ipHash === a.ipHash).length : 0,
      similarVendors: [...this.vendors.values()]
        .filter((v) => v.displayName.toLowerCase().includes(name))
        .map((v) => ({ id: v.id, displayName: v.displayName, status: v.status })),
    };
  }

  private applyChange(change: ApplicationChange, vendorId: string | null): boolean {
    const a = this.applications.find((x) => x.id === change.applicationId);
    if (!a || a.status !== change.fromStatus) return false;
    a.status = change.toStatus;
    const review = this.reviews.get(a.id) ?? { reviewerNote: null, reviewedAt: null, requestedDocuments: [], vendorId: null };
    review.reviewedAt = change.now;
    review.requestedDocuments = [...change.requestedDocuments];
    if (change.note !== null) review.reviewerNote = change.note;
    if (vendorId !== null) review.vendorId = vendorId;
    this.reviews.set(a.id, review);
    this.audit.push({ id: randomUUID(), ...applicationAuditRow(change, vendorId ?? undefined) });
    return true;
  }

  async reviewApplication(change: ApplicationChange) {
    return this.applyChange(change, null) ? ("SAVED" as const) : ("STALE" as const);
  }

  async approveApplication(change: ApplicationChange, vendor: ApprovedVendorInput) {
    const a = this.applications.find((x) => x.id === change.applicationId);
    if (!a || a.status !== change.fromStatus) return { status: "STALE" as const };
    const vendorId = randomUUID();
    const credentials = generateApiCredentials();
    this.addVendor({
      id: vendorId,
      displayName: a.displayName,
      status: "PROBATION",
      trustWeight: vendor.trustWeight,
      faultClaimBias: 1,
      settings: {},
    });
    this.addApiKey(
      {
        id: randomUUID(),
        vendorId,
        keyPrefix: credentials.keyPrefix,
        keyHash: sha256Hex(credentials.apiKey),
        scopes: API_SCOPES,
        signingSecretRef: `memory-${credentials.keyPrefix}`,
        status: "ACTIVE",
        expiresAt: null,
      },
      credentials.signingSecret,
      change.now,
    );
    this.vendorExtras.set(vendorId, {
      legalName: a.legalName,
      category: a.category,
      kycLevel: vendor.kycLevel,
      kycReference: `APP-${a.id.slice(0, 8)}`,
      kycVerifiedAt: change.now,
      kycReviewerNote: change.note,
      probationEndsAt: vendor.probationEndsAt,
      createdAt: change.now,
    });
    this.applyChange(change, vendorId);
    return { status: "SAVED" as const, credentials: { vendorId, ...credentials } };
  }

  async getVendorProfile(vendorId: string): Promise<VendorProfile | null> {
    const v = this.vendors.get(vendorId);
    if (!v) return null;
    const extra = this.vendorExtras.get(vendorId);
    const application = [...this.reviews.entries()].find(([, r]) => r.vendorId === vendorId);
    return {
      id: v.id,
      legalName: extra?.legalName ?? v.displayName,
      displayName: v.displayName,
      category: extra?.category ?? "ecommerce",
      status: v.status,
      trustWeight: v.trustWeight,
      faultClaimBias: v.faultClaimBias,
      kycLevel: extra?.kycLevel ?? null,
      kycReference: extra?.kycReference ?? null,
      kycVerifiedAt: extra?.kycVerifiedAt ?? null,
      kycReviewerNote: extra?.kycReviewerNote ?? null,
      probationEndsAt: extra?.probationEndsAt ?? null,
      createdAt: extra?.createdAt ?? this.startedAt,
      applicationId: application?.[0] ?? null,
    };
  }

  async listVendorApiKeys(vendorId: string): Promise<VendorApiKeyRow[]> {
    return [...this.apiKeys.values()]
      .filter((k) => k.vendorId === vendorId)
      .map((k) => ({
        id: k.id,
        keyPrefix: k.keyPrefix,
        status: k.status,
        createdAt: this.keyTimes.get(k.id)?.createdAt ?? new Date(0),
        lastUsedAt: null,
        revokedAt: this.keyTimes.get(k.id)?.revokedAt ?? null,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listVendorUsers(vendorId: string): Promise<VendorUserRow[]> {
    return [...this.portalUsers.values()]
      .filter((u) => u.vendorId === vendorId)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, linked: true, lastLoginAt: null }));
  }

  async countFaults(vendorId: string | null, since: Date): Promise<FaultCounts> {
    const out = Object.fromEntries(FAULT_CLASSES.map((f) => [f, 0])) as FaultCounts;
    for (const o of this.orders.values()) {
      if (o.occurredAt >= since && (vendorId === null || o.vendorId === vendorId)) out[o.derivedFault]++;
    }
    return out;
  }

  async listVendorHistory(vendorId: string): Promise<VendorEvent[]> {
    return this.vendorAudit
      .filter((r) => r.entityId === vendorId)
      .map((r) => toVendorEvent(r.id, r.action, r.before, r.after, r.createdAt));
  }

  async updateVendor(change: VendorChange): Promise<"SAVED" | "STALE"> {
    const v = this.vendors.get(change.vendorId);
    if (!v || v.status !== change.fromStatus || v.trustWeight !== change.fromTrust) return "STALE";
    const keys = [...this.apiKeys.values()].filter((k) => k.vendorId === v.id && k.status === "ACTIVE");
    const toRevoke =
      change.action === "TERMINATE" ? keys : change.action === "REVOKE_KEY" ? keys.filter((k) => k.id === change.keyId) : [];
    if (change.action === "REVOKE_KEY" && toRevoke.length === 0) return "STALE";

    for (const k of toRevoke) {
      this.apiKeys.set(k.keyPrefix, { ...k, status: "REVOKED" });
      this.keyTimes.set(k.id, { createdAt: this.keyTimes.get(k.id)?.createdAt ?? new Date(0), revokedAt: change.now });
    }
    this.vendors.set(v.id, { ...v, status: change.toStatus, trustWeight: change.toTrust });
    this.vendorAudit.push({ id: randomUUID(), ...vendorAuditRow(change) });
    return "SAVED";
  }

  async getCustomer(customerId: string): Promise<CustomerRecord | null> {
    return this.customers.get(customerId) ?? null;
  }

  async listCustomerLookupCounts(customerId: string): Promise<CustomerLookupCount[]> {
    const byVendor = new Map<string, CustomerLookupCount>();
    for (const l of this.lookups) {
      if (l.customerId !== customerId) continue;
      const row = byVendor.get(l.vendorId) ?? { vendorId: l.vendorId, count: 0, lastAt: l.createdAt };
      row.count++;
      if (l.createdAt > row.lastAt) row.lastAt = l.createdAt;
      byVendor.set(l.vendorId, row);
    }
    return [...byVendor.values()];
  }

  async recordAdminAudit(entry: AdminAuditEntry): Promise<void> {
    this.adminAudit.push({ id: randomUUID(), ...adminAuditValues(entry) });
  }

  async listAdminAudit(entityType: string, entityId: string, limit: number): Promise<AdminAuditRow[]> {
    return this.adminAudit
      .filter((r) => r.entityType === entityType && r.entityId === entityId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((r) => toAdminAuditRow(r.id, r.action, r.after, r.createdAt));
  }

  async linkVendorUser(user: NewVendorUser): Promise<string> {
    const email = user.email.trim().toLowerCase();
    const existing = [...this.portalUsers.entries()].find(([, u]) => u.vendorId === user.vendorId && u.email === email);
    const id = existing?.[1].id ?? randomUUID();
    if (existing) this.portalUsers.delete(existing[0]);
    this.portalUsers.set(user.authUserId, {
      id,
      email,
      name: user.name,
      kind: "vendor",
      role: user.role,
      vendorId: user.vendorId,
      status: existing?.[1].status ?? "ACTIVE",
    });
    return id;
  }

  async setVendorUserStatus(vendorId: string, userId: string, status: "ACTIVE" | "DISABLED"): Promise<boolean> {
    for (const [authId, u] of this.portalUsers) {
      if (u.id === userId && u.vendorId === vendorId) {
        this.portalUsers.set(authId, { ...u, status });
        return true;
      }
    }
    return false;
  }

  async findAuthUserIdByEmail(email: string): Promise<string | null> {
    return this.devAuthUsers.get(email.trim().toLowerCase()) ?? null;
  }

  // Local development only: lets an invited user log in with the dev password.
  async findDevPortalUserByEmail(email: string): Promise<PortalUser | null> {
    const authId = this.devAuthUsers.get(email.trim().toLowerCase());
    return authId ? (this.portalUsers.get(authId) ?? null) : null;
  }

  async getAgreement(vendorId: string): Promise<AgreementRecord | null> {
    return this.agreements.get(vendorId) ?? null;
  }

  async saveAgreement(agreement: AgreementRecord): Promise<void> {
    this.agreements.set(agreement.vendorId, { ...agreement });
  }

  async addVendorApiKey(
    vendorId: string,
    credentials: { keyPrefix: string; apiKey: string; signingSecret: string },
    now: Date,
  ): Promise<string> {
    const id = randomUUID();
    this.addApiKey(
      {
        id,
        vendorId,
        keyPrefix: credentials.keyPrefix,
        keyHash: sha256Hex(credentials.apiKey),
        scopes: API_SCOPES,
        signingSecretRef: `memory-${credentials.keyPrefix}`,
        status: "ACTIVE",
        expiresAt: null,
      },
      credentials.signingSecret,
      now,
    );
    return id;
  }

  async revokeVendorApiKey(vendorId: string, keyId: string, now: Date): Promise<boolean> {
    const key = [...this.apiKeys.values()].find((k) => k.id === keyId && k.vendorId === vendorId && k.status === "ACTIVE");
    if (!key) return false;
    this.apiKeys.set(key.keyPrefix, { ...key, status: "REVOKED" });
    this.keyTimes.set(key.id, { createdAt: this.keyTimes.get(key.id)?.createdAt ?? now, revokedAt: now });
    return true;
  }

  async saveVendorSettings(vendorId: string, settings: Record<string, unknown>): Promise<void> {
    const v = this.vendors.get(vendorId);
    if (v) this.vendors.set(vendorId, { ...v, settings });
  }

  addVendor(vendor: VendorRecord): void {
    this.vendors.set(vendor.id, vendor);
  }

  addApiKey(key: ApiKeyRecord, signingSecret: string, createdAt: Date = new Date()): void {
    this.apiKeys.set(key.keyPrefix, key);
    this.keyTimes.set(key.id, { createdAt, revokedAt: null });
    this.signingSecrets.set(key.signingSecretRef, signingSecret);
  }

  async findApiKeyByPrefix(prefix: string) {
    return this.apiKeys.get(prefix) ?? null;
  }

  async resolveSigningSecret(ref: string) {
    return this.signingSecrets.get(ref) ?? null;
  }

  async getVendor(id: string) {
    return this.vendors.get(id) ?? null;
  }

  async getVendors(ids: readonly string[]) {
    const out = new Map<string, VendorRecord>();
    for (const id of ids) {
      const vendor = this.vendors.get(id);
      if (vendor) out.set(id, vendor);
    }
    return out;
  }

  async findIdempotencyKey(key: string) {
    const found = this.idempotency.get(key);
    return found ? { payloadHash: found.payloadHash } : null;
  }

  async findCustomerIdByPhoneHash(phoneHash: string, keyVersion: number) {
    return this.phones.get(phoneKey(phoneHash, keyVersion)) ?? null;
  }

  async createCustomer(phoneHash: string, keyVersion: number, now: Date = new Date()) {
    const id = randomUUID();
    this.phones.set(phoneKey(phoneHash, keyVersion), id);
    this.customers.set(id, { id, status: "ACTIVE", createdAt: now, lastActivityAt: now });
    return id;
  }

  async findOrder(vendorId: string, externalOrderRef: string) {
    const order = this.orders.get(orderKey(vendorId, externalOrderRef));
    return order ? { ...order } : null;
  }

  async saveAcceptedEvent(event: OrderEventRecord, order: OrderRecord) {
    if (this.idempotency.has(event.idempotencyKey)) return "DUPLICATE_KEY" as const;
    this.events.push(event);
    this.idempotency.set(event.idempotencyKey, { payloadHash: event.payloadHash, orderEventId: event.id });
    this.orders.set(orderKey(order.vendorId, order.externalOrderRef), { ...order });
    return "SAVED" as const;
  }

  // Single process, single thread: no lock needed.
  async withCustomerLock<T>(_customerId: string, fn: (store: EtimaadStore) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async saveRejectedEvent(event: OrderEventRecord) {
    this.events.push(event);
  }

  async listCustomerOrders(customerId: string) {
    return [...this.orders.values()].filter((o) => o.customerId === customerId).map((o) => ({ ...o }));
  }

  async saveScores(customerId: string, profile: TrustProfile, vendorScores: ReadonlyMap<string, VendorCustomerScore>) {
    this.profiles.set(customerId, profile);
    for (const [vendorId, score] of vendorScores) this.vendorScores.set(scoreKey(customerId, vendorId), score);
  }

  async getProfile(customerId: string) {
    return this.profiles.get(customerId) ?? null;
  }

  async getVendorCustomerScore(customerId: string, vendorId: string) {
    return this.vendorScores.get(scoreKey(customerId, vendorId)) ?? null;
  }

  async countLookupsSince(vendorId: string, since: Date) {
    return this.lookups.filter((l) => l.vendorId === vendorId && l.createdAt >= since).length;
  }

  async countOrdersReportedSince(vendorId: string, since: Date) {
    return [...this.orders.values()].filter((o) => o.vendorId === vendorId && o.occurredAt >= since).length;
  }

  async recordLookup(record: LookupRecord) {
    this.lookups.push(record);
  }
}
