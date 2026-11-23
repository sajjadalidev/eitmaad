// Daily lookup quota (blueprint section 9.4).

import type { VendorStatus } from "./domain";

const PKT_OFFSET_MS = 5 * 3_600_000;

export function dailyLookupQuota(status: VendorStatus, ordersReportedLast30Days: number): number {
  const earned = 3 * Math.max(0, ordersReportedLast30Days);
  switch (status) {
    case "ACTIVE":
      return 1_000 + earned;
    case "PROBATION":
      return 200 + earned;
    case "RESTRICTED":
      return 200;
    default:
      return 0;
  }
}

// Start of the current Pakistan (PKT, UTC+5) calendar day, as a UTC instant.
export function startOfPktDay(now: Date): Date {
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  const midnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightLocal - PKT_OFFSET_MS);
}

// Vendors that may call the API at all.
export function vendorCanUseApi(status: VendorStatus): boolean {
  return status === "PROBATION" || status === "ACTIVE" || status === "RESTRICTED";
}
