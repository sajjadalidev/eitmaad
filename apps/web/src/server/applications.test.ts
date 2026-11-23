import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD, MAX_PER_EMAIL_PER_DAY, MAX_PER_IP_PER_HOUR, submitApplication } from "./applications";
import { InMemoryStore } from "./memory-store";
import { NOW, PEPPER } from "./test-helpers";

const valid = (over: Record<string, unknown> = {}) => ({
  legal_name: "Acme Traders Pvt Ltd",
  display_name: "Acme",
  category: "ecommerce",
  business_type: "PVT_LTD",
  platform: "WOOCOMMERCE",
  store_url: "https://acme.pk",
  contact_name: "Ali Khan",
  contact_email: "Ali@Acme.pk",
  ...over,
});

function ctx(store = new InMemoryStore(), now = NOW) {
  return { store, pepper: PEPPER, now };
}

describe("submitApplication", () => {
  it("saves a valid application with a lowercase email and a hashed IP", async () => {
    const c = ctx();
    expect(await submitApplication(c, valid(), "203.0.113.7")).toEqual({ status: "RECEIVED" });
    const [saved] = c.store.applications;
    expect(saved?.contactEmail).toBe("ali@acme.pk");
    expect(saved?.status).toBe("NEW");
    expect(saved?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(saved)).not.toContain("203.0.113.7");
  });

  it("allows an empty website", async () => {
    const c = ctx();
    expect(await submitApplication(c, valid({ store_url: "" }), null)).toEqual({ status: "RECEIVED" });
    expect(c.store.applications[0]?.storeUrl).toBeNull();
  });

  it("reports invalid fields", async () => {
    const r = await submitApplication(
      ctx(),
      valid({ contact_email: "not-an-email", store_url: "javascript:alert(1)", category: "weapons" }),
      null,
    );
    expect(r.status).toBe("INVALID_INPUT");
    if (r.status === "INVALID_INPUT") expect(r.fields.sort()).toEqual(["category", "contact_email", "store_url"]);
  });

  it("uses a hidden field name that browsers will not autofill", () => {
    expect(HONEYPOT_FIELD).not.toMatch(/fax|phone|tel|company|url|email|name|address/i);
  });

  it("pretends success for bots that fill the hidden field, but saves nothing", async () => {
    const c = ctx();
    expect(await submitApplication(c, valid({ [HONEYPOT_FIELD]: "123" }), null)).toEqual({ status: "RECEIVED" });
    expect(c.store.applications).toHaveLength(0);
  });

  it("limits applications per email per day", async () => {
    const c = ctx();
    for (let i = 0; i < MAX_PER_EMAIL_PER_DAY; i++) await submitApplication(c, valid(), `10.0.0.${i}`);
    expect(await submitApplication(c, valid(), "10.0.0.99")).toEqual({ status: "ALREADY_RECEIVED" });
    const nextDay = ctx(c.store, new Date(NOW.getTime() + 25 * 3_600_000));
    expect(await submitApplication(nextDay, valid(), "10.0.0.98")).toEqual({ status: "RECEIVED" });
  });

  it("limits applications per IP per hour", async () => {
    const c = ctx();
    for (let i = 0; i < MAX_PER_IP_PER_HOUR; i++) {
      await submitApplication(c, valid({ contact_email: `user${i}@shop.pk` }), "198.51.100.1");
    }
    expect(await submitApplication(c, valid({ contact_email: "other@shop.pk" }), "198.51.100.1")).toEqual({
      status: "TOO_MANY",
    });
  });
});
