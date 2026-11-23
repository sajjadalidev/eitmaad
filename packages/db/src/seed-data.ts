// Reference data rows for REASON_CODES and SCORE_MODEL_VERSIONS.
// These only build rows. Writing them to a database needs explicit approval.

import { REASON_CODES, REASON_CODE_CATALOGUE, SCORE_MODEL_V1, type ReasonCode } from "@etimaad/core";

const DESCRIPTIONS: Record<ReasonCode, string> = {
  CUSTOMER_REFUSED_AT_DOOR: "Customer refused the order at the door",
  FAKE_OR_INVALID_ADDRESS: "Address was fake or could not be found",
  CUSTOMER_UNREACHABLE: "Customer could not be reached after delivery attempts",
  CUSTOMER_CANCELLED_POST_DISPATCH: "Customer cancelled after the order was dispatched",
  CUSTOMER_CANCELLED_PRE_DISPATCH: "Customer cancelled before dispatch",
  CUSTOMER_RETURN_CHANGE_OF_MIND: "Customer returned the order after delivery (change of mind)",
  PRODUCT_DEFECT: "Product was defective",
  WRONG_ITEM: "Wrong item was sent",
  QUALITY_ISSUE: "Quality problem with the order",
  OUT_OF_STOCK: "Merchant was out of stock",
  PREPARATION_DELAY: "Merchant delayed preparing the order",
  RIDER_ISSUE: "Problem with the rider or courier",
  UNSERVICEABLE_AREA: "Courier cannot deliver to this area",
  TRANSIT_DAMAGE: "Order was damaged in transit",
  DELIVERY_DELAY: "Courier delivery was delayed",
  OTHER: "Other reason (counts as unknown)",
};

export function reasonCodeRows() {
  return REASON_CODES.map((code) => {
    const def = REASON_CODE_CATALOGUE[code];
    return {
      code,
      validStatuses: [...def.validStatuses],
      derivedFault: def.derivedFault,
      severityWeight: def.severityWeight,
      minDeliveryAttempts: def.minDeliveryAttempts,
      description: DESCRIPTIONS[code],
      active: true,
    };
  });
}

export function scoreModelRow(activatedAt: Date) {
  return {
    version: SCORE_MODEL_V1.version,
    params: JSON.parse(JSON.stringify(SCORE_MODEL_V1)) as Record<string, unknown>,
    notes: "Scoring model v1 (blueprint section 6)",
    activatedAt,
  };
}
