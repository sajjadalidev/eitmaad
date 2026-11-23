// Scoring model parameters (blueprint section 6). Stored in SCORE_MODEL_VERSIONS.params.

import type { PaymentMethod } from "./domain";

export interface ValueBand {
  // Inclusive upper limit in PKR. null means no limit.
  maxPkr: number | null;
  factor: number;
}

export interface ScoreModelParams {
  version: number;
  alpha: number;
  beta: number;
  halfLifeDays: number;
  recencyFloor: number;
  maxAgeDays: number;
  valueBands: readonly ValueBand[];
  paymentWeights: Readonly<Record<PaymentMethod, number>>;
  partialDeliveryWeight: number;
  openDisputeWeight: number;
  perVendorFullCreditOrders: number;
  perVendorExtraCreditRate: number;
  dailyOrderCap: number;
  probationBackfillMultiplier: number;
  minScoreableOrders: number;
  minWeightedEvidence: number;
  recentWindowDays: number;
  lowTierMinScore: number;
  mediumTierMinScore: number;
  maxRecalcIntervalDays: number;
  allowPreNoticeBackfillInNetwork: boolean;
}

export const SCORE_MODEL_V1: ScoreModelParams = {
  version: 1,
  alpha: 4,
  beta: 1,
  halfLifeDays: 90,
  recencyFloor: 0.25,
  maxAgeDays: 730,
  valueBands: [
    { maxPkr: 1499.99, factor: 0.75 },
    { maxPkr: 5000, factor: 1 },
    { maxPkr: 15000, factor: 1.25 },
    { maxPkr: null, factor: 1.5 },
  ],
  paymentWeights: { COD: 1, PARTIAL_ADVANCE: 0.9, PREPAID: 0.75 },
  partialDeliveryWeight: 0.5,
  openDisputeWeight: 0.5,
  perVendorFullCreditOrders: 10,
  perVendorExtraCreditRate: 0.25,
  dailyOrderCap: 3,
  probationBackfillMultiplier: 0.5,
  minScoreableOrders: 3,
  minWeightedEvidence: 1.5,
  recentWindowDays: 180,
  lowTierMinScore: 85,
  mediumTierMinScore: 65,
  maxRecalcIntervalDays: 7,
  allowPreNoticeBackfillInNetwork: false,
};
