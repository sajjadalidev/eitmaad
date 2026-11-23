// Admin customer search and detail (blueprint section 20.3.3).
// The phone number is hashed at once and never stored or logged. Every view is audit-logged.

import { hashPhone, normalizePkMobile, type TrustProfile, type VendorCustomerScore } from "@etimaad/core";
import { recomputeCustomer } from "./recompute";
import type {
  AdminAuditRow,
  CustomerLookupCount,
  CustomerRecord,
  EtimaadStore,
  OrderRecord,
  VendorRecord,
} from "./store";

export const CUSTOMER_ENTITY = "customer";
const SEARCH_ENTITY = "customer_search";
export const RECOMPUTE_ROLES = ["ADMIN", "SUPPORT"];

export interface Actor {
  id: string;
  name: string;
  role: string;
}

export type SearchResult = { status: "FOUND"; customerId: string } | { status: "NOT_FOUND" } | { status: "INVALID_PHONE" };

export async function findCustomerByPhone(
  ctx: { store: EtimaadStore; pepper: string; keyVersion: number; now: Date },
  actor: Actor,
  phone: string,
): Promise<SearchResult> {
  const normalized = normalizePkMobile(phone);
  if (!normalized.ok) return { status: "INVALID_PHONE" };
  const customerId = await ctx.store.findCustomerIdByPhoneHash(hashPhone(normalized.value, ctx.pepper), ctx.keyVersion);
  if (customerId) return { status: "FOUND", customerId };

  // A search with no match is logged too, without the number.
  await ctx.store.recordAdminAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: "CUSTOMER_SEARCH_NO_MATCH",
    entityType: SEARCH_ENTITY,
    entityId: "none",
    note: null,
    now: ctx.now,
  });
  return { status: "NOT_FOUND" };
}

export interface CustomerStoreRow {
  vendorId: string;
  vendorName: string;
  score: VendorCustomerScore | null;
  orders: number;
  lookups: number;
  lastLookupAt: Date | null;
}

export interface CustomerDetail {
  customer: CustomerRecord;
  profile: TrustProfile | null;
  orders: OrderRecord[];
  vendors: Map<string, VendorRecord>;
  stores: CustomerStoreRow[];
  accessLog: AdminAuditRow[];
}

export async function loadCustomerDetail(
  ctx: { store: EtimaadStore; now: Date },
  actor: Actor,
  customerId: string,
): Promise<CustomerDetail | null> {
  const { store } = ctx;
  const customer = await store.getCustomer(customerId);
  if (!customer) return null;

  await store.recordAdminAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: "CUSTOMER_VIEW",
    entityType: CUSTOMER_ENTITY,
    entityId: customerId,
    note: null,
    now: ctx.now,
  });

  const [profile, orders, lookups, accessLog] = await Promise.all([
    store.getProfile(customerId),
    store.listCustomerOrders(customerId),
    store.listCustomerLookupCounts(customerId),
    store.listAdminAudit(CUSTOMER_ENTITY, customerId, 20),
  ]);
  orders.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const lookupsBy = new Map<string, CustomerLookupCount>(lookups.map((l) => [l.vendorId, l]));
  const vendorIds = [...new Set([...orders.map((o) => o.vendorId), ...lookups.map((l) => l.vendorId)])];
  const vendors = await store.getVendors(vendorIds);
  const scores = await Promise.all(vendorIds.map((id) => store.getVendorCustomerScore(customerId, id)));

  const stores: CustomerStoreRow[] = vendorIds
    .map((id, i) => ({
      vendorId: id,
      vendorName: vendors.get(id)?.displayName ?? "Unknown store",
      score: scores[i] ?? null,
      orders: orders.filter((o) => o.vendorId === id).length,
      lookups: lookupsBy.get(id)?.count ?? 0,
      lastLookupAt: lookupsBy.get(id)?.lastAt ?? null,
    }))
    .sort((a, b) => b.orders - a.orders || a.vendorName.localeCompare(b.vendorName));

  return { customer, profile, orders, vendors, stores, accessLog };
}

export async function recomputeForAdmin(
  ctx: { store: EtimaadStore; now: Date },
  actor: Actor,
  customerId: string,
): Promise<{ status: "SAVED" } | { status: "ERROR"; message: string }> {
  if (!RECOMPUTE_ROLES.includes(actor.role)) return { status: "ERROR", message: "Your role cannot do this." };
  if (!(await ctx.store.getCustomer(customerId))) return { status: "ERROR", message: "Customer not found." };
  await recomputeCustomer(ctx.store, customerId, ctx.now);
  await ctx.store.recordAdminAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: "CUSTOMER_RECOMPUTE",
    entityType: CUSTOMER_ENTITY,
    entityId: customerId,
    note: null,
    now: ctx.now,
  });
  return { status: "SAVED" };
}
