// Reason code catalogue and fault derivation (blueprint section 3.2).
// The vendor sends a reason code. The server derives the fault from it.

import type { CancellationStage, FaultClass, OrderStatus } from "./domain";
import { err, ok, type Result } from "./result";

export const REASON_CODES = [
  "CUSTOMER_REFUSED_AT_DOOR",
  "FAKE_OR_INVALID_ADDRESS",
  "CUSTOMER_UNREACHABLE",
  "CUSTOMER_CANCELLED_POST_DISPATCH",
  "CUSTOMER_CANCELLED_PRE_DISPATCH",
  "CUSTOMER_RETURN_CHANGE_OF_MIND",
  "PRODUCT_DEFECT",
  "WRONG_ITEM",
  "QUALITY_ISSUE",
  "OUT_OF_STOCK",
  "PREPARATION_DELAY",
  "RIDER_ISSUE",
  "UNSERVICEABLE_AREA",
  "TRANSIT_DAMAGE",
  "DELIVERY_DELAY",
  "OTHER",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export interface ReasonCodeDef {
  validStatuses: readonly OrderStatus[];
  derivedFault: FaultClass;
  severityWeight: number;
  minDeliveryAttempts: number | null;
}

const RETURN_OR_FAILED: readonly OrderStatus[] = ["RETURNED_POST_DELIVERY", "FAILED_DELIVERY"];
const FAILED_OR_CANCELLED: readonly OrderStatus[] = ["FAILED_DELIVERY", "CANCELLED"];

export const REASON_CODE_CATALOGUE: Record<ReasonCode, ReasonCodeDef> = {
  CUSTOMER_REFUSED_AT_DOOR: { validStatuses: ["FAILED_DELIVERY"], derivedFault: "USER", severityWeight: 1, minDeliveryAttempts: null },
  FAKE_OR_INVALID_ADDRESS: { validStatuses: ["FAILED_DELIVERY"], derivedFault: "USER", severityWeight: 1.5, minDeliveryAttempts: null },
  CUSTOMER_UNREACHABLE: { validStatuses: ["FAILED_DELIVERY"], derivedFault: "USER", severityWeight: 0.75, minDeliveryAttempts: 2 },
  CUSTOMER_CANCELLED_POST_DISPATCH: { validStatuses: ["CANCELLED"], derivedFault: "USER", severityWeight: 0.5, minDeliveryAttempts: null },
  CUSTOMER_CANCELLED_PRE_DISPATCH: { validStatuses: ["CANCELLED"], derivedFault: "NEUTRAL", severityWeight: 0, minDeliveryAttempts: null },
  CUSTOMER_RETURN_CHANGE_OF_MIND: { validStatuses: ["RETURNED_POST_DELIVERY"], derivedFault: "NEUTRAL", severityWeight: 0, minDeliveryAttempts: null },
  PRODUCT_DEFECT: { validStatuses: RETURN_OR_FAILED, derivedFault: "VENDOR", severityWeight: 0, minDeliveryAttempts: null },
  WRONG_ITEM: { validStatuses: RETURN_OR_FAILED, derivedFault: "VENDOR", severityWeight: 0, minDeliveryAttempts: null },
  QUALITY_ISSUE: { validStatuses: RETURN_OR_FAILED, derivedFault: "VENDOR", severityWeight: 0, minDeliveryAttempts: null },
  OUT_OF_STOCK: { validStatuses: ["CANCELLED"], derivedFault: "VENDOR", severityWeight: 0, minDeliveryAttempts: null },
  PREPARATION_DELAY: { validStatuses: ["CANCELLED"], derivedFault: "VENDOR", severityWeight: 0, minDeliveryAttempts: null },
  RIDER_ISSUE: { validStatuses: FAILED_OR_CANCELLED, derivedFault: "LOGISTICS", severityWeight: 0, minDeliveryAttempts: null },
  UNSERVICEABLE_AREA: { validStatuses: FAILED_OR_CANCELLED, derivedFault: "LOGISTICS", severityWeight: 0, minDeliveryAttempts: null },
  TRANSIT_DAMAGE: { validStatuses: FAILED_OR_CANCELLED, derivedFault: "LOGISTICS", severityWeight: 0, minDeliveryAttempts: null },
  DELIVERY_DELAY: { validStatuses: FAILED_OR_CANCELLED, derivedFault: "LOGISTICS", severityWeight: 0, minDeliveryAttempts: null },
  OTHER: {
    validStatuses: ["FAILED_DELIVERY", "CANCELLED", "RETURNED_POST_DELIVERY"],
    derivedFault: "UNKNOWN",
    severityWeight: 0,
    minDeliveryAttempts: null,
  },
};

export function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as readonly string[]).includes(value);
}

export interface FaultInput {
  status: OrderStatus;
  reasonCode: string | null;
  deliveryAttempts: number | null;
  cancellationStage: CancellationStage | null;
}

export interface DerivedFault {
  fault: FaultClass;
  severityWeight: number;
}

const FAILURE_STATUSES: readonly OrderStatus[] = ["FAILED_DELIVERY", "CANCELLED", "RETURNED_POST_DELIVERY"];

export function deriveFault(input: FaultInput): Result<DerivedFault, "REASON_STATUS_MISMATCH"> {
  const { status, reasonCode, deliveryAttempts, cancellationStage } = input;

  // Non-failure statuses must not carry a reason code.
  if (!FAILURE_STATUSES.includes(status)) {
    if (reasonCode !== null) return err("REASON_STATUS_MISMATCH");
    return ok({ fault: "NONE", severityWeight: 0 });
  }

  // Failure statuses need a known reason code that is valid for the status.
  if (reasonCode === null || !isReasonCode(reasonCode)) return err("REASON_STATUS_MISMATCH");
  const def = REASON_CODE_CATALOGUE[reasonCode];
  if (!def.validStatuses.includes(status)) return err("REASON_STATUS_MISMATCH");

  if (reasonCode === "CUSTOMER_CANCELLED_POST_DISPATCH" && cancellationStage !== null && cancellationStage !== "POST_DISPATCH") {
    return err("REASON_STATUS_MISMATCH");
  }
  if (reasonCode === "CUSTOMER_CANCELLED_PRE_DISPATCH" && cancellationStage === "POST_DISPATCH") {
    return err("REASON_STATUS_MISMATCH");
  }

  // Not enough delivery attempts: the claim cannot be trusted, so no penalty.
  if (def.minDeliveryAttempts !== null && (deliveryAttempts ?? 0) < def.minDeliveryAttempts) {
    return ok({ fault: "UNKNOWN", severityWeight: 0 });
  }

  return ok({ fault: def.derivedFault, severityWeight: def.severityWeight });
}
