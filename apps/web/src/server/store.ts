// Storage interface used by the API services.
// The in-memory store is used for local development and tests.
// A Postgres (Drizzle) store comes next, once database access is approved.

import type {
  CancellationStage,
  FaultClass,
  OrderStatus,
  PaymentMethod,
  RecommendedAction,
  RiskCheckMode,
  RiskTier,
  SourcePlatform,
  TrustProfile,
  VendorCustomerScore,
  VendorStatus,
} from "@etimaad/core";
import type { PortalUser } from "./users";

export const API_SCOPES = ["events:write", "batches:write", "risk:read", "disputes:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiKeyRecord {
  id: string;
  vendorId: string;
  keyPrefix: string;
  keyHash: string;
  scopes: readonly ApiScope[];
  signingSecretRef: string;
  status: "ACTIVE" | "REVOKED";
  expiresAt: Date | null;
}

export interface VendorRecord {
  id: string;
  displayName: string;
  status: VendorStatus;
  trustWeight: number;
  faultClaimBias: number;
  settings: unknown;
}

export interface OrderRecord {
  id: string;
  vendorId: string;
  externalOrderRef: string;
  customerId: string;
  checkoutRef: string | null;
  sourcePlatform: SourcePlatform;
  paymentMethod: PaymentMethod;
  orderValuePkr: number;
  status: OrderStatus;
  reasonCode: string | null;
  derivedFault: FaultClass;
  vendorClaimedFault: FaultClass | null;
  cancellationStage: CancellationStage | null;
  deliveryAttempts: number | null;
  consentNoticeVersion: string;
  isBackfill: boolean;
  isDisputed: boolean;
  scoringExcludedReason: "DISPUTE_UPHELD" | null;
  occurredAt: Date;
  lastTerminalAt: Date | null;
  version: number;
}

export interface OrderEventRecord {
  id: string;
  receivedAt: Date;
  orderId: string | null;
  vendorId: string;
  externalOrderRef: string;
  eventId: string;
  idempotencyKey: string;
  payloadHash: string;
  status: OrderStatus | null;
  reasonCode: string | null;
  isCorrection: boolean;
  metadata: Record<string, unknown>;
  occurredAt: Date | null;
  result: "ACCEPTED" | "REJECTED";
  rejectCode: string | null;
}

export interface LookupRecord {
  id: string;
  createdAt: Date;
  vendorId: string;
  apiKeyId: string;
  customerId: string | null;
  phoneHash: string;
  checkoutRef: string | null;
  orderValuePkr: number;
  returnedTier: RiskTier;
  returnedAction: RecommendedAction;
  mode: RiskCheckMode;
  latencyMs: number;
}

