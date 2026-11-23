import { describe, expect, it } from "vitest";
import { ApiError } from "./http";
import { ingestEvents } from "./ingest";
import { riskCheck } from "./risk";
import { ctxFor, event, makeStore, refusal, vendor } from "./test-helpers";

type Store = ReturnType<typeof makeStore>;

async function report(store: Store, letter: string, events: unknown[]) {
  const r = await ingestEvents(ctxFor(store), vendor(store, letter), { events });
  expect(r.status).toBe(200);
}

function check(store: Store, letter: string, body: Record<string, unknown>) {
  return riskCheck(ctxFor(store), vendor(store, letter), `key-${letter}`, {
    order_value_pkr: 3000,
    ...body,
  });
}

describe("riskCheck", () => {
  it("gives the same answer shape for an unknown phone and a thin-data customer", async () => {
    const store = makeStore();
    await report(store, "a", [event({ phone: "03001111111" })]);

    const unknown = await check(store, "c", { phone: "03009999999" });
    const thin = await check(store, "c", { phone: "03001111111" });
    expect(thin).toEqual(unknown);
    expect(unknown).toMatchObject({
      risk_tier: "INSUFFICIENT_DATA",
      score: null,
      recommended_action: "ALLOW_COD",
      network_signal: null,
      your_history: null,
    });
  });

  it("marks refusals from 2 merchants as HIGH and PREPAID_ONLY", async () => {
    const store = makeStore();
    await report(store, "a", [refusal()]);
    await report(store, "b", [refusal()]);
    const r = await check(store, "c", { phone: "03001234567" });
    expect(r.risk_tier).toBe("HIGH");
    expect(r.recommended_action).toBe("PREPAID_ONLY");
    expect(r.reasons).toContain("RECENT_FAULTS_MULTIPLE_MERCHANTS");
    expect(r.score).toBeNull();
  });

  it("shows score and network bands only with 3 or more merchants", async () => {
    const store = makeStore();
    for (const letter of ["a", "b", "c"]) await report(store, letter, [event(), event()]);
    const r = await check(store, "d", { phone: "03001234567" });
    expect(r.risk_tier).toBe("LOW");
    expect(typeof r.score).toBe("number");
    expect(r.network_signal).toEqual({ vendor_count_band: "2-4", last_activity_band: "LAST_30_DAYS" });
  });

  it("applies the vendor's own history rule", async () => {
    const store = makeStore();
    await report(store, "a", [refusal(), refusal()]);
    const own = await check(store, "a", { phone: "03001234567" });
    const other = await check(store, "b", { phone: "03001234567" });
    expect(own.risk_tier).toBe("MEDIUM");
    expect(own.recommended_action).toBe("PREPAID_ONLY");
    expect(own.reasons).toContain("OWN_HISTORY_RULE");
    expect(own.your_history).toMatchObject({ orders: 2, user_fault: 2 });
    expect(other.recommended_action).toBe("REQUIRE_CONFIRMATION_CALL");
  });

  it("asks for an advance on high value MEDIUM orders", async () => {
    const store = makeStore();
    await report(store, "a", [refusal(), refusal()]);
    const r = await check(store, "b", { phone: "03001234567", order_value_pkr: 20000 });
    expect(r.recommended_action).toBe("REQUIRE_PARTIAL_ADVANCE");
    expect(r.reasons).toContain("HIGH_ORDER_VALUE");
  });

  it("records each lookup with the phone hash only", async () => {
    const store = makeStore();
    await check(store, "a", { phone: "03001234567", checkout_ref: "CHK-1" });
    expect(store.lookups).toHaveLength(1);
    expect(JSON.stringify(store.lookups)).not.toContain("3001234567");
  });

  it("enforces the daily quota", async () => {
    const store = makeStore({ a: "PROBATION" });
    for (let i = 0; i < 200; i++) await check(store, "a", { phone: "03001234567" });
    await expect(check(store, "a", { phone: "03001234567" })).rejects.toMatchObject({ status: 429, code: "QUOTA_EXCEEDED" });
  });

  it("rejects bad input", async () => {
    const store = makeStore();
    await expect(check(store, "a", { phone: "12345" })).rejects.toMatchObject({ status: 422, code: "INVALID_PHONE" });
    await expect(check(store, "a", { phone: "03001234567", order_value_pkr: "x" })).rejects.toBeInstanceOf(ApiError);
    await expect(check(store, "a", { phone: "03001234567", checkout_ref: "CHK-03001234567" })).rejects.toMatchObject({
      code: "PII_IN_REFERENCE",
    });
  });
});
