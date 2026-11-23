// Rebuilds a customer's scores from their orders (blueprint section 6.7).
// In production this runs in a queued job. Locally it runs inline.

import {
  computeTrustProfile,
  computeVendorCustomerScore,
  type DisputeState,
  type ScoringOrder,
  type ScoringVendor,
  type TrustProfile,
  type VendorCustomerScore,
} from "@etimaad/core";
import type { EtimaadStore, OrderRecord } from "./store";

function toScoringOrder(order: OrderRecord): ScoringOrder {
  let dispute: DisputeState = "NONE";
  if (order.scoringExcludedReason === "DISPUTE_UPHELD") dispute = "UPHELD";
  else if (order.isDisputed) dispute = "OPEN";
  return {
    id: order.id,
    vendorId: order.vendorId,
    occurredAt: order.occurredAt,
    status: order.status,
    reasonCode: order.reasonCode,
    derivedFault: order.derivedFault,
    paymentMethod: order.paymentMethod,
    orderValuePkr: order.orderValuePkr,
    consentNoticeVersion: order.consentNoticeVersion,
    isBackfill: order.isBackfill,
    dispute,
  };
}

export async function recomputeCustomer(store: EtimaadStore, customerId: string, now: Date): Promise<TrustProfile> {
  return store.withCustomerLock(customerId, (locked) => rebuild(locked, customerId, now));
}

async function rebuild(store: EtimaadStore, customerId: string, now: Date): Promise<TrustProfile> {
  const orders = (await store.listCustomerOrders(customerId)).map(toScoringOrder);
  const vendorIds = [...new Set(orders.map((o) => o.vendorId))];
  const vendorRecords = await store.getVendors(vendorIds);

  const vendors = new Map<string, ScoringVendor>();
  for (const [id, v] of vendorRecords) {
    vendors.set(id, { trustWeight: v.trustWeight, faultClaimBias: v.faultClaimBias, status: v.status });
  }

  const profile = computeTrustProfile(orders, vendors, now);
  const vendorScores = new Map<string, VendorCustomerScore>();
  for (const vendorId of vendorIds) {
    vendorScores.set(
      vendorId,
      computeVendorCustomerScore(
        orders.filter((o) => o.vendorId === vendorId),
        now,
      ),
    );
  }

  await store.saveScores(customerId, profile, vendorScores);
  return profile;
}
