import { describe, expect, it } from "vitest";
import { dailyLookupQuota, startOfPktDay, vendorCanUseApi } from "./quota";

describe("dailyLookupQuota", () => {
  it("follows section 9.4", () => {
    expect(dailyLookupQuota("ACTIVE", 100)).toBe(1_300);
    expect(dailyLookupQuota("PROBATION", 100)).toBe(500);
    expect(dailyLookupQuota("RESTRICTED", 100)).toBe(200);
    expect(dailyLookupQuota("PENDING_VERIFICATION", 100)).toBe(0);
    expect(dailyLookupQuota("TERMINATED", 100)).toBe(0);
  });
});

describe("startOfPktDay", () => {
  it("uses Pakistan midnight", () => {
    // 20:00 UTC on the 19th is 01:00 PKT on the 20th. PKT midnight is 19:00 UTC on the 19th.
    expect(startOfPktDay(new Date("2026-11-19T20:00:00Z")).toISOString()).toBe("2026-11-19T19:00:00.000Z");
    expect(startOfPktDay(new Date("2026-11-19T18:00:00Z")).toISOString()).toBe("2026-11-18T19:00:00.000Z");
  });
});

describe("vendorCanUseApi", () => {
  it("blocks pending and terminated vendors", () => {
    expect(vendorCanUseApi("ACTIVE")).toBe(true);
    expect(vendorCanUseApi("PROBATION")).toBe(true);
    expect(vendorCanUseApi("RESTRICTED")).toBe(true);
    expect(vendorCanUseApi("PENDING_VERIFICATION")).toBe(false);
    expect(vendorCanUseApi("TERMINATED")).toBe(false);
  });
});
