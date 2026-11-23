import { describe, expect, it } from "vitest";
import { FAULT_CLASSES, ORDER_STATUSES, RISK_TIERS, SCORE_MODEL_VERSION } from "./index";

describe("domain enums", () => {
  it("match the blueprint", () => {
    expect(SCORE_MODEL_VERSION).toBe(1);
    expect(ORDER_STATUSES).toHaveLength(7);
    expect(FAULT_CLASSES).toContain("NEUTRAL");
    expect(RISK_TIERS).toContain("INSUFFICIENT_DATA");
  });
});
