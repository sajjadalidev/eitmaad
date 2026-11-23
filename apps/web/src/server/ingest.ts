// Order event ingestion (blueprint sections 3, 4, 9.2).

import { randomUUID } from "node:crypto";
import {
  checkConsentNotice,
  checkOccurredAtWindow,
  checkOrderRefHasNoPii,
  checkTransition,
  deriveFault,
  hashPhone,
  idempotencyKey,
  isTerminal,
  normalizePkMobile,
  payloadHash,
  sanitizeMetadata,
  type SourcePlatform,
} from "@etimaad/core";
import type { ApiRuntime } from "./config";
import { ApiError } from "./http";
import { recomputeCustomer } from "./recompute";
import { eventsBodySchema, MAX_EVENTS_PER_REQUEST, orderEventSchema } from "./schemas";
import type { OrderEventRecord, OrderRecord, VendorRecord } from "./store";

export interface ServiceContext extends ApiRuntime {
  now: Date;
}

export interface EventResult {
  event_id: string | null;
  result: "ACCEPTED" | "DUPLICATE" | "REJECTED";
  code?: string;
  warnings?: string[];
}

interface OneResult {
  result: EventResult;
  customerId?: string;
}

export async function ingestEvents(
  ctx: ServiceContext,
  vendor: VendorRecord,
  body: unknown,
  source: SourcePlatform = "API",
): Promise<{ status: number; body: { results: EventResult[] } }> {
  const parsed = eventsBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", `Body needs "events" with 1 to ${MAX_EVENTS_PER_REQUEST} items.`);
  }

  // Events are handled in order, so two events for the same order in one request work.
  const results: EventResult[] = [];
  const touchedCustomers = new Set<string>();
  for (const raw of parsed.data.events) {
    const one = await ingestOne(ctx, vendor, raw, source);
    results.push(one.result);
    if (one.customerId) touchedCustomers.add(one.customerId);
  }

  for (const customerId of touchedCustomers) await recomputeCustomer(ctx.store, customerId, ctx.now);

  const accepted = results.filter((r) => r.result !== "REJECTED").length;
  const status = accepted === results.length ? 200 : accepted === 0 ? 422 : 207;
  return { status, body: { results } };
}

