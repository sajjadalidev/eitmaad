import { describe, expect, it } from "vitest";
import { NOW, daysAgo } from "./test-fixtures";
import { checkConsentNotice, checkOccurredAtWindow, checkOrderRefHasNoPii, sanitizeMetadata } from "./validation";

describe("checkOccurredAtWindow", () => {
  it("accepts the last 30 days and up to 10 minutes ahead", () => {
    expect(checkOccurredAtWindow(daysAgo(29), NOW, false).ok).toBe(true);
    expect(checkOccurredAtWindow(new Date(NOW.getTime() + 5 * 60_000), NOW, false).ok).toBe(true);
  });

  it("rejects older or future events", () => {
    expect(checkOccurredAtWindow(daysAgo(31), NOW, false).ok).toBe(false);
    expect(checkOccurredAtWindow(new Date(NOW.getTime() + 11 * 60_000), NOW, false).ok).toBe(false);
  });

  it("allows 12 months for approved backfill", () => {
    expect(checkOccurredAtWindow(daysAgo(300), NOW, true).ok).toBe(true);
    expect(checkOccurredAtWindow(daysAgo(366), NOW, true).ok).toBe(false);
  });
});

describe("checkConsentNotice", () => {
  it("needs a non-empty version", () => {
    expect(checkConsentNotice("2026-10").ok).toBe(true);
    expect(checkConsentNotice("").ok).toBe(false);
    expect(checkConsentNotice(null).ok).toBe(false);
  });
});

describe("checkOrderRefHasNoPii", () => {
  it("rejects references that contain a mobile number", () => {
    expect(checkOrderRefHasNoPii("ORD-03001234567").ok).toBe(false);
    expect(checkOrderRefHasNoPii("+92-300-1234567").ok).toBe(false);
  });

  it("accepts normal references", () => {
    expect(checkOrderRefHasNoPii("ORD-55231").ok).toBe(true);
    expect(checkOrderRefHasNoPii("1234567890123").ok).toBe(true);
  });
});

describe("sanitizeMetadata", () => {
  it("keeps whitelisted keys and drops the rest", () => {
    const r = sanitizeMetadata({
      city: "Lahore",
      channel: "app",
      item_count: 3,
      phone: "03001234567",
      channel_extra: 1,
    });
    expect(r.metadata).toEqual({ city: "Lahore", channel: "app", item_count: 3 });
    expect(r.droppedKeys.sort()).toEqual(["channel_extra", "phone"]);
  });

  it("drops invalid values", () => {
    const r = sanitizeMetadata({ channel: "fax", item_count: -1, delivery_attempt_times: ["not a date"] });
    expect(r.metadata).toEqual({});
    expect(r.droppedKeys).toHaveLength(3);
  });
});
