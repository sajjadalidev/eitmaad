// In-memory store for local development and tests. Data lives only in this process.

import { randomUUID } from "node:crypto";
import type { TrustProfile, VendorCustomerScore } from "@etimaad/core";
import type {
  ApiKeyRecord,
  EtimaadStore,
  LookupRecord,
  OrderEventRecord,
  OrderRecord,
  VendorApplicationRecord,
  VendorRecord,
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
