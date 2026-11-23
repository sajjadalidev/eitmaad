import { describe, expect, it } from "vitest";
import { ApiError } from "./http";
import { ingestEvents } from "./ingest";
import { ctxFor, event, makeStore, refusal, vendor } from "./test-helpers";

async function send(store: ReturnType<typeof makeStore>, letter: string, events: unknown[], now?: Date) {
  return ingestEvents(ctxFor(store, now), vendor(store, letter), { events });
}

describe("ingestEvents", () => {
  it("accepts an event, stores the order and builds the profile", async () => {
    const store = makeStore();
    const r = await send(store, "a", [event()]);
    expect(r.status).toBe(200);
    expect(r.body.results[0]?.result).toBe("ACCEPTED");
    expect(store.orders.size).toBe(1);
    expect(store.profiles.size).toBe(1);
  });

  it("never stores the raw phone number", async () => {
    const store = makeStore();
    await send(store, "a", [event({ phone: "03001234567" })]);
    const dump = JSON.stringify([...store.orders.values(), store.events, [...store.phones.keys()]]);
    expect(dump).not.toContain("3001234567");
  });

  it("returns DUPLICATE for the same event and conflict for a changed one", async () => {
    const store = makeStore();
    const e = event();
    await send(store, "a", [e]);
    const again = await send(store, "a", [e]);
    const changed = await send(store, "a", [{ ...e, order_value_pkr: 9999 }]);
    expect(again.body.results[0]?.result).toBe("DUPLICATE");
    expect(changed.body.results[0]?.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(store.orders.size).toBe(1);
  });

  it("rejects invalid events with the right code", async () => {
    const store = makeStore();
    const cases: [Record<string, unknown>, string][] = [
      [event({ phone: "04235123456" }), "INVALID_PHONE"],
      [event({ consent_notice_version: "" }), "CONSENT_NOTICE_MISSING"],
      [event({ external_order_ref: "ORD-03001234567" }), "PII_IN_REFERENCE"],
      [event({ occurred_at: "2026-09-01T00:00:00Z" }), "OCCURRED_AT_OUT_OF_WINDOW"],
      [event({ status: "FAILED_DELIVERY" }), "REASON_STATUS_MISMATCH"],
      [event({ order_value_pkr: -1 }), "VALIDATION_ERROR"],
    ];
    for (const [e, code] of cases) {
      const r = await send(store, "a", [e]);
      expect(r.status).toBe(422);
      expect(r.body.results[0]?.code).toBe(code);
    }
    expect(store.orders.size).toBe(0);
  });

  it("does not keep a reference that contains a phone number", async () => {
    const store = makeStore();
    await send(store, "a", [event({ external_order_ref: "ORD-03001234567" })]);
    expect(store.events[0]?.externalOrderRef).toBe("[redacted]");
  });

  it("returns 207 for mixed results", async () => {
    const store = makeStore();
    const r = await send(store, "a", [event(), event({ phone: "bad" })]);
    expect(r.status).toBe(207);
  });

  it("rejects a body without events", async () => {
    const store = makeStore();
    await expect(ingestEvents(ctxFor(store), vendor(store, "a"), { events: [] })).rejects.toBeInstanceOf(ApiError);
  });

  it("follows the order state machine and allows corrections", async () => {
    const store = makeStore();
    const placed = event({ status: "PLACED" });
    await send(store, "a", [placed]);
    const ref = placed.external_order_ref;

    const failed = await send(store, "a", [refusal({ external_order_ref: ref })]);
    expect(failed.body.results[0]?.result).toBe("ACCEPTED");

    const backToDelivered = await send(store, "a", [event({ external_order_ref: ref })]);
    expect(backToDelivered.body.results[0]?.code).toBe("INVALID_TRANSITION");

    const correction = await send(store, "a", [
      event({ external_order_ref: ref, status: "FAILED_DELIVERY", reason_code: "RIDER_ISSUE", is_correction: true }),
    ]);
    expect(correction.body.results[0]?.result).toBe("ACCEPTED");
    expect([...store.orders.values()][0]?.derivedFault).toBe("LOGISTICS");
  });

  it("rejects a different phone for an existing order", async () => {
    const store = makeStore();
    const placed = event({ status: "PLACED" });
    await send(store, "a", [placed]);
    const r = await send(store, "a", [event({ external_order_ref: placed.external_order_ref, phone: "03211234567" })]);
    expect(r.body.results[0]?.code).toBe("VALIDATION_ERROR");
  });

  it("warns about dropped metadata keys", async () => {
    const store = makeStore();
    const r = await send(store, "a", [event({ metadata: { city: "Lahore", phone: "x" } })]);
    expect(r.body.results[0]?.warnings).toEqual(["METADATA_KEYS_DROPPED: phone"]);
  });
});
