// Seeded in-memory store for local development. Not a database.

import { sha256Hex } from "@etimaad/core";
import credentials from "./dev-credentials.json";
import { InMemoryStore } from "./memory-store";

export const DEV_PEPPER = credentials.pepper;

export function createDevStore(): InMemoryStore {
  const store = new InMemoryStore();
  for (const v of credentials.vendors) {
    store.addVendor({
      id: v.id,
      displayName: v.name,
      status: "ACTIVE",
      trustWeight: 1,
      faultClaimBias: 1,
      settings: {},
    });
    const prefix = v.apiKey.split("_")[1] ?? "";
    store.addApiKey(
      {
        id: `key-${prefix}`,
        vendorId: v.id,
        keyPrefix: prefix,
        keyHash: sha256Hex(v.apiKey),
        scopes: ["events:write", "batches:write", "risk:read", "disputes:write"],
        signingSecretRef: `dev/${prefix}`,
        status: "ACTIVE",
        expiresAt: null,
      },
      v.signingSecret,
    );
  }
  // Dev vendor users, so the Team pages list them. They log in through dev-credentials.json.
  for (const u of credentials.users) {
    if (u.kind !== "vendor" || !u.vendorId) continue;
    store.portalUsers.set(`dev-auth-${u.id}`, {
      id: u.id,
      email: u.email,
      name: u.name,
      kind: "vendor",
      role: u.role,
      vendorId: u.vendorId,
      status: "ACTIVE",
    });
  }
  return store;
}
