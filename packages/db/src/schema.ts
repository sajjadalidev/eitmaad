// Database schema from blueprint section 8.1.
// order_events and lookup_audit_log are partitioned by month. The partition clause
// is added by hand in the SQL migration, because Drizzle cannot express it.

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  actorTypeEnum,
  adminRoleEnum,
  adminStatusEnum,
  apiKeyStatusEnum,
  archivedReasonEnum,
  batchSourceTypeEnum,
  batchStatusEnum,
  cancellationStageEnum,
  customerStatusEnum,
  disputeCategoryEnum,
  disputeRaisedViaEnum,
  disputeStatusEnum,
  disputeVerificationEnum,
  eventResultEnum,
  faultClassEnum,
  identifierTypeEnum,
  ingestionModeEnum,
  installationStatusEnum,
  kycLevelEnum,
  orderStatusEnum,
  paymentMethodEnum,
  recommendedActionEnum,
  riskCheckModeEnum,
  riskTierEnum,
  scoringExcludedReasonEnum,
  signalTypeEnum,
  sourcePlatformEnum,
  storePlatformEnum,
  vendorCategoryEnum,
  vendorStatusEnum,
  vendorUserRoleEnum,
  applicationStatusEnum,
  businessTypeEnum,
} from "./enums";

export * from "./enums";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();
const id = () => uuid("id").primaryKey().defaultRandom();

// ---------- Operators ----------

export const adminUsers = pgTable("admin_users", {
  id: id(),
  authUserId: uuid("auth_user_id").unique(),
  name: text("name").notNull(),
  workEmail: text("work_email").notNull().unique(),
  role: adminRoleEnum("role").notNull(),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  status: adminStatusEnum("status").notNull().default("ACTIVE"),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
});

// ---------- Vendors ----------

