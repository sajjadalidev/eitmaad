import { describe, expect, it } from "vitest";
import { PRE_NOTICE_BACKFILL } from "./domain";
import { SCORE_MODEL_V1 } from "./model";
import {
  computeTrustProfile,
  computeVendorCustomerScore,
  effectiveOrderCount,
  recencyWeight,
  valueFactor,
  type ScoringVendor,
} from "./scoring";
import { DAY_MS, NOW, NO_DAILY_CAP, VENDORS, daysAgo, delivered, many, refused } from "./test-fixtures";

describe("building blocks", () => {
  it("recency has a 90 day half-life and a 0.25 floor", () => {
    expect(recencyWeight(0)).toBe(1);
    expect(recencyWeight(90)).toBeCloseTo(0.5);
    expect(recencyWeight(365)).toBe(0.25);
  });

  it("value bands follow section 6.1", () => {
    expect(valueFactor(1000)).toBe(0.75);
    expect(valueFactor(1500)).toBe(1);
    expect(valueFactor(5000)).toBe(1);
    expect(valueFactor(5001)).toBe(1.25);
    expect(valueFactor(15000)).toBe(1.25);
    expect(valueFactor(15001)).toBe(1.5);
  });

  it("per-vendor cap gives a quarter credit after 10 orders", () => {
    expect(effectiveOrderCount(5)).toBe(5);
    expect(effectiveOrderCount(15)).toBe(11.25);
  });
});

describe("golden examples (section 6.3)", () => {
  it("15 deliveries across 3 vendors and 2 refusals from 2 vendors gives 86.36 LOW", () => {
    const orders = [
      ...many(5, () => delivered("A")),
      ...many(5, () => delivered("B")),
      ...many(5, () => delivered("C")),
      refused("A"),
      refused("B"),
    ];
    const p = computeTrustProfile(orders, VENDORS, NOW, NO_DAILY_CAP);
    expect(p.cumulativeScore).toBe(86.36);
    expect(p.riskTier).toBe("LOW");
    expect(p.breakdown.rules_fired).toContain("CORROBORATED_NEGATIVE");
  });

  it("the same deliveries from one vendor gives 83.56 MEDIUM", () => {
    const orders = [...many(15, () => delivered("A")), refused("A"), refused("A")];
    const p = computeTrustProfile(orders, VENDORS, NOW, NO_DAILY_CAP);
    expect(p.positiveEvidence).toBeCloseTo(11.25);
    expect(p.cumulativeScore).toBe(83.56);
    expect(p.riskTier).toBe("MEDIUM");
  });
});

describe("decay floor (section 6.1)", () => {
  it("10 deliveries one year ago gives 86.67", () => {
    const orders = many(10, () => delivered("A", { occurredAt: daysAgo(365) }));
    const p = computeTrustProfile(orders, VENDORS, NOW, NO_DAILY_CAP);
    expect(p.positiveEvidence).toBeCloseTo(2.5);
    expect(p.cumulativeScore).toBe(86.67);
    expect(p.riskTier).toBe("LOW");
  });

  it("3 refusals one year ago gives 69.57 but data is not sufficient", () => {
    const orders = many(3, () => refused("A", { occurredAt: daysAgo(365) }));
    const p = computeTrustProfile(orders, VENDORS, NOW, NO_DAILY_CAP);
    expect(p.negativeEvidence).toBeCloseTo(0.75);
    expect(p.cumulativeScore).toBe(69.57);
    expect(p.riskTier).toBe("INSUFFICIENT_DATA");
    expect(p.hasRecentUserFault).toBe(false);
  });

  it("orders older than 24 months are ignored", () => {
    const p = computeTrustProfile([refused("A", { occurredAt: daysAgo(731) })], VENDORS, NOW);
    expect(p.totalNetworkOrders).toBe(0);
  });
});

