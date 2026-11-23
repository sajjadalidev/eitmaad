// In-memory store for local development and tests. Data lives only in this process.

import { randomUUID } from "node:crypto";
import { sha256Hex, type TrustProfile, type VendorCustomerScore } from "@etimaad/core";
import { applicationAuditRow, toApplicationEvent, type AuditRowValues } from "./application-audit";
import { API_SCOPES } from "./store";
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

  async adminOverview(): Promise<AdminOverview> {
    return {
      applicationsWaiting: this.applications.filter((a) => a.status === "NEW" || a.status === "REVIEWING").length,
      disputesForReview: 0,
      activeVendors: [...this.vendors.values()].filter((v) => v.status === "ACTIVE").length,
    };
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
        return {
          id: v.id,
          displayName: v.displayName,
          status: v.status,
          trustWeight: v.trustWeight,
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

  async listApplications(limit: number) {
    return [...this.applications].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
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
    );
    this.applyChange(change, vendorId);
    return { status: "SAVED" as const, credentials: { vendorId, ...credentials } };
  }

  addVendor(vendor: VendorRecord): void {
    this.vendors.set(vendor.id, vendor);
  }

  addApiKey(key: ApiKeyRecord, signingSecret: string): void {
    this.apiKeys.set(key.keyPrefix, key);
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

  async createCustomer(phoneHash: string, keyVersion: number) {
    const id = randomUUID();
    this.phones.set(phoneKey(phoneHash, keyVersion), id);
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
