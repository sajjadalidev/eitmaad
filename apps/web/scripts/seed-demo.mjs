// Seeds demo customers, orders and risk checks through the public API, like a real store would.
// All phone numbers are fake (0300 0000 1xx). All order refs start with "DEMO-".
//
// Local (dev server with the in-memory store, data is lost on restart):
//   pnpm --filter @etimaad/web seed-demo --target local
// Live (writes to the production database, run only with approval):
//   pnpm --filter @etimaad/web seed-demo --target live --yes
//
// Live uses the demo stores in apps/web/.secrets/vendor-*.json whose name ends with "(DEMO)".

import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const target = args[args.indexOf("--target") + 1];
if (target !== "local" && target !== "live") {
  console.error("Use --target local or --target live.");
  process.exit(1);
}
if (target === "live" && !args.includes("--yes")) {
  console.error("Refusing to run without --yes. This writes to the live database.");
  process.exit(1);
}

const LIVE_STORES = [
  "Lahore Threads (DEMO)",
  "Karachi Gadgets (DEMO)",
  "Islamabad Home Decor (DEMO)",
  "Faisalabad Kids Wear (DEMO)",
];

function loadStores() {
  if (target === "local") {
    const creds = JSON.parse(readFileSync(new URL("../src/server/dev-credentials.json", import.meta.url), "utf8"));
    return { base: process.env.ETIMAAD_URL ?? "http://localhost:3000", stores: creds.vendors };
  }
  const dir = new URL("../.secrets/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.startsWith("vendor-") && f.endsWith(".json"));
  const all = files.map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
  const stores = LIVE_STORES.map((name) => {
    const found = all.find((v) => v.displayName === name);
    if (!found) throw new Error(`Missing secrets file for "${name}". Create the demo stores first.`);
    return { name, apiKey: found.apiKey, signingSecret: found.signingSecret };
  });
  return { base: process.env.ETIMAAD_URL ?? "https://eitmaad.vercel.app", stores };
}

const { base, stores } = loadStores();
const now = Date.now();
const DAY = 86_400_000;

async function post(path, store, body) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "x-api-key": store.apiKey,
    "x-timestamp": ts,
    "x-signature": createHmac("sha256", store.signingSecret).update(`${ts}.${raw}`).digest("hex"),
  };
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body: raw });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text.slice(0, 200) };
  }
}

// Order shorthands: [store slot, days ago, outcome, order value (default 3500), payment (default COD)]
const D = "DELIVERED";
const REFUSED = { status: "FAILED_DELIVERY", reason_code: "CUSTOMER_REFUSED_AT_DOOR" };
const FAKE = { status: "FAILED_DELIVERY", reason_code: "FAKE_OR_INVALID_ADDRESS" };
const RIDER = { status: "FAILED_DELIVERY", reason_code: "RIDER_ISSUE" };
const DAMAGED = { status: "FAILED_DELIVERY", reason_code: "TRANSIT_DAMAGE" };
const NO_STOCK = { status: "CANCELLED", reason_code: "OUT_OF_STOCK", cancellation_stage: "PRE_DISPATCH" };
const UNREACHABLE_ONCE = { status: "FAILED_DELIVERY", reason_code: "CUSTOMER_UNREACHABLE", delivery_attempts: 1 };
const CANCEL_EARLY = {
  status: "CANCELLED",
  reason_code: "CUSTOMER_CANCELLED_PRE_DISPATCH",
  cancellation_stage: "PRE_DISPATCH",
};

const CUSTOMERS = [
  {
    story: "Loyal buyer, 3+ stores, all delivered",
    expect: "LOW",
    orders: [[0, 26, D], [0, 19, D], [0, 8, D], [1, 24, D], [1, 12, D], [1, 3, D], [2, 21, D], [2, 15, D], [2, 5, D], [3, 1, D]],
  },
  {
    story: "Mixed record, one refusal",
    expect: "MEDIUM",
    orders: [[0, 25, D], [0, 14, D], [1, 20, D], [2, 10, D], [0, 6, D], [1, 4, REFUSED]],
  },
  {
    story: "Refuses at the door at many stores",
    expect: "HIGH",
    orders: [[0, 27, D], [0, 22, REFUSED], [1, 16, REFUSED], [2, 9, REFUSED], [1, 2, REFUSED], [3, 12, REFUSED]],
  },
  {
    story: "Fake address at 2 stores",
    expect: "HIGH (hard rule)",
    orders: [[1, 23, D], [0, 18, FAKE], [2, 7, FAKE]],
  },
  {
    story: "New customer, one order",
    expect: "NOT ENOUGH DATA",
    orders: [[1, 3, D]],
  },
  {
    story: "New number, 2 recent refusals at 2 stores",
    expect: "HIGH (thin data rule)",
    orders: [[0, 5, REFUSED], [2, 2, REFUSED]],
  },
  {
    story: "Complaints from one store only",
    expect: "MEDIUM (one store cannot make HIGH)",
    orders: [[0, 28, D], [0, 20, REFUSED], [0, 13, REFUSED], [0, 6, REFUSED]],
  },
  {
    story: "Failures were the store's or courier's fault",
    expect: "LOW (not blamed)",
    orders: [[0, 24, D], [1, 17, D], [2, 11, D], [1, 6, RIDER], [2, 4, NO_STOCK], [0, 9, DAMAGED]],
  },
  {
    story: "Refused before, now pays in advance",
    expect: "MEDIUM (recovering)",
    orders: [
      [0, 29, REFUSED], [1, 27, REFUSED],
      [2, 20, D, 4000, "PREPAID"], [2, 15, D, 4000, "PREPAID"], [2, 10, D, 4000, "PREPAID"],
      [0, 6, D, 4000, "PREPAID"], [0, 2, D, 4000, "PREPAID"],
    ],
  },
  {
    story: "Big orders, all delivered",
    expect: "LOW",
    orders: [[0, 22, D, 25000], [0, 9, D, 25000], [1, 17, D, 25000], [1, 4, D, 25000], [2, 13, D, 25000], [2, 1, D, 25000], [3, 6, D, 25000]],
  },
  {
    story: "Unreachable once (only 1 call, so no blame)",
    expect: "LOW",
    orders: [[1, 18, D], [0, 12, UNREACHABLE_ONCE], [2, 8, D], [0, 3, D]],
  },
  {
    story: "Cancelled before dispatch (harmless)",
    expect: "LOW",
    orders: [[0, 23, D], [1, 14, CANCEL_EARLY], [2, 11, D], [0, 7, D], [3, 3, D]],
  },
];

