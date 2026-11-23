import { describe, expect, it } from "vitest";
import { deriveFault, type FaultInput } from "./reason-codes";

const input = (over: Partial<FaultInput>): FaultInput => ({
  status: "FAILED_DELIVERY",
  reasonCode: null,
  deliveryAttempts: null,
  cancellationStage: null,
  ...over,
});

describe("deriveFault", () => {
  it("maps refusal at the door to USER with weight 1", () => {
    expect(deriveFault(input({ reasonCode: "CUSTOMER_REFUSED_AT_DOOR" }))).toEqual({
      ok: true,
      value: { fault: "USER", severityWeight: 1 },
    });
  });

  it("maps fake address to USER with weight 1.5", () => {
    const r = deriveFault(input({ reasonCode: "FAKE_OR_INVALID_ADDRESS" }));
    expect(r.ok && r.value).toEqual({ fault: "USER", severityWeight: 1.5 });
  });

  it("downgrades unreachable to UNKNOWN with fewer than 2 attempts", () => {
    const one = deriveFault(input({ reasonCode: "CUSTOMER_UNREACHABLE", deliveryAttempts: 1 }));
    const two = deriveFault(input({ reasonCode: "CUSTOMER_UNREACHABLE", deliveryAttempts: 2 }));
    expect(one.ok && one.value.fault).toBe("UNKNOWN");
    expect(two.ok && two.value).toEqual({ fault: "USER", severityWeight: 0.75 });
  });

  it("never penalises pre-dispatch cancellation or change of mind", () => {
    const pre = deriveFault(input({ status: "CANCELLED", reasonCode: "CUSTOMER_CANCELLED_PRE_DISPATCH" }));
    const ret = deriveFault(input({ status: "RETURNED_POST_DELIVERY", reasonCode: "CUSTOMER_RETURN_CHANGE_OF_MIND" }));
    expect(pre.ok && pre.value.fault).toBe("NEUTRAL");
    expect(ret.ok && ret.value.fault).toBe("NEUTRAL");
  });

  it("maps vendor and logistics reasons", () => {
    const v = deriveFault(input({ status: "CANCELLED", reasonCode: "OUT_OF_STOCK" }));
    const l = deriveFault(input({ reasonCode: "TRANSIT_DAMAGE" }));
    expect(v.ok && v.value.fault).toBe("VENDOR");
    expect(l.ok && l.value.fault).toBe("LOGISTICS");
  });

  it("maps OTHER to UNKNOWN", () => {
    const r = deriveFault(input({ reasonCode: "OTHER" }));
    expect(r.ok && r.value.fault).toBe("UNKNOWN");
  });

  it("gives NONE for delivered without a reason", () => {
    const r = deriveFault(input({ status: "DELIVERED" }));
    expect(r.ok && r.value.fault).toBe("NONE");
  });

  it("rejects mismatches", () => {
    const cases: Partial<FaultInput>[] = [
      { status: "DELIVERED", reasonCode: "OTHER" },
      { status: "FAILED_DELIVERY", reasonCode: null },
      { status: "FAILED_DELIVERY", reasonCode: "NOT_A_CODE" },
      { status: "CANCELLED", reasonCode: "CUSTOMER_REFUSED_AT_DOOR" },
      { status: "CANCELLED", reasonCode: "CUSTOMER_CANCELLED_POST_DISPATCH", cancellationStage: "PRE_DISPATCH" },
      { status: "CANCELLED", reasonCode: "CUSTOMER_CANCELLED_PRE_DISPATCH", cancellationStage: "POST_DISPATCH" },
    ];
    for (const c of cases) {
      expect(deriveFault(input(c))).toEqual({ ok: false, code: "REASON_STATUS_MISMATCH" });
    }
  });
});
