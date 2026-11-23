// Scoring model v1 (blueprint sections 5.2, 6). Pure functions, no I/O.

import { PRE_NOTICE_BACKFILL, TERMINAL_STATUSES } from "./domain";
import type { FaultClass, OrderStatus, PaymentMethod, RiskTier, VendorStatus } from "./domain";
import { SCORE_MODEL_V1, type ScoreModelParams } from "./model";
import { REASON_CODE_CATALOGUE, isReasonCode } from "./reason-codes";

const DAY_MS = 86_400_000;
const PKT_OFFSET_MS = 5 * 3_600_000;

export type DisputeState = "NONE" | "OPEN" | "UPHELD";

export interface ScoringOrder {
  id: string;
  vendorId: string;
  occurredAt: Date;
  status: OrderStatus;
  reasonCode: string | null;
  derivedFault: FaultClass;
  paymentMethod: PaymentMethod;
  orderValuePkr: number;
  consentNoticeVersion: string;
  isBackfill: boolean;
  dispute: DisputeState;
}

export interface ScoringVendor {
  trustWeight: number;
  faultClaimBias: number;
  status: VendorStatus;
}

export type ScoreRule =
  | "HARD_RULE_FAKE_ADDRESS"
  | "THIN_DATA_MULTI_VENDOR"
  | "THIN_DATA_SINGLE_VENDOR"
  | "CORROBORATION_CAP"
  | "CORROBORATED_NEGATIVE";

// Stored as CUSTOMER_TRUST_PROFILES.score_breakdown, so keys are snake_case.
export interface ScoreBreakdown {
  model_version: number;
  positive_evidence: number;
  negative_evidence: number;
  alpha: number;
  beta: number;
  scoreable_orders: number;
  distinct_vendors: number;
  negative_vendors: number;
  data_sufficient: boolean;
  rules_fired: ScoreRule[];
  excluded: {
    vendor_fault: number;
    logistics_fault: number;
    neutral: number;
    unknown: number;
    disputed: number;
    daily_cap: number;
    pre_notice_backfill: number;
  };
  calculated_at: string;
}

export interface TrustProfile {
  scoreVersion: number;
  cumulativeScore: number;
  riskTier: RiskTier;
  totalNetworkOrders: number;
  scoreableOrders: number;
  totalDelivered: number;
  totalUserFault: number;
  distinctVendorCount: number;
  negativeVendorCount: number;
  positiveEvidence: number;
  negativeEvidence: number;
  hasRecentUserFault: boolean;
  hasOpenDispute: boolean;
  lastOrderAt: Date | null;
  nextDecayRecalcAt: Date;
  breakdown: ScoreBreakdown;
}

const POSITIVE_STATUSES: readonly OrderStatus[] = ["DELIVERED", "PARTIALLY_DELIVERED", "RETURNED_POST_DELIVERY"];

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function ageInDays(occurredAt: Date, now: Date): number {
  return Math.max(0, (now.getTime() - occurredAt.getTime()) / DAY_MS);
}

export function recencyWeight(ageDays: number, params: ScoreModelParams = SCORE_MODEL_V1): number {
  return Math.max(params.recencyFloor, 0.5 ** (ageDays / params.halfLifeDays));
}

export function valueFactor(orderValuePkr: number, params: ScoreModelParams = SCORE_MODEL_V1): number {
  for (const band of params.valueBands) {
    if (band.maxPkr === null || orderValuePkr <= band.maxPkr) return band.factor;
  }
  return 1;
}

// Per-vendor positive cap: min(n, 10) + 0.25 * max(0, n - 10).
export function effectiveOrderCount(n: number, params: ScoreModelParams = SCORE_MODEL_V1): number {
  const full = params.perVendorFullCreditOrders;
  return Math.min(n, full) + params.perVendorExtraCreditRate * Math.max(0, n - full);
}

export function bayesianScore(positive: number, negative: number, params: ScoreModelParams = SCORE_MODEL_V1): number {
  return round((100 * (positive + params.alpha)) / (positive + negative + params.alpha + params.beta), 2);
}

export function tierFromScore(score: number, params: ScoreModelParams = SCORE_MODEL_V1): RiskTier {
  if (score >= params.lowTierMinScore) return "LOW";
  if (score >= params.mediumTierMinScore) return "MEDIUM";
  return "HIGH";
}

