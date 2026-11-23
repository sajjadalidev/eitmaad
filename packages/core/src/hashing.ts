// Hashing helpers (blueprint sections 3.4, 4.1, 5.1).

import { createHash, createHmac } from "node:crypto";
import { err, ok, type Result } from "./result";

const MIN_PEPPER_LENGTH = 32;

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacSha256Hex(key: string, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function assertPepper(pepper: string): void {
  if (pepper.length < MIN_PEPPER_LENGTH) {
    throw new Error(`Pepper must be at least ${MIN_PEPPER_LENGTH} characters`);
  }
}

// Input must already be normalised E.164 (see normalizePkMobile).
export function hashPhone(e164: string, pepper: string): string {
  assertPepper(pepper);
  return hmacSha256Hex(pepper, e164);
}

// Accepts 12345-1234567-1 or 13 digits. Returns the 13 digits.
export function normalizeCnic(input: string): Result<string, "INVALID_CNIC"> {
  const digits = input.trim().replace(/-/g, "");
  return /^\d{13}$/.test(digits) ? ok(digits) : err("INVALID_CNIC");
}

export function hashCnic(cnicDigits: string, pepper: string): string {
  assertPepper(pepper);
  return hmacSha256Hex(pepper, `cnic:${cnicDigits}`);
}

// Stable JSON: object keys sorted, undefined values dropped.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) out[key] = sortKeys(child);
    }
    return out;
  }
  return value;
}

// The parts are JSON-encoded as an array, so no delimiter inside a value can cause a collision.
export function idempotencyKey(vendorId: string, externalOrderRef: string, eventId: string): string {
  return sha256Hex(JSON.stringify([vendorId, externalOrderRef, eventId]));
}

export function payloadHash(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}
