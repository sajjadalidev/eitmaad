// Vendor settings and recommended action (blueprint section 7).

import { z } from "zod";
import { RECOMMENDED_ACTIONS, RISK_TIERS, type RecommendedAction, type RiskTier } from "./domain";
import { err, ok, type Result } from "./result";

export type DegradedModeAction = "ALLOW_COD" | "REQUIRE_CONFIRMATION_CALL";

// Stored as VENDORS.settings, so keys are snake_case.
export interface VendorSettings {
  tier_actions: Record<RiskTier, RecommendedAction>;
  high_value_threshold_pkr: number;
  high_value_overrides: Partial<Record<RiskTier, RecommendedAction>>;
  recent_user_fault_action: RecommendedAction;
  own_history_rules: { min_user_faults_with_us: number; action: RecommendedAction };
  degraded_mode_action: DegradedModeAction;
}

export const DEFAULT_VENDOR_SETTINGS: VendorSettings = {
  tier_actions: {
    LOW: "ALLOW_COD",
    MEDIUM: "REQUIRE_CONFIRMATION_CALL",
    HIGH: "PREPAID_ONLY",
    INSUFFICIENT_DATA: "ALLOW_COD",
  },
  high_value_threshold_pkr: 15000,
  high_value_overrides: {
    MEDIUM: "REQUIRE_PARTIAL_ADVANCE",
    INSUFFICIENT_DATA: "REQUIRE_CONFIRMATION_CALL",
  },
  recent_user_fault_action: "REQUIRE_CONFIRMATION_CALL",
  own_history_rules: { min_user_faults_with_us: 2, action: "PREPAID_ONLY" },
  degraded_mode_action: "ALLOW_COD",
};

const actionSchema = z.enum(RECOMMENDED_ACTIONS);
const tierActionsSchema = z.strictObject({
  LOW: actionSchema.optional(),
  MEDIUM: actionSchema.optional(),
  HIGH: actionSchema.optional(),
  INSUFFICIENT_DATA: actionSchema.optional(),
});

const settingsInputSchema = z.strictObject({
  tier_actions: tierActionsSchema.optional(),
  high_value_threshold_pkr: z.number().positive().optional(),
  high_value_overrides: tierActionsSchema.optional(),
  recent_user_fault_action: actionSchema.optional(),
  own_history_rules: z
    .strictObject({ min_user_faults_with_us: z.number().int().min(1), action: actionSchema })
    .optional(),
  degraded_mode_action: z.enum(["ALLOW_COD", "REQUIRE_CONFIRMATION_CALL"]).optional(),
});

type TierActionsInput = z.infer<typeof tierActionsSchema>;

function pickTierActions(input: TierActionsInput | undefined): Partial<Record<RiskTier, RecommendedAction>> {
  const out: Partial<Record<RiskTier, RecommendedAction>> = {};
  if (!input) return out;
  for (const tier of RISK_TIERS) {
    const action = input[tier];
    if (action !== undefined) out[tier] = action;
  }
  return out;
}

// Validates stored or submitted settings and fills in defaults.
export function parseVendorSettings(input: unknown): Result<VendorSettings, "VALIDATION_ERROR"> {
  const parsed = settingsInputSchema.safeParse(input ?? {});
  if (!parsed.success) return err("VALIDATION_ERROR");
  const data = parsed.data;
  const d = DEFAULT_VENDOR_SETTINGS;

  return ok({
    tier_actions: { ...d.tier_actions, ...pickTierActions(data.tier_actions) },
    high_value_threshold_pkr: data.high_value_threshold_pkr ?? d.high_value_threshold_pkr,
    high_value_overrides: data.high_value_overrides
      ? pickTierActions(data.high_value_overrides)
      : { ...d.high_value_overrides },
    recent_user_fault_action: data.recent_user_fault_action ?? d.recent_user_fault_action,
    own_history_rules: data.own_history_rules ?? { ...d.own_history_rules },
    degraded_mode_action: data.degraded_mode_action ?? d.degraded_mode_action,
  });
}

const STRICTNESS: Record<RecommendedAction, number> = {
  ALLOW_COD: 0,
  REQUIRE_CONFIRMATION_CALL: 1,
  REQUIRE_PARTIAL_ADVANCE: 2,
  PREPAID_ONLY: 3,
};

function stricter(a: RecommendedAction, b: RecommendedAction): RecommendedAction {
  return STRICTNESS[b] > STRICTNESS[a] ? b : a;
}

export type ActionReason = "HIGH_ORDER_VALUE" | "RECENT_USER_FAULT" | "OWN_HISTORY_RULE" | "DEGRADED_MODE";

export interface ActionInput {
  tier: RiskTier;
  orderValuePkr: number;
  hasRecentUserFault: boolean;
  // USER-fault orders this vendor itself reported for the customer.
  ownUserFaults: number;
  degraded?: boolean;
  settings: VendorSettings;
}

export interface ActionDecision {
  action: RecommendedAction;
  reasons: ActionReason[];
}

// Rules only ever make the action stricter, never looser.
export function resolveAction(input: ActionInput): ActionDecision {
  const { tier, orderValuePkr, hasRecentUserFault, ownUserFaults, degraded, settings } = input;

  if (degraded) return { action: settings.degraded_mode_action, reasons: ["DEGRADED_MODE"] };

  const reasons: ActionReason[] = [];
  let action = settings.tier_actions[tier];

  const highValueOverride = settings.high_value_overrides[tier];
  if (orderValuePkr > settings.high_value_threshold_pkr && highValueOverride) {
    const next = stricter(action, highValueOverride);
    if (next !== action) reasons.push("HIGH_ORDER_VALUE");
    action = next;
  }

  if (tier === "INSUFFICIENT_DATA" && hasRecentUserFault) {
    const next = stricter(action, settings.recent_user_fault_action);
    if (next !== action) reasons.push("RECENT_USER_FAULT");
    action = next;
  }

  if (ownUserFaults >= settings.own_history_rules.min_user_faults_with_us) {
    const next = stricter(action, settings.own_history_rules.action);
    if (next !== action) reasons.push("OWN_HISTORY_RULE");
    action = next;
  }

  return { action, reasons };
}
