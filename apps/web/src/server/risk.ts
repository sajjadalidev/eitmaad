// Real-time risk check (blueprint sections 7, 9.3, 9.4, 10).

import { randomUUID } from "node:crypto";
import {
  DEFAULT_VENDOR_SETTINGS,
  SCORE_MODEL_V1,
  checkOrderRefHasNoPii,
  dailyLookupQuota,
  hashPhone,
  normalizePkMobile,
  parseVendorSettings,
  resolveAction,
  startOfPktDay,
  type RecommendedAction,
  type RiskTier,
  type ScoreRule,
  type TrustProfile,
} from "@etimaad/core";
import { ApiError } from "./http";
import type { ServiceContext } from "./ingest";
import { recomputeCustomer } from "./recompute";
import { riskCheckSchema } from "./schemas";
import type { VendorRecord } from "./store";

const DAY_MS = 86_400_000;
const MIN_VENDORS_FOR_NETWORK_DATA = 3;

export interface RiskCheckResponse {
  risk_tier: RiskTier;
  score: number | null;
  recommended_action: RecommendedAction;
  reasons: string[];
  data_sufficiency: "SUFFICIENT" | "INSUFFICIENT";
  under_review: boolean;
  network_signal: { vendor_count_band: string; last_activity_band: string } | null;
  your_history: { orders: number; delivered: number; user_fault: number; success_rate: number } | null;
  model_version: number;
}

// Public reason names. CORROBORATION_CAP is internal and not shown.
const RULE_REASONS: Partial<Record<ScoreRule, string>> = {
  HARD_RULE_FAKE_ADDRESS: "REPEATED_FAKE_ADDRESS",
  THIN_DATA_MULTI_VENDOR: "RECENT_FAULTS_MULTIPLE_MERCHANTS",
  THIN_DATA_SINGLE_VENDOR: "RECENT_FAULTS_ONE_MERCHANT",
  CORROBORATED_NEGATIVE: "CORROBORATED_USER_FAULTS",
};

function vendorCountBand(count: number): string {
  return count >= 5 ? "5+" : "2-4";
}

function lastActivityBand(lastOrderAt: Date | null, now: Date): string {
  if (!lastOrderAt) return "NONE";
  const days = (now.getTime() - lastOrderAt.getTime()) / DAY_MS;
  if (days <= 30) return "LAST_30_DAYS";
  if (days <= 90) return "LAST_90_DAYS";
  if (days <= 365) return "LAST_YEAR";
  return "OLDER";
}

export async function riskCheck(
  ctx: ServiceContext,
  vendor: VendorRecord,
  apiKeyId: string,
  body: unknown,
  startedAt: number = Date.now(),
): Promise<RiskCheckResponse> {
  const { store, now } = ctx;

  const parsed = riskCheckSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request body is not valid.");
  const input = parsed.data;

  const phone = normalizePkMobile(input.phone);
  if (!phone.ok) throw new ApiError(422, "INVALID_PHONE", "Phone must be a Pakistani mobile number.");
  if (input.checkout_ref && !checkOrderRefHasNoPii(input.checkout_ref).ok) {
    throw new ApiError(422, "PII_IN_REFERENCE", "checkout_ref must not contain a phone number.");
  }

  const used = await store.countLookupsSince(vendor.id, startOfPktDay(now));
  const reported = await store.countOrdersReportedSince(vendor.id, new Date(now.getTime() - 30 * DAY_MS));
  if (used >= dailyLookupQuota(vendor.status, reported)) {
    throw new ApiError(429, "QUOTA_EXCEEDED", "Daily risk check quota reached.");
  }

  const phoneHash = hashPhone(phone.value, ctx.pepper);
  const customerId = await store.findCustomerIdByPhoneHash(phoneHash, ctx.keyVersion);

  let profile: TrustProfile | null = customerId ? await store.getProfile(customerId) : null;
  if (customerId && profile && profile.nextDecayRecalcAt <= now) {
    profile = await recomputeCustomer(store, customerId, now);
  }
  const ownScore = customerId ? await store.getVendorCustomerScore(customerId, vendor.id) : null;

  const settings = parseVendorSettings(vendor.settings);
  const tier: RiskTier = profile?.riskTier ?? "INSUFFICIENT_DATA";
  const decision = resolveAction({
    tier,
    orderValuePkr: input.order_value_pkr,
    hasRecentUserFault: profile?.hasRecentUserFault ?? false,
    ownUserFaults: ownScore?.userFault ?? 0,
    settings: settings.ok ? settings.value : DEFAULT_VENDOR_SETTINGS,
  });

  const showNetwork = profile !== null && profile.distinctVendorCount >= MIN_VENDORS_FOR_NETWORK_DATA;
  const ruleReasons = (profile?.breakdown.rules_fired ?? [])
    .map((rule) => RULE_REASONS[rule])
    .filter((r): r is string => r !== undefined);

  const response: RiskCheckResponse = {
    risk_tier: tier,
    score: showNetwork && profile ? Math.round(profile.cumulativeScore) : null,
    recommended_action: decision.action,
    reasons: [...ruleReasons, ...decision.reasons],
    data_sufficiency: profile?.breakdown.data_sufficient ? "SUFFICIENT" : "INSUFFICIENT",
    under_review: profile?.hasOpenDispute ?? false,
    network_signal:
      showNetwork && profile
        ? {
            vendor_count_band: vendorCountBand(profile.distinctVendorCount),
            last_activity_band: lastActivityBand(profile.lastOrderAt, now),
          }
        : null,
    your_history:
      ownScore && ownScore.totalOrders > 0
        ? {
            orders: ownScore.totalOrders,
            delivered: ownScore.delivered,
            user_fault: ownScore.userFault,
            success_rate: ownScore.successRate,
          }
        : null,
    model_version: profile?.scoreVersion ?? SCORE_MODEL_V1.version,
  };

  await store.recordLookup({
    id: randomUUID(),
    createdAt: now,
    vendorId: vendor.id,
    apiKeyId,
    customerId,
    phoneHash,
    checkoutRef: input.checkout_ref ?? null,
    orderValuePkr: input.order_value_pkr,
    returnedTier: tier,
    returnedAction: decision.action,
    mode: input.mode ?? "PRE_CHECKOUT",
    latencyMs: Math.max(0, Date.now() - startedAt),
  });

  return response;
}
