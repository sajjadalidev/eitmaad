// API key and request signature checks (blueprint section 9.1).

import { timingSafeEqual } from "node:crypto";
import { hmacSha256Hex, sha256Hex, vendorCanUseApi } from "@etimaad/core";
import { ApiError } from "./http";
import type { ApiKeyRecord, ApiScope, EtimaadStore, VendorRecord } from "./store";

// Key format: etm_<8 char prefix>_<secret>
const KEY_PATTERN = /^etm_([a-z0-9]{8})_([A-Za-z0-9]{24,})$/;
const MAX_CLOCK_SKEW_SECONDS = 300;

export interface AuthInput {
  headers: Headers;
  rawBody: string;
  now: Date;
  store: EtimaadStore;
  scope: ApiScope;
  requireSignature: boolean;
}

export interface AuthResult {
  apiKey: ApiKeyRecord;
  vendor: VendorRecord;
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function authenticate(input: AuthInput): Promise<AuthResult> {
  const { headers, rawBody, now, store, scope, requireSignature } = input;

  const presented = headers.get("x-api-key")?.trim() ?? "";
  const match = KEY_PATTERN.exec(presented);
  if (!match) throw new ApiError(401, "INVALID_KEY", "Missing or malformed API key.");

  const apiKey = await store.findApiKeyByPrefix(match[1] ?? "");
  const valid =
    apiKey !== null &&
    apiKey.status === "ACTIVE" &&
    (apiKey.expiresAt === null || apiKey.expiresAt > now) &&
    safeEqualHex(sha256Hex(presented), apiKey.keyHash);
  if (!valid || !apiKey) throw new ApiError(401, "INVALID_KEY", "API key is not valid.");

  if (!apiKey.scopes.includes(scope)) throw new ApiError(403, "SCOPE_DENIED", `Key lacks scope ${scope}.`);

  const vendor = await store.getVendor(apiKey.vendorId);
  if (!vendor || !vendorCanUseApi(vendor.status)) {
    throw new ApiError(403, "VENDOR_NOT_ACTIVE", "Vendor account is not active.");
  }

  if (requireSignature) {
    const timestamp = headers.get("x-timestamp") ?? "";
    const seconds = /^\d{9,11}$/.test(timestamp) ? Number(timestamp) : NaN;
    if (!Number.isFinite(seconds) || Math.abs(now.getTime() / 1000 - seconds) > MAX_CLOCK_SKEW_SECONDS) {
      throw new ApiError(401, "TIMESTAMP_SKEW", "X-Timestamp is missing or outside 5 minutes.");
    }
    const secret = await store.resolveSigningSecret(apiKey.signingSecretRef);
    const expected = secret ? hmacSha256Hex(secret, `${timestamp}.${rawBody}`) : "";
    const given = (headers.get("x-signature") ?? "").toLowerCase();
    if (!secret || !safeEqualHex(given, expected)) {
      throw new ApiError(401, "BAD_SIGNATURE", "X-Signature does not match.");
    }
  }

  return { apiKey, vendor };
}
