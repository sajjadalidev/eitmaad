// Postgres enums. Values shared with @etimaad/core come from there, so both stay in sync.

import {
  CANCELLATION_STAGES,
  FAULT_CLASSES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  RECOMMENDED_ACTIONS,
  RISK_CHECK_MODES,
  RISK_TIERS,
  SOURCE_PLATFORMS,
  VENDOR_STATUSES,
} from "@etimaad/core";
import { pgEnum } from "drizzle-orm/pg-core";

export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHODS);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const cancellationStageEnum = pgEnum("cancellation_stage", CANCELLATION_STAGES);
export const faultClassEnum = pgEnum("fault_class", FAULT_CLASSES);
export const riskTierEnum = pgEnum("risk_tier", RISK_TIERS);
export const recommendedActionEnum = pgEnum("recommended_action", RECOMMENDED_ACTIONS);
export const vendorStatusEnum = pgEnum("vendor_status", VENDOR_STATUSES);
export const sourcePlatformEnum = pgEnum("source_platform", SOURCE_PLATFORMS);
export const riskCheckModeEnum = pgEnum("risk_check_mode", RISK_CHECK_MODES);

export const vendorCategoryEnum = pgEnum("vendor_category", ["food", "ecommerce", "retail"]);
export const ingestionModeEnum = pgEnum("ingestion_mode", ["WEBHOOK", "BATCH", "HYBRID"]);
export const kycLevelEnum = pgEnum("kyc_level", ["FULL", "LIGHT"]);
export const apiKeyStatusEnum = pgEnum("api_key_status", ["ACTIVE", "REVOKED"]);
export const customerStatusEnum = pgEnum("customer_status", ["ACTIVE", "UNDER_REVIEW", "ARCHIVED"]);
export const archivedReasonEnum = pgEnum("archived_reason", ["NOT_MY_NUMBER_UPHELD", "ERASURE"]);
export const identifierTypeEnum = pgEnum("identifier_type", ["PHONE_HASH"]);
export const signalTypeEnum = pgEnum("signal_type", ["EMAIL_HASH", "ADDRESS_HASH", "DEVICE_HASH"]);
export const storePlatformEnum = pgEnum("store_platform", ["WOOCOMMERCE", "SHOPIFY"]);
export const installationStatusEnum = pgEnum("installation_status", ["ACTIVE", "UNINSTALLED"]);
export const scoringExcludedReasonEnum = pgEnum("scoring_excluded_reason", ["DISPUTE_UPHELD"]);
export const eventResultEnum = pgEnum("event_result", ["ACCEPTED", "DUPLICATE", "REJECTED"]);
export const batchSourceTypeEnum = pgEnum("batch_source_type", ["SCHEDULED_JOB", "WEBHOOK_BATCH", "MANUAL_UPLOAD"]);
export const batchStatusEnum = pgEnum("batch_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "COMPLETED_WITH_ERRORS",
  "FAILED",
]);
export const disputeRaisedViaEnum = pgEnum("dispute_raised_via", ["SUPPORT", "VENDOR"]);
export const disputeVerificationEnum = pgEnum("dispute_verification", ["SMS_OTP"]);
export const disputeCategoryEnum = pgEnum("dispute_category", [
  "NOT_MY_ORDER",
  "WRONG_FAULT",
  "NOT_MY_NUMBER",
  "OTHER",
]);
export const disputeStatusEnum = pgEnum("dispute_status", [
  "OPEN",
  "AWAITING_VENDOR",
  "RESOLVED_UPHELD",
  "RESOLVED_REJECTED",
]);
export const actorTypeEnum = pgEnum("actor_type", ["ADMIN", "SYSTEM", "VENDOR"]);
export const adminRoleEnum = pgEnum("admin_role", ["SUPPORT", "ANALYST", "ADMIN"]);
export const adminStatusEnum = pgEnum("admin_status", ["ACTIVE", "DISABLED"]);
export const vendorUserRoleEnum = pgEnum("vendor_user_role", ["OWNER", "STAFF"]);
export const businessTypeEnum = pgEnum("business_type", ["PVT_LTD", "PARTNERSHIP", "SOLE_PROPRIETOR"]);
export const applicationStatusEnum = pgEnum("application_status", [
  "NEW",
  "REVIEWING",
  "DOCUMENTS_REQUESTED",
  "APPROVED",
  "REJECTED",
]);