async function ingestOne(ctx: ServiceContext, vendor: VendorRecord, raw: unknown, source: SourcePlatform): Promise<OneResult> {
  const { store, now } = ctx;
  const rawObject = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const eventId = typeof rawObject.event_id === "string" ? rawObject.event_id : null;
  let refForLog = typeof rawObject.external_order_ref === "string" ? rawObject.external_order_ref : "";

  const reject = async (code: string): Promise<OneResult> => {
    await store.saveRejectedEvent({
      id: randomUUID(),
      receivedAt: now,
      orderId: null,
      vendorId: vendor.id,
      externalOrderRef: refForLog,
      eventId: eventId ?? "",
      idempotencyKey: "",
      payloadHash: payloadHash(raw),
      status: null,
      reasonCode: null,
      isCorrection: false,
      metadata: {},
      occurredAt: null,
      result: "REJECTED",
      rejectCode: code,
    });
    return { result: { event_id: eventId, result: "REJECTED", code } };
  };

  const parsed = orderEventSchema.safeParse(raw);
  if (!parsed.success) return reject("VALIDATION_ERROR");
  const e = parsed.data;

  // Never store a reference that contains a phone number.
  const refCheck = checkOrderRefHasNoPii(e.external_order_ref);
  const checkoutCheck = e.checkout_ref ? checkOrderRefHasNoPii(e.checkout_ref) : refCheck;
  if (!refCheck.ok || !checkoutCheck.ok) {
    refForLog = "[redacted]";
    return reject("PII_IN_REFERENCE");
  }

  const key = idempotencyKey(vendor.id, e.external_order_ref, e.event_id);
  const hash = payloadHash(raw);
  const seen = await store.findIdempotencyKey(key);
  if (seen) {
    if (seen.payloadHash === hash) return { result: { event_id: e.event_id, result: "DUPLICATE" } };
    return reject("IDEMPOTENCY_CONFLICT");
  }

  const phone = normalizePkMobile(e.phone);
  if (!phone.ok) return reject(phone.code);

  const consent = checkConsentNotice(e.consent_notice_version);
  if (!consent.ok) return reject(consent.code);

  const occurredAt = new Date(e.occurred_at);
  const window = checkOccurredAtWindow(occurredAt, now, false);
  if (!window.ok) return reject(window.code);

  const fault = deriveFault({
    status: e.status,
    reasonCode: e.reason_code ?? null,
    deliveryAttempts: e.delivery_attempts ?? null,
    cancellationStage: e.cancellation_stage ?? null,
  });
  if (!fault.ok) return reject(fault.code);

  const existing = await store.findOrder(vendor.id, e.external_order_ref);
  const transition = checkTransition({
    current: existing ? { status: existing.status, lastTerminalAt: existing.lastTerminalAt } : null,
    next: e.status,
    isCorrection: e.is_correction ?? false,
    now,
  });
  if (!transition.ok) return reject(transition.code);

  const phoneHash = hashPhone(phone.value, ctx.pepper);
  const knownCustomer = await store.findCustomerIdByPhoneHash(phoneHash, ctx.keyVersion);
  if (existing && knownCustomer !== existing.customerId) return reject("VALIDATION_ERROR");
  const customerId = existing?.customerId ?? knownCustomer ?? (await store.createCustomer(phoneHash, ctx.keyVersion, now));

  const { metadata, droppedKeys } = sanitizeMetadata(e.metadata ?? null);

  const order: OrderRecord = {
    id: existing?.id ?? randomUUID(),
    vendorId: vendor.id,
    externalOrderRef: e.external_order_ref,
    customerId,
    checkoutRef: e.checkout_ref ?? existing?.checkoutRef ?? null,
    sourcePlatform: existing?.sourcePlatform ?? source,
    paymentMethod: e.payment_method,
    orderValuePkr: e.order_value_pkr,
    status: e.status,
    reasonCode: e.reason_code ?? null,
    derivedFault: fault.value.fault,
    vendorClaimedFault: e.vendor_claimed_fault ?? null,
    cancellationStage: e.cancellation_stage ?? null,
    deliveryAttempts: e.delivery_attempts ?? existing?.deliveryAttempts ?? null,
    consentNoticeVersion: e.consent_notice_version ?? "",
    isBackfill: false,
    isDisputed: existing?.isDisputed ?? false,
    scoringExcludedReason: existing?.scoringExcludedReason ?? null,
    occurredAt,
    lastTerminalAt: isTerminal(e.status) ? occurredAt : (existing?.lastTerminalAt ?? null),
    version: (existing?.version ?? 0) + 1,
  };

  const event: OrderEventRecord = {
    id: randomUUID(),
    receivedAt: now,
    orderId: order.id,
    vendorId: vendor.id,
    externalOrderRef: e.external_order_ref,
    eventId: e.event_id,
    idempotencyKey: key,
    payloadHash: hash,
    status: e.status,
    reasonCode: e.reason_code ?? null,
    isCorrection: e.is_correction ?? false,
    metadata: { ...metadata },
    occurredAt,
    result: "ACCEPTED",
    rejectCode: null,
  };

  // Another request may have saved the same event between our check and this save.
  if ((await store.saveAcceptedEvent(event, order)) === "DUPLICATE_KEY") {
    const winner = await store.findIdempotencyKey(key);
    if (winner?.payloadHash === hash) return { result: { event_id: e.event_id, result: "DUPLICATE" } };
    return reject("IDEMPOTENCY_CONFLICT");
  }

  const result: EventResult = { event_id: e.event_id, result: "ACCEPTED" };
  if (droppedKeys.length > 0) result.warnings = [`METADATA_KEYS_DROPPED: ${droppedKeys.join(", ")}`];
  return { result, customerId };
}