export const vendors = pgTable("vendors", {
  id: id(),
  legalName: text("legal_name").notNull(),
  displayName: text("display_name").notNull(),
  category: vendorCategoryEnum("category").notNull(),
  status: vendorStatusEnum("status").notNull().default("PENDING_VERIFICATION"),
  kycLevel: kycLevelEnum("kyc_level"),
  kycReference: text("kyc_reference"),
  kycVerifiedAt: ts("kyc_verified_at"),
  kycReviewerNote: text("kyc_reviewer_note"),
  ownerCnicHash: text("owner_cnic_hash").unique(),
  kycDocumentChecksums: jsonb("kyc_document_checksums").$type<Record<string, string>>(),
  trustWeight: numeric("trust_weight", { precision: 3, scale: 2, mode: "number" }).notNull().default(0.5),
  faultClaimBias: numeric("fault_claim_bias", { precision: 3, scale: 2, mode: "number" }).notNull().default(1),
  biasComputedAt: ts("bias_computed_at"),
  ingestionMode: ingestionModeEnum("ingestion_mode").notNull().default("WEBHOOK"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  probationEndsAt: ts("probation_ends_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Sign-up requests from the public /join form (blueprint section 20.1). Reviewed by an admin before any vendor exists.
export const vendorApplications = pgTable(
  "vendor_applications",
  {
    id: id(),
    legalName: text("legal_name").notNull(),
    displayName: text("display_name").notNull(),
    category: vendorCategoryEnum("category").notNull(),
    businessType: businessTypeEnum("business_type").notNull(),
    platform: sourcePlatformEnum("platform").notNull(),
    storeUrl: text("store_url"),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    // HMAC of the sender's IP address, only for rate limiting.
    ipHash: text("ip_hash"),
    status: applicationStatusEnum("status").notNull().default("NEW"),
    reviewerNote: text("reviewer_note"),
    reviewedAt: ts("reviewed_at"),
    // Documents still asked from the applicant. The full history is in AUDIT_LOG.
    requestedDocuments: text("requested_documents").array().notNull().default(sql`'{}'::text[]`),
    // Set when the application is approved and the vendor is created.
    vendorId: uuid("vendor_id").references(() => vendors.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("vendor_applications_email_idx").on(t.contactEmail, t.createdAt),
    index("vendor_applications_ip_idx").on(t.ipHash, t.createdAt),
    index("vendor_applications_status_idx").on(t.status, t.createdAt),
  ],
);

// People who log in to the vendor portal (blueprint section 20.2).
export const vendorUsers = pgTable(
  "vendor_users",
  {
    id: id(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    authUserId: uuid("auth_user_id").unique(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: vendorUserRoleEnum("role").notNull().default("STAFF"),
    status: adminStatusEnum("status").notNull().default("ACTIVE"),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
  },
  (t) => [unique("vendor_users_vendor_email_uq").on(t.vendorId, t.email)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    scopes: text("scopes").array().notNull(),
    signingSecretRef: text("signing_secret_ref").notNull(),
    status: apiKeyStatusEnum("status").notNull().default("ACTIVE"),
    expiresAt: ts("expires_at"),
    lastUsedAt: ts("last_used_at"),
    createdAt: createdAt(),
    revokedAt: ts("revoked_at"),
  },
  // The prefix finds the key in one lookup, so it must be unique.
  (t) => [uniqueIndex("api_keys_prefix_uq").on(t.keyPrefix), index("api_keys_vendor_idx").on(t.vendorId)],
);

export const dataSharingAgreements = pgTable("data_sharing_agreements", {
  id: id(),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendors.id),
  agreementVersion: text("agreement_version").notNull(),
  signedByName: text("signed_by_name").notNull(),
  signedAt: ts("signed_at").notNull(),
  documentChecksum: text("document_checksum").notNull(),
});

export const storeInstallations = pgTable(
  "store_installations",
  {
    id: id(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    platform: storePlatformEnum("platform").notNull(),
    shopDomain: text("shop_domain").notNull(),
    accessTokenEncrypted: text("access_token_encrypted"),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id),
    statusMapping: jsonb("status_mapping").$type<Record<string, string>>().notNull().default({}),
    riskMode: riskCheckModeEnum("risk_mode").notNull().default("POST_ORDER"),
    consentNoticeVersion: text("consent_notice_version"),
    pluginVersion: text("plugin_version"),
    status: installationStatusEnum("status").notNull().default("ACTIVE"),
    installedAt: ts("installed_at").notNull().defaultNow(),
    uninstalledAt: ts("uninstalled_at"),
    lastReconciledAt: ts("last_reconciled_at"),
  },
  (t) => [unique("store_installations_platform_domain_uq").on(t.platform, t.shopDomain)],
);

export const vendorMetricsSnapshots = pgTable(
  "vendor_metrics_snapshots",
  {
    id: id(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    periodStart: ts("period_start").notNull(),
    periodEnd: ts("period_end").notNull(),
    failedOrders: integer("failed_orders").notNull(),
    userFaultShare: numeric("user_fault_share", { precision: 5, scale: 4, mode: "number" }),
    categoryBaseline: numeric("category_baseline", { precision: 5, scale: 4, mode: "number" }),
    biasFactor: numeric("bias_factor", { precision: 3, scale: 2, mode: "number" }).notNull(),
    trustWeight: numeric("trust_weight", { precision: 3, scale: 2, mode: "number" }).notNull(),
    disputeUpheldRate: numeric("dispute_upheld_rate", { precision: 5, scale: 4, mode: "number" }),
    lookupToReportRatio: numeric("lookup_to_report_ratio", { precision: 8, scale: 2, mode: "number" }),
    createdAt: createdAt(),
  },
  (t) => [unique("vendor_metrics_period_uq").on(t.vendorId, t.periodStart)],
);

// ---------- Customers ----------

export const customers = pgTable("customers", {
  id: id(),
  status: customerStatusEnum("status").notNull().default("ACTIVE"),
  epoch: integer("epoch").notNull().default(1),
  archivedReason: archivedReasonEnum("archived_reason"),
  lastActivityAt: ts("last_activity_at"),
  createdAt: createdAt(),
});

export const customerIdentifiers = pgTable(
  "customer_identifiers",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    identifierType: identifierTypeEnum("identifier_type").notNull().default("PHONE_HASH"),
    valueHash: text("value_hash").notNull(),
    keyVersion: smallint("key_version").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_identifiers_active_uq")
      .on(t.identifierType, t.valueHash, t.keyVersion)
      .where(sql`${t.isActive}`),
    index("customer_identifiers_customer_idx").on(t.customerId),
  ],
);

export const customerSignals = pgTable(
  "customer_signals",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    signalType: signalTypeEnum("signal_type").notNull(),
    valueHash: text("value_hash").notNull(),
    keyVersion: smallint("key_version").notNull(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    index("customer_signals_value_idx").on(t.signalType, t.valueHash),
    index("customer_signals_customer_idx").on(t.customerId),
  ],
);

// ---------- Scoring model ----------

export const scoreModelVersions = pgTable("score_model_versions", {
  version: integer("version").primaryKey(),
  params: jsonb("params").$type<Record<string, unknown>>().notNull(),
  notes: text("notes"),
  activatedAt: ts("activated_at"),
});

export const reasonCodes = pgTable("reason_codes", {
  code: text("code").primaryKey(),
  validStatuses: orderStatusEnum("valid_statuses").array().notNull(),
  derivedFault: faultClassEnum("derived_fault").notNull(),
  severityWeight: numeric("severity_weight", { precision: 4, scale: 2, mode: "number" }).notNull(),
  minDeliveryAttempts: smallint("min_delivery_attempts"),
  description: text("description").notNull(),
  active: boolean("active").notNull().default(true),
});

// ---------- Ingestion ----------

export const ingestionBatches = pgTable(
  "ingestion_batches",
  {
    id: id(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    sourceType: batchSourceTypeEnum("source_type").notNull(),
    isBackfill: boolean("is_backfill").notNull().default(false),
    approvedBy: uuid("approved_by").references(() => adminUsers.id),
    status: batchStatusEnum("status").notNull().default("PENDING"),
    fileChecksum: text("file_checksum"),
    totalRecords: integer("total_records").notNull().default(0),
    acceptedRecords: integer("accepted_records").notNull().default(0),
    duplicateRecords: integer("duplicate_records").notNull().default(0),
    rejectedRecords: integer("rejected_records").notNull().default(0),
    errorReportRef: text("error_report_ref"),
    scheduledFor: ts("scheduled_for"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("ingestion_batches_vendor_idx").on(t.vendorId, t.createdAt)],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    externalOrderRef: text("external_order_ref").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    checkoutRef: text("checkout_ref"),
    sourcePlatform: sourcePlatformEnum("source_platform").notNull().default("API"),
    storeInstallationId: uuid("store_installation_id").references(() => storeInstallations.id),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    orderValuePkr: numeric("order_value_pkr", { precision: 12, scale: 2, mode: "number" }).notNull(),
    status: orderStatusEnum("status").notNull(),
    reasonCode: text("reason_code").references(() => reasonCodes.code),
    derivedFault: faultClassEnum("derived_fault").notNull(),
    vendorClaimedFault: faultClassEnum("vendor_claimed_fault"),
    cancellationStage: cancellationStageEnum("cancellation_stage"),
    deliveryAttempts: smallint("delivery_attempts"),
    consentNoticeVersion: text("consent_notice_version").notNull(),
    isBackfill: boolean("is_backfill").notNull().default(false),
    isDisputed: boolean("is_disputed").notNull().default(false),
    scoringExcludedReason: scoringExcludedReasonEnum("scoring_excluded_reason"),
    occurredAt: ts("occurred_at").notNull(),
    lastTerminalAt: ts("last_terminal_at"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("orders_vendor_ref_uq").on(t.vendorId, t.externalOrderRef),
    index("orders_customer_time_idx").on(t.customerId, t.occurredAt),
    index("orders_vendor_time_idx").on(t.vendorId, t.occurredAt),
    index("orders_checkout_ref_idx").on(t.vendorId, t.checkoutRef),
  ],
);

// Partitioned by month on received_at (see migration). The primary key includes the partition column.
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").notNull().defaultRandom(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    orderId: uuid("order_id").references(() => orders.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    batchId: uuid("batch_id").references(() => ingestionBatches.id),
    externalOrderRef: text("external_order_ref").notNull(),
    eventId: text("event_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: orderStatusEnum("status"),
    reasonCode: text("reason_code"),
    isCorrection: boolean("is_correction").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: ts("occurred_at"),
    result: eventResultEnum("result").notNull(),
    rejectCode: text("reject_code"),
  },
  (t) => [
    primaryKey({ name: "order_events_pk", columns: [t.id, t.receivedAt] }),
    index("order_events_order_idx").on(t.orderId),
    index("order_events_batch_idx").on(t.batchId),
  ],
);

// Unpartitioned, so the idempotency key can be globally unique (blueprint section 3.4).
export const idempotencyKeys = pgTable("idempotency_keys", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  orderEventId: uuid("order_event_id").notNull(),
  receivedAt: ts("received_at").notNull(),
  payloadHash: text("payload_hash").notNull(),
});

// ---------- Scores ----------

export const vendorCustomerScores = pgTable(
  "vendor_customer_scores",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    totalOrders: integer("total_orders").notNull().default(0),
    delivered: integer("delivered").notNull().default(0),
    partiallyDelivered: integer("partially_delivered").notNull().default(0),
    userFault: integer("user_fault").notNull().default(0),
    vendorFault: integer("vendor_fault").notNull().default(0),
    logisticsFault: integer("logistics_fault").notNull().default(0),
    neutral: integer("neutral").notNull().default(0),
    unknown: integer("unknown").notNull().default(0),
    successRate: numeric("success_rate", { precision: 5, scale: 2, mode: "number" }).notNull(),
    scoreVersion: integer("score_version")
      .notNull()
      .references(() => scoreModelVersions.version),
    updatedAt: updatedAt(),
  },
  (t) => [unique("vendor_customer_scores_uq").on(t.customerId, t.vendorId)],
);

export const customerTrustProfiles = pgTable(
  "customer_trust_profiles",
  {
    customerId: uuid("customer_id")
      .primaryKey()
      .references(() => customers.id),
    totalNetworkOrders: integer("total_network_orders").notNull().default(0),
    scoreableOrders: integer("scoreable_orders").notNull().default(0),
    totalDelivered: integer("total_delivered").notNull().default(0),
    totalUserFault: integer("total_user_fault").notNull().default(0),
    distinctVendorCount: integer("distinct_vendor_count").notNull().default(0),
    negativeVendorCount: integer("negative_vendor_count").notNull().default(0),
    positiveEvidence: numeric("positive_evidence", { precision: 10, scale: 4, mode: "number" }).notNull(),
    negativeEvidence: numeric("negative_evidence", { precision: 10, scale: 4, mode: "number" }).notNull(),
    cumulativeScore: numeric("cumulative_score", { precision: 5, scale: 2, mode: "number" }).notNull(),
    riskTier: riskTierEnum("risk_tier").notNull(),
    hasRecentUserFault: boolean("has_recent_user_fault").notNull().default(false),
    hasOpenDispute: boolean("has_open_dispute").notNull().default(false),
    scoreVersion: integer("score_version")
      .notNull()
      .references(() => scoreModelVersions.version),
    scoreBreakdown: jsonb("score_breakdown").$type<Record<string, unknown>>().notNull(),
    lastOrderAt: ts("last_order_at"),
    lastCalculatedAt: ts("last_calculated_at").notNull(),
    nextDecayRecalcAt: ts("next_decay_recalc_at").notNull(),
  },
  (t) => [index("trust_profiles_next_recalc_idx").on(t.nextDecayRecalcAt)],
);

// ---------- Disputes ----------

export const disputes = pgTable(
  "disputes",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    orderId: uuid("order_id").references(() => orders.id),
    raisedVia: disputeRaisedViaEnum("raised_via").notNull(),
    customerVerifiedVia: disputeVerificationEnum("customer_verified_via"),
    category: disputeCategoryEnum("category").notNull(),
    status: disputeStatusEnum("status").notNull().default("OPEN"),
    vendorResponseDueAt: ts("vendor_response_due_at"),
    vendorEvidence: jsonb("vendor_evidence").$type<Record<string, unknown>>(),
    resolutionNote: text("resolution_note"),
    resolvedBy: uuid("resolved_by").references(() => adminUsers.id),
    createdAt: createdAt(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    index("disputes_customer_time_idx").on(t.customerId, t.createdAt),
    // At most one open dispute per order (blueprint section 9.5).
    uniqueIndex("disputes_one_open_per_order_uq")
      .on(t.orderId)
      .where(sql`${t.status} in ('OPEN', 'AWAITING_VENDOR')`),
  ],
);

// ---------- Audit ----------

// Partitioned by month on created_at (see migration).
export const lookupAuditLog = pgTable(
  "lookup_audit_log",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: createdAt(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id),
    customerId: uuid("customer_id"),
    phoneHash: text("phone_hash").notNull(),
    checkoutRef: text("checkout_ref"),
    orderValuePkr: numeric("order_value_pkr", { precision: 12, scale: 2, mode: "number" }),
    returnedTier: riskTierEnum("returned_tier").notNull(),
    returnedAction: recommendedActionEnum("returned_action").notNull(),
    mode: riskCheckModeEnum("mode").notNull(),
    sourcePlatform: sourcePlatformEnum("source_platform").notNull().default("API"),
    latencyMs: integer("latency_ms"),
  },
  (t) => [
    primaryKey({ name: "lookup_audit_log_pk", columns: [t.id, t.createdAt] }),
    index("lookup_audit_vendor_time_idx").on(t.vendorId, t.createdAt),
    index("lookup_audit_checkout_idx").on(t.vendorId, t.checkoutRef),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId)],
);
