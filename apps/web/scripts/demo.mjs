// Calls the local API with the dev credentials. Run the dev server first: pnpm dev
// Usage: pnpm --filter @etimaad/web demo

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const creds = JSON.parse(readFileSync(new URL("../src/server/dev-credentials.json", import.meta.url), "utf8"));
const BASE = process.env.ETIMAAD_URL ?? "http://localhost:3000";
const [storeA, storeB, storeC] = creds.vendors;

async function post(path, vendor, body, { sign = false, badSignature = false } = {}) {
  const raw = JSON.stringify(body);
  const headers = { "content-type": "application/json", "x-api-key": vendor.apiKey };
  if (sign) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const secret = badSignature ? "wrong-secret" : vendor.signingSecret;
    headers["x-timestamp"] = timestamp;
    headers["x-signature"] = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  }
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: raw });
  return { status: res.status, body: await res.json() };
}

// A fresh test number each run, because the dev store keeps data until the server restarts.
const phone = `0300${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
const unknownPhone = `0321${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
const run = Date.now().toString(36);
const now = new Date().toISOString();

const event = (id, extra) => ({
  event_id: `${run}-${id}`,
  external_order_ref: `${run}-${id}`,
  phone,
  payment_method: "COD",
  order_value_pkr: 3500,
  status: "DELIVERED",
  consent_notice_version: "2026-10",
  occurred_at: now,
  ...extra,
});
const refused = { status: "FAILED_DELIVERY", reason_code: "CUSTOMER_REFUSED_AT_DOOR" };

function show(title, result) {
  console.log(`\n=== ${title}`);
  console.log(`HTTP ${result.status}`);
  console.log(JSON.stringify(result.body, null, 2));
}

const batchA = { events: [event("a1"), event("a2", refused)] };
show("1. Store A reports 1 delivered and 1 refused order", await post("/v1/order-events", storeA, batchA, { sign: true }));
show("2. Store A sends the same events again", await post("/v1/order-events", storeA, batchA, { sign: true }));
show("3. Store B reports a refused order", await post("/v1/order-events", storeB, { events: [event("b1", refused)] }, { sign: true }));
show("4. Store C checks the same customer", await post("/v1/risk/check", storeC, { phone, order_value_pkr: 4000 }));
show("5. Store C checks an unknown number", await post("/v1/risk/check", storeC, { phone: unknownPhone, order_value_pkr: 4000 }));
show(
  "6. Request with a wrong signature",
  await post("/v1/order-events", storeA, { events: [event("x1")] }, { sign: true, badSignature: true }),
);
