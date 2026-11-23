// Request body schemas (blueprint sections 9.2 and 9.3).

import {
  CANCELLATION_STAGES,
  FAULT_CLASSES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  RISK_CHECK_MODES,
} from "@etimaad/core";
import { z } from "zod";

export const MAX_EVENTS_PER_REQUEST = 100;

export const eventsBodySchema = z.object({
  events: z.array(z.unknown()).min(1).max(MAX_EVENTS_PER_REQUEST),
});

export const orderEventSchema = z.object({
  event_id: z.string().trim().min(1).max(200),
  external_order_ref: z.string().trim().min(1).max(200),
  checkout_ref: z.string().trim().max(200).nullish(),
  phone: z.string().min(1).max(40),
  // Accepted for future use (blueprint section 4.2). Not stored yet.
  email: z.string().max(320).nullish(),
  address: z.unknown().optional(),
  payment_method: z.enum(PAYMENT_METHODS),
  order_value_pkr: z.number().nonnegative().max(10_000_000),
  status: z.enum(ORDER_STATUSES),
  reason_code: z.string().max(64).nullish(),
  vendor_claimed_fault: z.enum(FAULT_CLASSES).nullish(),
  cancellation_stage: z.enum(CANCELLATION_STAGES).nullish(),
  delivery_attempts: z.number().int().min(0).max(20).nullish(),
  is_correction: z.boolean().optional(),
  consent_notice_version: z.string().max(64).nullish(),
  occurred_at: z.iso.datetime({ offset: true }),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export type OrderEventInput = z.infer<typeof orderEventSchema>;

export const riskCheckSchema = z.object({
  phone: z.string().min(1).max(40),
  order_value_pkr: z.number().nonnegative().max(10_000_000),
  payment_method_requested: z.enum(PAYMENT_METHODS).optional(),
  checkout_ref: z.string().trim().max(200).nullish(),
  mode: z.enum(RISK_CHECK_MODES).optional(),
});
