// Shared test data. Not exported from the package.

import type { ScoringOrder, ScoringVendor } from "./scoring";
import { SCORE_MODEL_V1, type ScoreModelParams } from "./model";

export const NOW = new Date("2026-11-20T12:00:00Z");
export const DAY_MS = 86_400_000;

export function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

export const VENDORS: ReadonlyMap<string, ScoringVendor> = new Map([
  ["A", { trustWeight: 1, faultClaimBias: 1, status: "ACTIVE" }],
  ["B", { trustWeight: 1, faultClaimBias: 1, status: "ACTIVE" }],
  ["C", { trustWeight: 1, faultClaimBias: 1, status: "ACTIVE" }],
]);

// Golden examples use weight 1 for every order, so the daily cap is turned off.
export const NO_DAILY_CAP: ScoreModelParams = { ...SCORE_MODEL_V1, dailyOrderCap: 1_000 };

let counter = 0;

export function delivered(vendorId: string, extra: Partial<ScoringOrder> = {}): ScoringOrder {
  counter++;
  return {
    id: `o${String(counter).padStart(6, "0")}`,
    vendorId,
    occurredAt: NOW,
    status: "DELIVERED",
    reasonCode: null,
    derivedFault: "NONE",
    paymentMethod: "COD",
    orderValuePkr: 3000,
    consentNoticeVersion: "2026-10",
    isBackfill: false,
    dispute: "NONE",
    ...extra,
  };
}

export function refused(vendorId: string, extra: Partial<ScoringOrder> = {}): ScoringOrder {
  return delivered(vendorId, {
    status: "FAILED_DELIVERY",
    reasonCode: "CUSTOMER_REFUSED_AT_DOOR",
    derivedFault: "USER",
    ...extra,
  });
}

export function many(count: number, make: () => ScoringOrder): ScoringOrder[] {
  return Array.from({ length: count }, make);
}
