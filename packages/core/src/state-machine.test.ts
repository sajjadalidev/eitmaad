import { describe, expect, it } from "vitest";
import { checkTransition } from "./state-machine";
import { NOW, daysAgo } from "./test-fixtures";

describe("checkTransition", () => {
  it("allows any first status for a new order", () => {
    expect(checkTransition({ current: null, next: "FAILED_DELIVERY", isCorrection: false, now: NOW }).ok).toBe(true);
  });

  it("allows normal forward moves", () => {
    const placed = { status: "PLACED" as const, lastTerminalAt: null };
    const deliveredState = { status: "DELIVERED" as const, lastTerminalAt: daysAgo(1) };
    expect(checkTransition({ current: placed, next: "DISPATCHED", isCorrection: false, now: NOW }).ok).toBe(true);
    expect(checkTransition({ current: placed, next: "DELIVERED", isCorrection: false, now: NOW }).ok).toBe(true);
    expect(
      checkTransition({ current: deliveredState, next: "RETURNED_POST_DELIVERY", isCorrection: false, now: NOW }).ok,
    ).toBe(true);
  });

  it("rejects impossible moves", () => {
    const cancelled = { status: "CANCELLED" as const, lastTerminalAt: daysAgo(1) };
    expect(checkTransition({ current: cancelled, next: "DELIVERED", isCorrection: false, now: NOW })).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
    });
  });

  it("allows corrections within 14 days only", () => {
    const recent = { status: "FAILED_DELIVERY" as const, lastTerminalAt: daysAgo(13) };
    const old = { status: "FAILED_DELIVERY" as const, lastTerminalAt: daysAgo(15) };
    expect(checkTransition({ current: recent, next: "CANCELLED", isCorrection: true, now: NOW }).ok).toBe(true);
    expect(checkTransition({ current: old, next: "CANCELLED", isCorrection: true, now: NOW })).toEqual({
      ok: false,
      code: "CORRECTION_WINDOW_EXPIRED",
    });
  });

  it("rejects corrections on new or non-terminal orders", () => {
    const placed = { status: "PLACED" as const, lastTerminalAt: null };
    expect(checkTransition({ current: null, next: "DELIVERED", isCorrection: true, now: NOW }).ok).toBe(false);
    expect(checkTransition({ current: placed, next: "DELIVERED", isCorrection: true, now: NOW }).ok).toBe(false);
  });
});