export const VENDOR_CATEGORIES = ["food", "ecommerce", "retail"] as const;
export const BUSINESS_TYPES = ["PVT_LTD", "PARTNERSHIP", "SOLE_PROPRIETOR"] as const;
export const APPLICATION_STATUSES = ["NEW", "REVIEWING", "DOCUMENTS_REQUESTED", "APPROVED", "REJECTED"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface VendorApplicationRecord {
  id: string;
  legalName: string;
  displayName: string;
  category: (typeof VENDOR_CATEGORIES)[number];
  businessType: (typeof BUSINESS_TYPES)[number];
  platform: SourcePlatform;
  storeUrl: string | null;
  contactName: string;
  contactEmail: string;
  ipHash: string | null;
  status: (typeof APPLICATION_STATUSES)[number];
  createdAt: Date;
}

// An application with its review state (blueprint section 20.3).
export interface ApplicationDetail extends VendorApplicationRecord {
  reviewerNote: string | null;
  reviewedAt: Date | null;
  requestedDocuments: string[];
  vendorId: string | null;
}

export const REVIEW_ACTIONS = [
  "START_REVIEW",
  "REQUEST_DOCUMENTS",
  "DOCUMENTS_RECEIVED",
  "ADD_NOTE",
  "APPROVE",
  "REJECT",
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

// One step in an application's history, kept in AUDIT_LOG.
export interface ApplicationEvent {
  id: string;
  action: ReviewAction;
  actorId: string | null;
  actorName: string | null;
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
  note: string | null;
  documents: string[];
  createdAt: Date;
}

// A status change that is saved only if the application is still in fromStatus.
export interface ApplicationChange {
  applicationId: string;
  action: ReviewAction;
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
  note: string | null;
  requestedDocuments: string[];
  actorId: string;
  actorName: string;
  now: Date;
}

export interface ApprovedVendorInput {
  kycLevel: "FULL" | "LIGHT";
  trustWeight: number;
  probationEndsAt: Date;
}

export interface NewVendorCredentials {
  vendorId: string;
  keyPrefix: string;
  apiKey: string;
  signingSecret: string;
}

// Signals that help an admin spot repeat or fake applications.
export interface ApplicationMatches {
  otherApplicationsSameEmail: number;
  otherApplicationsSameNetwork: number;
  similarVendors: { id: string; displayName: string; status: VendorStatus }[];
}

export interface AdminOverview {
  applicationsWaiting: number;
  disputesForReview: number;
  activeVendors: number;
}

export interface VendorOverview {
  ordersReported30Days: number;
  lookupsToday: number;
  ordersMissingReason: number;
  openDisputes: number;
}

// One row per vendor in the admin console (blueprint section 20.3).
export interface VendorSummary {
  id: string;
  displayName: string;
  status: VendorStatus;
  trustWeight: number;
  orders30Days: number;
  userFaults30Days: number;
  lookups30Days: number;
  portalUsers: number;
}

// A vendor's own risk check, without the phone hash (blueprint section 20.2).
export interface VendorLookupRow {
  createdAt: Date;
  orderValuePkr: number;
  returnedTier: RiskTier;
  returnedAction: RecommendedAction;
  latencyMs: number;
}

export interface EtimaadStore {
  // Counts for the admin console overview (blueprint section 20.3).
  adminOverview(): Promise<AdminOverview>;
  // Counts for one vendor's portal overview (blueprint section 20.2).
  vendorOverview(vendorId: string, since30Days: Date, dayStart: Date): Promise<VendorOverview>;
  // All vendors with their activity since a time, by name.
  listVendorSummaries(since: Date): Promise<VendorSummary[]>;
  // One vendor's own orders and risk checks, newest first.
  listVendorOrders(vendorId: string, limit: number): Promise<OrderRecord[]>;
  listVendorLookups(vendorId: string, limit: number): Promise<VendorLookupRow[]>;

  // Maps a Supabase Auth user to an ADMIN_USERS or VENDOR_USERS row (admin wins if both exist).
  findPortalUserByAuthId(authUserId: string): Promise<PortalUser | null>;

  saveApplication(application: VendorApplicationRecord): Promise<void>;
  // Counts applications since a time, by email or by IP hash (for spam limits).
  countApplicationsSince(filter: { contactEmail?: string; ipHash?: string }, since: Date): Promise<number>;
  listApplications(limit: number): Promise<VendorApplicationRecord[]>;
  getApplication(id: string): Promise<ApplicationDetail | null>;
  listApplicationHistory(id: string): Promise<ApplicationEvent[]>;
  findApplicationMatches(application: VendorApplicationRecord): Promise<ApplicationMatches>;
  // Saves the change and its audit row together. STALE means someone else changed it first.
  reviewApplication(change: ApplicationChange): Promise<"SAVED" | "STALE">;
  // Like reviewApplication, and also creates the vendor with its first API key.
  approveApplication(
    change: ApplicationChange,
    vendor: ApprovedVendorInput,
  ): Promise<{ status: "SAVED"; credentials: NewVendorCredentials } | { status: "STALE" }>;

  findApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null>;
  resolveSigningSecret(ref: string): Promise<string | null>;
  getVendor(id: string): Promise<VendorRecord | null>;
  getVendors(ids: readonly string[]): Promise<Map<string, VendorRecord>>;

  findIdempotencyKey(key: string): Promise<{ payloadHash: string } | null>;
  findCustomerIdByPhoneHash(phoneHash: string, keyVersion: number): Promise<string | null>;
  createCustomer(phoneHash: string, keyVersion: number, now: Date): Promise<string>;
  findOrder(vendorId: string, externalOrderRef: string): Promise<OrderRecord | null>;
  // Saves the event, its idempotency key and the new order state as one unit.
  // Returns DUPLICATE_KEY (and saves nothing) if another request saved the same key first.
  saveAcceptedEvent(event: OrderEventRecord, order: OrderRecord): Promise<"SAVED" | "DUPLICATE_KEY">;
  saveRejectedEvent(event: OrderEventRecord): Promise<void>;

  // Runs fn while holding a per-customer lock, so two score rebuilds never overlap (blueprint section 6.7).
  withCustomerLock<T>(customerId: string, fn: (store: EtimaadStore) => Promise<T>): Promise<T>;

  listCustomerOrders(customerId: string): Promise<OrderRecord[]>;
  saveScores(customerId: string, profile: TrustProfile, vendorScores: ReadonlyMap<string, VendorCustomerScore>): Promise<void>;
  getProfile(customerId: string): Promise<TrustProfile | null>;
  getVendorCustomerScore(customerId: string, vendorId: string): Promise<VendorCustomerScore | null>;

  countLookupsSince(vendorId: string, since: Date): Promise<number>;
  countOrdersReportedSince(vendorId: string, since: Date): Promise<number>;
  recordLookup(record: LookupRecord): Promise<void>;
}
