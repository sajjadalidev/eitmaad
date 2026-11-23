import { describe, expect, it } from "vitest";
import { DEFAULT_VENDOR_SETTINGS, parseVendorSettings, resolveAction, type ActionInput } from "./actions";

const input = (over: Partial<ActionInput>): ActionInput => ({
  tier: "LOW",
  orderValuePkr: 3000,
  hasRecentUserFault: false,
  ownUserFaults: 0,
  settings: DEFAULT_VENDOR_SETTINGS,
  ...over,
});

describe("resolveAction", () => {
  it("maps tiers with default settings", () => {
    expect(resolveAction(input({ tier: "LOW" })).action).toBe("ALLOW_COD");
    expect(resolveAction(input({ tier: "MEDIUM" })).action).toBe("REQUIRE_CONFIRMATION_CALL");
    expect(resolveAction(input({ tier: "HIGH" })).action).toBe("PREPAID_ONLY");
    expect(resolveAction(input({ tier: "INSUFFICIENT_DATA" })).action).toBe("ALLOW_COD");
  });

  it("applies the high value override above the threshold", () => {
    const r = resolveAction(input({ tier: "MEDIUM", orderValuePkr: 18000 }));
    expect(r).toEqual({ action: "REQUIRE_PARTIAL_ADVANCE", reasons: ["HIGH_ORDER_VALUE"] });
    expect(resolveAction(input({ tier: "MEDIUM", orderValuePkr: 15000 })).action).toBe("REQUIRE_CONFIRMATION_CALL");
  });

  it("asks for a call when thin data has a recent fault", () => {
    const r = resolveAction(input({ tier: "INSUFFICIENT_DATA", hasRecentUserFault: true }));
    expect(r).toEqual({ action: "REQUIRE_CONFIRMATION_CALL", reasons: ["RECENT_USER_FAULT"] });
  });

  it("applies the vendor's own history rule", () => {
    const r = resolveAction(input({ tier: "MEDIUM", ownUserFaults: 2 }));
    expect(r).toEqual({ action: "PREPAID_ONLY", reasons: ["OWN_HISTORY_RULE"] });
  });

  it("never makes the action looser", () => {
    const settings = { ...DEFAULT_VENDOR_SETTINGS, high_value_overrides: { HIGH: "ALLOW_COD" as const } };
    expect(resolveAction(input({ tier: "HIGH", orderValuePkr: 50000, settings })).action).toBe("PREPAID_ONLY");
  });

  it("returns the degraded action when data is unavailable", () => {
    expect(resolveAction(input({ tier: "HIGH", degraded: true }))).toEqual({
      action: "ALLOW_COD",
      reasons: ["DEGRADED_MODE"],
    });
  });
});

describe("parseVendorSettings", () => {
  it("fills defaults", () => {
    expect(parseVendorSettings({})).toEqual({ ok: true, value: DEFAULT_VENDOR_SETTINGS });
    expect(parseVendorSettings(null)).toEqual({ ok: true, value: DEFAULT_VENDOR_SETTINGS });
  });

  it("merges partial tier actions", () => {
    const r = parseVendorSettings({ tier_actions: { INSUFFICIENT_DATA: "REQUIRE_CONFIRMATION_CALL" } });
    expect(r.ok && r.value.tier_actions).toEqual({
      ...DEFAULT_VENDOR_SETTINGS.tier_actions,
      INSUFFICIENT_DATA: "REQUIRE_CONFIRMATION_CALL",
    });
  });

  it("rejects unknown actions and unknown keys", () => {
    expect(parseVendorSettings({ tier_actions: { LOW: "BLOCK" } }).ok).toBe(false);
    expect(parseVendorSettings({ something_else: 1 }).ok).toBe(false);
    expect(parseVendorSettings({ degraded_mode_action: "PREPAID_ONLY" }).ok).toBe(false);
  });
});
