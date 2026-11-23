// Domain enums from blueprint section 3.1.

export const SCORE_MODEL_VERSION = 1;

export const PAYMENT_METHODS = ["COD", "PREPAID", "PARTIAL_ADVANCE"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_STATUSES = [
  "PLACED",
  "DISPATCHED",
  "DELIVERED",
  "PARTIALLY_DELIVERED",
  "FAILED_DELIVERY",
  "RETURNED_POST_DELIVERY",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "DELIVERED",
  "PARTIALLY_DELIVERED",
  "FAILED_DELIVERY",
  "RETURNED_POST_DELIVERY",
  "CANCELLED",
];

export const CANCELLATION_STAGES = ["PRE_CONFIRMATION", "PRE_DISPATCH", "POST_DISPATCH"] as const;
export type CancellationStage = (typeof CANCELLATION_STAGES)[number];

export const FAULT_CLASSES = ["NONE", "USER", "VENDOR", "LOGISTICS", "NEUTRAL", "UNKNOWN"] as const;
export type FaultClass = (typeof FAULT_CLASSES)[number];

export const RISK_TIERS = ["LOW", "MEDIUM", "HIGH", "INSUFFICIENT_DATA"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const RECOMMENDED_ACTIONS = [
  "ALLOW_COD",
  "REQUIRE_CONFIRMATION_CALL",
  "REQUIRE_PARTIAL_ADVANCE",
  "PREPAID_ONLY",
] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export const VENDOR_STATUSES = [
  "PENDING_VERIFICATION",
  "PROBATION",
  "ACTIVE",
  "RESTRICTED",
  "TERMINATED",
] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const SOURCE_PLATFORMS = ["API", "WOOCOMMERCE", "SHOPIFY"] as const;
export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

export const RISK_CHECK_MODES = ["PRE_CHECKOUT", "POST_ORDER"] as const;
export type RiskCheckMode = (typeof RISK_CHECK_MODES)[number];

// Consent version used for historical backfill rows (blueprint section 3.5).
export const PRE_NOTICE_BACKFILL = "PRE_NOTICE_BACKFILL";