describe("risk tiers (section 6.4)", () => {
  it("brand new customer is INSUFFICIENT_DATA", () => {
    const p = computeTrustProfile([], VENDORS, NOW);
    expect(p.riskTier).toBe("INSUFFICIENT_DATA");
    expect(p.cumulativeScore).toBe(80);
  });

  it("2 recent refusals from 2 vendors with thin data is HIGH", () => {
    const p = computeTrustProfile([refused("A"), refused("B")], VENDORS, NOW);
    expect(p.riskTier).toBe("HIGH");
    expect(p.breakdown.rules_fired).toContain("THIN_DATA_MULTI_VENDOR");
  });

  it("2 recent refusals from 1 vendor with thin data is MEDIUM", () => {
    const p = computeTrustProfile([refused("A"), refused("A", { occurredAt: daysAgo(1) })], VENDORS, NOW);
    expect(p.riskTier).toBe("MEDIUM");
    expect(p.breakdown.rules_fired).toContain("THIN_DATA_SINGLE_VENDOR");
  });

  it("1 recent refusal stays INSUFFICIENT_DATA with the recent fault flag", () => {
    const p = computeTrustProfile([refused("A")], VENDORS, NOW);
    expect(p.riskTier).toBe("INSUFFICIENT_DATA");
    expect(p.hasRecentUserFault).toBe(true);
  });

  it("fake addresses from 2 vendors are HIGH even with a good record", () => {
    const fake = { reasonCode: "FAKE_OR_INVALID_ADDRESS" };
    const orders = [...many(20, () => delivered("A")), refused("B", fake), refused("C", fake)];
    const p = computeTrustProfile(orders, VENDORS, NOW, NO_DAILY_CAP);
    expect(p.riskTier).toBe("HIGH");
    expect(p.breakdown.rules_fired).toContain("HARD_RULE_FAKE_ADDRESS");
  });

  it("negatives from a single vendor are capped at MEDIUM", () => {
    const orders = [...many(3, () => delivered("A")), ...many(10, () => refused("A"))];
    const p = computeTrustProfile(orders, VENDORS, NOW, NO_DAILY_CAP);
    expect(p.cumulativeScore).toBeLessThan(65);
    expect(p.riskTier).toBe("MEDIUM");
    expect(p.breakdown.rules_fired).toContain("CORROBORATION_CAP");
  });

  it("thin data uses weighted evidence, not only the count", () => {
    const orders = many(3, () => delivered("A", { occurredAt: daysAgo(400) }));
    const p = computeTrustProfile(orders, VENDORS, NOW);
    expect(p.scoreableOrders).toBe(3);
    expect(p.riskTier).toBe("INSUFFICIENT_DATA");
  });
});

