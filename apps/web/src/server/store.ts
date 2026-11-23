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

export interface EtimaadStore {
  findApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null>;
  resolveSigningSecret(ref: string): Promise<string | null>;
  getVendor(id: string): Promise<VendorRecord | null>;
  getVendors(ids: readonly string[]): Promise<Map<string, VendorRecord>>;

  findIdempotencyKey(key: string): Promise<{ payloadHash: string } | null>;
  findCustomerIdByPhoneHash(phoneHash: string, keyVersion: number): Promise<string | null>;
  createCustomer(phoneHash: string, keyVersion: number, now: Date): Promise<string>;
  findOrder(vendorId: string, externalOrderRef: string): Promise<OrderRecord | null>;
  // Saves the event, its idempotency key and the new order state as one unit.
  saveAcceptedEvent(event: OrderEventRecord, order: OrderRecord): Promise<void>;
  saveRejectedEvent(event: OrderEventRecord): Promise<void>;

  listCustomerOrders(customerId: string): Promise<OrderRecord[]>;
  saveScores(customerId: string, profile: TrustProfile, vendorScores: ReadonlyMap<string, VendorCustomerScore>): Promise<void>;
  getProfile(customerId: string): Promise<TrustProfile | null>;
  getVendorCustomerScore(customerId: string, vendorId: string): Promise<VendorCustomerScore | null>;

  countLookupsSince(vendorId: string, since: Date): Promise<number>;
  countOrdersReportedSince(vendorId: string, since: Date): Promise<number>;
  recordLookup(record: LookupRecord): Promise<void>;
}
