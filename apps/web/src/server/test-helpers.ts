// Shared setup for API service tests. Uses the in-memory store only.

import { hmacSha256Hex, sha256Hex, type VendorStatus } from "@etimaad/core";
import type { ServiceContext } from "./ingest";
import { InMemoryStore } from "./memory-store";
import type { ApiScope, VendorRecord } from "./store";

export const NOW = new Date("2026-11-20T12:00:00Z");
export const PEPPER = "test-pepper-0123456789-abcdefghijklmnop";
export const ALL_SCOPES: ApiScope[] = ["events:write", "batches:write", "risk:read", "disputes:write"];

export function keyFor(letter: string): string {
  return `etm_test${letter.repeat(4)}_Secret${letter.toUpperCase().repeat(22)}`;
}

export function secretFor(letter: string): string {
  return `signing-secret-${letter}`;
}

export function makeStore(statuses: Record<string, VendorStatus> = {}): InMemoryStore {
  const store = new InMemoryStore();
  for (const letter of ["a", "b", "c", "d"]) {
    store.addVendor({
      id: `vendor-${letter}`,
      displayName: `Vendor ${letter}`,
      status: statuses[letter] ?? "ACTIVE",
      trustWeight: 1,
      faultClaimBias: 1,
      settings: {},
    });
    store.addApiKey(
      {
        id: `key-${letter}`,
        vendorId: `vendor-${letter}`,
        keyPrefix: `test${letter.repeat(4)}`,
        keyHash: sha256Hex(keyFor(letter)),
        scopes: ALL_SCOPES,
        signingSecretRef: `ref-${letter}`,
        status: "ACTIVE",
        expiresAt: null,
      },
      secretFor(letter),
    );
  }
  return store;
}

export function ctxFor(store: InMemoryStore, now: Date = NOW): ServiceContext {
  return { store, pepper: PEPPER, keyVersion: 1, now };
}

export function vendor(store: InMemoryStore, letter: string): VendorRecord {
  const v = store.vendors.get(`vendor-${letter}`);
  if (!v) throw new Error(`No vendor ${letter}`);
  return v;
}

export function signedHeaders(letter: string, body: string, now: Date = NOW): Headers {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return new Headers({
    "x-api-key": keyFor(letter),
    "x-timestamp": timestamp,
    "x-signature": hmacSha256Hex(secretFor(letter), `${timestamp}.${body}`),
  });
}

let counter = 0;

export function event(over: Record<string, unknown> = {}): Record<string, unknown> {
  counter++;
  return {
    event_id: `evt-${counter}`,
    external_order_ref: `ORD-${counter}`,
    phone: "03001234567",
    payment_method: "COD",
    order_value_pkr: 3000,
    status: "DELIVERED",
    consent_notice_version: "2026-10",
    occurred_at: "2026-11-20T10:00:00Z",
    ...over,
  };
}

export const refusal = (over: Record<string, unknown> = {}) =>
  event({ status: "FAILED_DELIVERY", reason_code: "CUSTOMER_REFUSED_AT_DOOR", ...over });