describe("exclusions and adjustments", () => {
  const base = many(10, () => delivered("A"));

  it("open dispute counts a refusal at 50%", () => {
    const open = computeTrustProfile([...base, refused("B", { dispute: "OPEN" })], VENDORS, NOW, NO_DAILY_CAP);
    expect(open.negativeEvidence).toBeCloseTo(0.5);
    expect(open.hasOpenDispute).toBe(true);
  });

  it("upheld dispute removes the refusal", () => {
    const upheld = computeTrustProfile([...base, refused("B", { dispute: "UPHELD" })], VENDORS, NOW, NO_DAILY_CAP);
    expect(upheld.negativeEvidence).toBe(0);
    expect(upheld.breakdown.excluded.disputed).toBe(1);
  });

  it("vendor and logistics faults never change the score", () => {
    const before = computeTrustProfile(base, VENDORS, NOW, NO_DAILY_CAP);
    const after = computeTrustProfile(
      [
        ...base,
        refused("B", { reasonCode: "OUT_OF_STOCK", derivedFault: "VENDOR", status: "CANCELLED" }),
        refused("C", { reasonCode: "RIDER_ISSUE", derivedFault: "LOGISTICS" }),
      ],
      VENDORS,
      NOW,
      NO_DAILY_CAP,
    );
    expect(after.cumulativeScore).toBe(before.cumulativeScore);
    expect(after.breakdown.excluded.vendor_fault).toBe(1);
    expect(after.breakdown.excluded.logistics_fault).toBe(1);
  });

  it("post-delivery return keeps the positive credit", () => {
    const p = computeTrustProfile(
      [delivered("A", { status: "RETURNED_POST_DELIVERY", reasonCode: "PRODUCT_DEFECT", derivedFault: "VENDOR" })],
      VENDORS,
      NOW,
    );
    expect(p.positiveEvidence).toBe(1);
  });

  it("prepaid delivery counts at 0.75", () => {
    const p = computeTrustProfile([delivered("A", { paymentMethod: "PREPAID" })], VENDORS, NOW);
    expect(p.positiveEvidence).toBe(0.75);
  });

  it("pre-notice backfill is kept out of the network score", () => {
    const p = computeTrustProfile([refused("A", { consentNoticeVersion: PRE_NOTICE_BACKFILL })], VENDORS, NOW);
    expect(p.totalNetworkOrders).toBe(0);
    expect(p.breakdown.excluded.pre_notice_backfill).toBe(1);
  });

  it("backfill from a probation vendor counts at half weight", () => {
    const vendors = new Map<string, ScoringVendor>([["P", { trustWeight: 0.5, faultClaimBias: 1, status: "PROBATION" }]]);
    const p = computeTrustProfile([delivered("P", { isBackfill: true })], vendors, NOW);
    expect(p.positiveEvidence).toBe(0.25);
  });

  it("vendor bias reduces negative evidence", () => {
    const vendors = new Map<string, ScoringVendor>([["A", { trustWeight: 1, faultClaimBias: 0.6, status: "ACTIVE" }]]);
    const p = computeTrustProfile([refused("A")], vendors, NOW);
    expect(p.negativeEvidence).toBeCloseTo(0.6);
  });

  it("daily cap counts only 3 scoreable orders per vendor per PKT day", () => {
    const p = computeTrustProfile(many(5, () => delivered("A")), VENDORS, NOW);
    expect(p.scoreableOrders).toBe(3);
    expect(p.breakdown.excluded.daily_cap).toBe(2);
  });

  it("daily cap uses Pakistan time for the day boundary", () => {
    // 18:30 UTC is 23:30 PKT on the 19th. 19:30 UTC is 00:30 PKT on the 20th.
    const lateNight = many(3, () => delivered("A", { occurredAt: new Date("2026-11-19T18:30:00Z") }));
    const nextDay = many(3, () => delivered("A", { occurredAt: new Date("2026-11-19T19:30:00Z") }));
    const p = computeTrustProfile([...lateNight, ...nextDay], VENDORS, NOW);
    expect(p.scoreableOrders).toBe(6);
  });

  it("unknown vendor is a programming error", () => {
    expect(() => computeTrustProfile([delivered("Z")], VENDORS, NOW)).toThrow();
  });

  it("next recalculation is within 7 days", () => {
    const p = computeTrustProfile([refused("A", { occurredAt: daysAgo(179) })], VENDORS, NOW);
    expect(p.nextDecayRecalcAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(p.nextDecayRecalcAt.getTime()).toBe(daysAgo(179).getTime() + 180 * DAY_MS);
  });

  it("breakdown carries the model version and parameters", () => {
    const p = computeTrustProfile([], VENDORS, NOW);
    expect(p.breakdown.model_version).toBe(SCORE_MODEL_V1.version);
    expect(p.breakdown.alpha).toBe(4);
    expect(p.breakdown.calculated_at).toBe(NOW.toISOString());
  });
});

describe("per-vendor score (section 6.5)", () => {
  it("uses the same prior and ignores vendor faults", () => {
    const orders = [
      ...many(15, () => delivered("A")),
      ...many(2, () => refused("A")),
      ...many(3, () => refused("A", { reasonCode: "WRONG_ITEM", derivedFault: "VENDOR" })),
    ];
    const s = computeVendorCustomerScore(orders, NOW);
    expect(s.totalOrders).toBe(20);
    expect(s.delivered).toBe(15);
    expect(s.userFault).toBe(2);
    expect(s.vendorFault).toBe(3);
    expect(s.successRate).toBe(86.36);
  });

  it("keeps pre-notice backfill for the vendor's own view", () => {
    const s = computeVendorCustomerScore([delivered("A", { consentNoticeVersion: PRE_NOTICE_BACKFILL })], NOW);
    expect(s.delivered).toBe(1);
  });
});
