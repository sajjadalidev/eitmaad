// Property tests from blueprint section 15.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { FaultClass, OrderStatus, PaymentMethod, VendorStatus } from "./domain";
import { computeTrustProfile, type DisputeState, type ScoringOrder, type ScoringVendor } from "./scoring";
import { DAY_MS, NOW } from "./test-fixtures";

interface Outcome {
  status: OrderStatus;
  reasonCode: string | null;
  fault: FaultClass;
}

const OUTCOMES: readonly Outcome[] = [
  { status: "DELIVERED", reasonCode: null, fault: "NONE" },
  { status: "PARTIALLY_DELIVERED", reasonCode: null, fault: "NONE" },
  { status: "RETURNED_POST_DELIVERY", reasonCode: "CUSTOMER_RETURN_CHANGE_OF_MIND", fault: "NEUTRAL" },
  { status: "FAILED_DELIVERY", reasonCode: "CUSTOMER_REFUSED_AT_DOOR", fault: "USER" },
  { status: "FAILED_DELIVERY", reasonCode: "FAKE_OR_INVALID_ADDRESS", fault: "USER" },
  { status: "CANCELLED", reasonCode: "CUSTOMER_CANCELLED_POST_DISPATCH", fault: "USER" },
  { status: "CANCELLED", reasonCode: "OUT_OF_STOCK", fault: "VENDOR" },
  { status: "FAILED_DELIVERY", reasonCode: "RIDER_ISSUE", fault: "LOGISTICS" },
  { status: "CANCELLED", reasonCode: "CUSTOMER_CANCELLED_PRE_DISPATCH", fault: "NEUTRAL" },
  { status: "FAILED_DELIVERY", reasonCode: "OTHER", fault: "UNKNOWN" },
];

const NON_USER_FAILURES = OUTCOMES.filter((o) => o.fault !== "USER" && o.fault !== "NONE" && o.status !== "RETURNED_POST_DELIVERY");

const vendorArb = fc.record({
  trustWeight: fc.constantFrom(0.2, 0.5, 0.7, 1),
  faultClaimBias: fc.constantFrom(0.5, 0.8, 1),
  status: fc.constantFrom<VendorStatus>("PROBATION", "ACTIVE", "RESTRICTED"),
});

const vendorsArb = fc
  .tuple(vendorArb, vendorArb, vendorArb)
  .map(([a, b, c]) => new Map<string, ScoringVendor>([["A", a], ["B", b], ["C", c]]));

interface RawOrder {
  vendorId: string;
  outcome: Outcome;
  ageDays: number;
  paymentMethod: PaymentMethod;
  orderValuePkr: number;
  isBackfill: boolean;
  dispute: DisputeState;
}

function orderArb(vendorIds: readonly string[], outcomes: readonly Outcome[] = OUTCOMES): fc.Arbitrary<RawOrder> {
  return fc.record({
    vendorId: fc.constantFrom(...vendorIds),
    outcome: fc.constantFrom(...outcomes),
    ageDays: fc.integer({ min: 0, max: 800 }),
    paymentMethod: fc.constantFrom<PaymentMethod>("COD", "PREPAID", "PARTIAL_ADVANCE"),
    orderValuePkr: fc.integer({ min: 100, max: 50_000 }),
    isBackfill: fc.boolean(),
    dispute: fc.constantFrom<DisputeState>("NONE", "OPEN", "UPHELD"),
  });
}

function toOrders(raw: readonly RawOrder[], prefix = "o"): ScoringOrder[] {
  return raw.map((r, i) => ({
    id: `${prefix}${String(i).padStart(5, "0")}`,
    vendorId: r.vendorId,
    occurredAt: new Date(NOW.getTime() - r.ageDays * DAY_MS),
    status: r.outcome.status,
    reasonCode: r.outcome.reasonCode,
    derivedFault: r.outcome.fault,
    paymentMethod: r.paymentMethod,
    orderValuePkr: r.orderValuePkr,
    consentNoticeVersion: "2026-10",
    isBackfill: r.isBackfill,
    dispute: r.dispute,
  }));
}

const ALL_VENDORS = ["A", "B", "C"] as const;

describe("scoring properties", () => {
  it("score is always between 0 and 100", () => {
    fc.assert(
      fc.property(vendorsArb, fc.array(orderArb(ALL_VENDORS), { maxLength: 60 }), (vendors, raw) => {
        const p = computeTrustProfile(toOrders(raw), vendors, NOW);
        expect(p.cumulativeScore).toBeGreaterThanOrEqual(0);
        expect(p.cumulativeScore).toBeLessThanOrEqual(100);
      }),
    );
  });

  it("input order does not change the result (replay-safe)", () => {
    fc.assert(
      fc.property(vendorsArb, fc.array(orderArb(ALL_VENDORS), { maxLength: 60 }), (vendors, raw) => {
        const orders = toOrders(raw);
        const a = computeTrustProfile(orders, vendors, NOW);
        const b = computeTrustProfile([...orders].reverse(), vendors, NOW);
        expect(b).toEqual(a);
      }),
    );
  });

  it("vendor, logistics, neutral and unknown failures never lower the score", () => {
    fc.assert(
      fc.property(
        vendorsArb,
        fc.array(orderArb(ALL_VENDORS), { maxLength: 40 }),
        fc.array(orderArb(ALL_VENDORS, NON_USER_FAILURES), { minLength: 1, maxLength: 20 }),
        (vendors, raw, extra) => {
          const base = toOrders(raw, "a");
          const before = computeTrustProfile(base, vendors, NOW);
          const after = computeTrustProfile([...base, ...toOrders(extra, "b")], vendors, NOW);
          expect(after.cumulativeScore).toBe(before.cumulativeScore);
        },
      ),
    );
  });

  it("negatives from a single vendor never produce HIGH", () => {
    const userOutcomes = OUTCOMES.filter((o) => o.fault === "USER");
    const positiveOutcomes = OUTCOMES.filter((o) => o.fault === "NONE");
    fc.assert(
      fc.property(
        vendorsArb,
        fc.array(orderArb(ALL_VENDORS, positiveOutcomes), { maxLength: 40 }),
        fc.array(orderArb(["A"], userOutcomes), { maxLength: 40 }),
        (vendors, positives, negatives) => {
          const orders = [...toOrders(positives, "p"), ...toOrders(negatives, "n")];
          expect(computeTrustProfile(orders, vendors, NOW).riskTier).not.toBe("HIGH");
        },
      ),
    );
  });

  it("waiting never resets a user fault before 24 months", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 729 }), (ageDays) => {
        const vendors = new Map<string, ScoringVendor>([["A", { trustWeight: 1, faultClaimBias: 1, status: "ACTIVE" }]]);
        const order = toOrders([
          {
            vendorId: "A",
            outcome: OUTCOMES[3]!,
            ageDays,
            paymentMethod: "COD",
            orderValuePkr: 3000,
            isBackfill: false,
            dispute: "NONE",
          },
        ]);
        expect(computeTrustProfile(order, vendors, NOW).totalUserFault).toBe(1);
      }),
    );
  });
});
