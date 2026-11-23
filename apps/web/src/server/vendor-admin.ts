// Creates a vendor with its first API key (blueprint sections 5.1, 9.1).
// The full key and signing secret are returned once and never stored in plain text.

import { randomBytes, randomInt } from "node:crypto";
import { sha256Hex, type VendorStatus } from "@etimaad/core";
import { apiKeys, vendors } from "@etimaad/db";
import type { AnyPgDatabase } from "./postgres-store";
import { sealSecret } from "./secret-box";
import { API_SCOPES } from "./store";

const LOWER_DIGITS = "abcdefghijklmnopqrstuvwxyz0123456789";
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomString(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export interface ApiCredentials {
  keyPrefix: string;
  apiKey: string;
  signingSecret: string;
}

// A new API key (etm_<prefix>_<secret>) and signing secret.
export function generateApiCredentials(): ApiCredentials {
  const keyPrefix = randomString(LOWER_DIGITS, 8);
  return {
    keyPrefix,
    apiKey: `etm_${keyPrefix}_${randomString(ALPHANUMERIC, 32)}`,
    signingSecret: randomBytes(32).toString("base64url"),
  };
}

export interface NewVendorInput {
  legalName: string;
  displayName: string;
  category: "food" | "ecommerce" | "retail";
  status: VendorStatus;
  trustWeight: number;
  kycReference: string;
  kycLevel?: "FULL" | "LIGHT";
  kycVerifiedAt?: Date;
  kycReviewerNote?: string | null;
  probationEndsAt?: Date;
}

export interface CreatedVendor extends ApiCredentials {
  vendorId: string;
  apiKeyId: string;
}

export async function createVendorWithKey(
  db: AnyPgDatabase,
  input: NewVendorInput,
  signingKey: string,
): Promise<CreatedVendor> {
  const credentials = generateApiCredentials();

  return db.transaction(async (tx) => {
    const [vendor] = await tx
      .insert(vendors)
      .values({
        legalName: input.legalName,
        displayName: input.displayName,
        category: input.category,
        status: input.status,
        trustWeight: input.trustWeight,
        kycReference: input.kycReference,
        kycLevel: input.kycLevel ?? null,
        kycVerifiedAt: input.kycVerifiedAt ?? null,
        kycReviewerNote: input.kycReviewerNote ?? null,
        probationEndsAt: input.probationEndsAt ?? null,
        settings: {},
      })
      .returning({ id: vendors.id });
    if (!vendor) throw new Error("Vendor insert returned no row");

    const [key] = await tx
      .insert(apiKeys)
      .values({
        vendorId: vendor.id,
        keyPrefix: credentials.keyPrefix,
        keyHash: sha256Hex(credentials.apiKey),
        scopes: [...API_SCOPES],
        signingSecretRef: sealSecret(credentials.signingSecret, signingKey),
      })
      .returning({ id: apiKeys.id });
    if (!key) throw new Error("API key insert returned no row");

    return { vendorId: vendor.id, apiKeyId: key.id, ...credentials };
  });
}