function pktDayKey(date: Date): string {
  return new Date(date.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

function compareOrders(a: ScoringOrder, b: ScoringOrder): number {
  const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function computeTrustProfile(
  orders: readonly ScoringOrder[],
  vendors: ReadonlyMap<string, ScoringVendor>,
  now: Date,
  params: ScoreModelParams = SCORE_MODEL_V1,
): TrustProfile {
  const excluded: ScoreBreakdown["excluded"] = {
    vendor_fault: 0,
    logistics_fault: 0,
    neutral: 0,
    unknown: 0,
    disputed: 0,
    daily_cap: 0,
    pre_notice_backfill: 0,
  };

  const networkVendors = new Set<string>();
  const negativeVendors = new Set<string>();
  const recentFaultVendors = new Set<string>();
  const fakeAddressVendors = new Set<string>();
  const positiveByVendor = new Map<string, { sum: number; n: number }>();
  const dailyCounts = new Map<string, number>();
  const boundaries: number[] = [];

  let negativeEvidence = 0;
  let totalNetworkOrders = 0;
  let scoreableOrders = 0;
  let totalDelivered = 0;
  let totalUserFault = 0;
  let recentUserFaults = 0;
  let hasOpenDispute = false;
  let lastOrderAt: Date | null = null;

  // Sorting makes the result independent of input order (replay-safe).
  for (const order of [...orders].sort(compareOrders)) {
    if (!TERMINAL_STATUSES.includes(order.status)) continue;
    const age = ageInDays(order.occurredAt, now);
    if (age > params.maxAgeDays) continue;

    if (order.consentNoticeVersion === PRE_NOTICE_BACKFILL && !params.allowPreNoticeBackfillInNetwork) {
      excluded.pre_notice_backfill++;
      continue;
    }

    totalNetworkOrders++;
    networkVendors.add(order.vendorId);
    if (lastOrderAt === null || order.occurredAt > lastOrderAt) lastOrderAt = order.occurredAt;
    boundaries.push(order.occurredAt.getTime() + params.maxAgeDays * DAY_MS);

    if (order.dispute === "UPHELD") {
      excluded.disputed++;
      continue;
    }
    if (order.dispute === "OPEN") hasOpenDispute = true;

    const isPositive = POSITIVE_STATUSES.includes(order.status);
    const isNegative = !isPositive && order.derivedFault === "USER";
    if (!isPositive && !isNegative) {
      if (order.derivedFault === "VENDOR") excluded.vendor_fault++;
      else if (order.derivedFault === "LOGISTICS") excluded.logistics_fault++;
      else if (order.derivedFault === "NEUTRAL") excluded.neutral++;
      else excluded.unknown++;
      continue;
    }

    // Daily cap per vendor and customer, counted on scoreable orders only.
    const dayKey = `${order.vendorId}|${pktDayKey(order.occurredAt)}`;
    const countToday = (dailyCounts.get(dayKey) ?? 0) + 1;
    dailyCounts.set(dayKey, countToday);
    if (countToday > params.dailyOrderCap) {
      excluded.daily_cap++;
      continue;
    }

    const vendor = vendors.get(order.vendorId);
    if (!vendor) throw new Error(`Missing vendor data for ${order.vendorId}`);

    const backfillMultiplier =
      order.isBackfill && vendor.status === "PROBATION" ? params.probationBackfillMultiplier : 1;
    const weight =
      vendor.trustWeight * recencyWeight(age, params) * valueFactor(order.orderValuePkr, params) * backfillMultiplier;
    scoreableOrders++;

    if (isPositive) {
      const partial = order.status === "PARTIALLY_DELIVERED" ? params.partialDeliveryWeight : 1;
      const entry = positiveByVendor.get(order.vendorId) ?? { sum: 0, n: 0 };
      entry.sum += weight * params.paymentWeights[order.paymentMethod] * partial;
      entry.n++;
      positiveByVendor.set(order.vendorId, entry);
      totalDelivered++;
    } else {
      const severity =
        order.reasonCode !== null && isReasonCode(order.reasonCode)
          ? REASON_CODE_CATALOGUE[order.reasonCode].severityWeight
          : 1;
      const disputeMultiplier = order.dispute === "OPEN" ? params.openDisputeWeight : 1;
      negativeEvidence += weight * severity * vendor.faultClaimBias * disputeMultiplier;
      totalUserFault++;
      negativeVendors.add(order.vendorId);

      if (age <= params.recentWindowDays) {
        recentUserFaults++;
        recentFaultVendors.add(order.vendorId);
        if (order.reasonCode === "FAKE_OR_INVALID_ADDRESS") fakeAddressVendors.add(order.vendorId);
        boundaries.push(order.occurredAt.getTime() + params.recentWindowDays * DAY_MS);
      }
    }
  }

  let positiveEvidence = 0;
  for (const { sum, n } of positiveByVendor.values()) {
    positiveEvidence += (sum * effectiveOrderCount(n, params)) / n;
  }

  const cumulativeScore = bayesianScore(positiveEvidence, negativeEvidence, params);
  const dataSufficient =
    scoreableOrders >= params.minScoreableOrders && positiveEvidence + negativeEvidence >= params.minWeightedEvidence;

  const rules: ScoreRule[] = [];
  let riskTier: RiskTier;

  if (fakeAddressVendors.size >= 2) {
    riskTier = "HIGH";
    rules.push("HARD_RULE_FAKE_ADDRESS");
  } else if (!dataSufficient) {
    if (recentUserFaults >= 2 && recentFaultVendors.size >= 2) {
      riskTier = "HIGH";
      rules.push("THIN_DATA_MULTI_VENDOR");
    } else if (recentUserFaults >= 2) {
      riskTier = "MEDIUM";
      rules.push("THIN_DATA_SINGLE_VENDOR");
    } else {
      riskTier = "INSUFFICIENT_DATA";
    }
  } else {
    riskTier = tierFromScore(cumulativeScore, params);
    // Negatives from a single vendor can never make a customer HIGH.
    if (riskTier === "HIGH" && negativeVendors.size === 1) {
      riskTier = "MEDIUM";
      rules.push("CORROBORATION_CAP");
    }
  }
  if (negativeVendors.size >= 2) rules.push("CORROBORATED_NEGATIVE");

  const maxRecalc = now.getTime() + params.maxRecalcIntervalDays * DAY_MS;
  const nextBoundary = boundaries.filter((t) => t > now.getTime()).reduce((a, b) => Math.min(a, b), maxRecalc);

  return {
    scoreVersion: params.version,
    cumulativeScore,
    riskTier,
    totalNetworkOrders,
    scoreableOrders,
    totalDelivered,
    totalUserFault,
    distinctVendorCount: networkVendors.size,
    negativeVendorCount: negativeVendors.size,
    positiveEvidence,
    negativeEvidence,
    hasRecentUserFault: recentUserFaults >= 1,
    hasOpenDispute,
    lastOrderAt,
    nextDecayRecalcAt: new Date(nextBoundary),
    breakdown: {
      model_version: params.version,
      positive_evidence: round(positiveEvidence, 4),
      negative_evidence: round(negativeEvidence, 4),
      alpha: params.alpha,
      beta: params.beta,
      scoreable_orders: scoreableOrders,
      distinct_vendors: networkVendors.size,
      negative_vendors: negativeVendors.size,
      data_sufficient: dataSufficient,
      rules_fired: rules,
      excluded,
      calculated_at: now.toISOString(),
    },
  };
}

export interface VendorCustomerScore {
  scoreVersion: number;
  totalOrders: number;
  delivered: number;
  partiallyDelivered: number;
  userFault: number;
  vendorFault: number;
  logisticsFault: number;
  neutral: number;
  unknown: number;
  successRate: number;
}

// One vendor's own history with one customer (blueprint section 6.5). Same prior, no decay.
// Includes pre-notice backfill rows, because the data stays with the vendor that reported it.
export function computeVendorCustomerScore(
  orders: readonly ScoringOrder[],
  now: Date,
  params: ScoreModelParams = SCORE_MODEL_V1,
): VendorCustomerScore {
  const score: VendorCustomerScore = {
    scoreVersion: params.version,
    totalOrders: 0,
    delivered: 0,
    partiallyDelivered: 0,
    userFault: 0,
    vendorFault: 0,
    logisticsFault: 0,
    neutral: 0,
    unknown: 0,
    successRate: 0,
  };

  for (const order of orders) {
    if (!TERMINAL_STATUSES.includes(order.status)) continue;
    if (ageInDays(order.occurredAt, now) > params.maxAgeDays) continue;
    if (order.dispute === "UPHELD") continue;
    score.totalOrders++;

    if (order.status === "PARTIALLY_DELIVERED") score.partiallyDelivered++;
    else if (POSITIVE_STATUSES.includes(order.status)) score.delivered++;
    else if (order.derivedFault === "USER") score.userFault++;
    else if (order.derivedFault === "VENDOR") score.vendorFault++;
    else if (order.derivedFault === "LOGISTICS") score.logisticsFault++;
    else if (order.derivedFault === "NEUTRAL") score.neutral++;
    else score.unknown++;
  }

  const positive = score.delivered + params.partialDeliveryWeight * score.partiallyDelivered;
  score.successRate = bayesianScore(positive, score.userFault, params);
  return score;
}