const phoneOf = (i) => `03000000${101 + i}`; // 03000000101 to 03000000112
const iso = (daysAgo, hourShift = 0) => new Date(now - daysAgo * DAY - hourShift * 3_600_000).toISOString();

// Build events per store. Every third delivered order also gets a DISPATCHED event first.
const eventsByStore = new Map();
let skipped = 0;
CUSTOMERS.forEach((c, ci) => {
  c.orders.forEach(([slot, daysAgo, outcome, value = 3500, payment = "COD"], oi) => {
    if (!stores[slot]) {
      skipped++;
      return;
    }
    const ref = `DEMO-C${String(ci + 1).padStart(2, "0")}-${oi + 1}`;
    const extra = typeof outcome === "string" ? { status: outcome } : outcome;
    const baseEvent = {
      external_order_ref: ref,
      phone: phoneOf(ci),
      payment_method: payment,
      order_value_pkr: value,
      consent_notice_version: "2026-10",
      metadata: { channel: "web" },
    };
    const list = eventsByStore.get(slot) ?? [];
    if (extra.status === "DELIVERED" && oi % 3 === 0) {
      list.push({ ...baseEvent, event_id: `${ref}-dispatched`, status: "DISPATCHED", occurred_at: iso(daysAgo, 20) });
    }
    list.push({ ...baseEvent, ...extra, event_id: `${ref}-final`, occurred_at: iso(daysAgo) });
    eventsByStore.set(slot, list);
  });
});

console.log(`Target: ${target} (${base})`);
console.log(`Stores: ${stores.map((s) => s.name).join(", ")}`);
if (skipped) console.log(`Skipped ${skipped} orders for a 4th store (not available on this target).`);

const counts = { ACCEPTED: 0, DUPLICATE: 0, REJECTED: 0 };
for (const [slot, list] of eventsByStore) {
  list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  for (let i = 0; i < list.length; i += 40) {
    const res = await post("/v1/order-events", stores[slot], { events: list.slice(i, i + 40) });
    if (!Array.isArray(res.body?.results)) {
      console.error(`Order events failed for ${stores[slot].name}: HTTP ${res.status}`, res.body);
      process.exit(1);
    }
    for (const r of res.body.results) {
      counts[r.result]++;
      if (r.result === "REJECTED") console.log(`  Rejected ${r.event_id}: ${r.code}`);
    }
  }
}
console.log(`\nOrder events: ${counts.ACCEPTED} accepted, ${counts.DUPLICATE} duplicate, ${counts.REJECTED} rejected`);

// Risk checks: every store checks some customers, plus a few unknown numbers.
const rows = [];
for (const [ci, c] of CUSTOMERS.entries()) {
  for (const slot of [0, 1, 2]) {
    if (!stores[slot] || (ci + slot) % 3 === 2) continue;
    const value = [2500, 6000, 18000][(ci + slot) % 3];
    const res = await post("/v1/risk/check", stores[slot], { phone: phoneOf(ci), order_value_pkr: value });
    if (res.status !== 200) {
      console.error(`Risk check failed: HTTP ${res.status}`, res.body);
      process.exit(1);
    }
    if (slot === 0 || !rows.some((r) => r.phone === phoneOf(ci))) {
      rows.push({
        phone: phoneOf(ci),
        story: c.story,
        expected: c.expect,
        tier: res.body.risk_tier,
        score: res.body.score ?? "hidden",
        action: `${res.body.recommended_action} (Rs ${value}, ${stores[slot].name})`,
      });
    }
  }
}
for (let i = 0; i < 4; i++) {
  await post("/v1/risk/check", stores[i % stores.length], { phone: `03000000${190 + i}`, order_value_pkr: 3000 });
}

console.log("\nCustomer results:");
console.table(rows.filter((r, i, all) => all.findIndex((x) => x.phone === r.phone) === i));
