// What a vendor OWNER can change in the portal: API keys and settings (blueprint section 20.2.1).

import { parseVendorSettings } from "@etimaad/core";
import type { EtimaadStore } from "./store";
import { generateApiCredentials } from "./vendor-admin";

export const MAX_ACTIVE_KEYS = 3;

interface VendorUserSession {
  sub: string;
  name: string;
  role: string;
  vendorId: string | null;
}

type Result<T = object> = ({ status: "SAVED" } & T) | { status: "ERROR"; message: string };
const fail = (message: string) => ({ status: "ERROR" as const, message });

async function ownerVendor(store: EtimaadStore, user: VendorUserSession) {
  if (user.role !== "OWNER" || !user.vendorId) return null;
  const vendor = await store.getVendor(user.vendorId);
  return vendor && vendor.status !== "TERMINATED" ? vendor : null;
}

async function audit(store: EtimaadStore, user: VendorUserSession, action: string, note: string | null, now: Date) {
  await store.recordAdminAudit({
    actorType: "VENDOR",
    actorId: user.sub,
    actorName: user.name,
    action,
    entityType: "vendor_users",
    entityId: user.vendorId ?? "none",
    note,
    now,
  });
}

export async function createOwnApiKey(
  ctx: { store: EtimaadStore; now: Date },
  user: VendorUserSession,
): Promise<Result<{ secret: { apiKey: string; signingSecret: string } }>> {
  const vendor = await ownerVendor(ctx.store, user);
  if (!vendor) return fail("Only the owner of an open store can create keys.");
  const active = (await ctx.store.listVendorApiKeys(vendor.id)).filter((k) => k.status === "ACTIVE");
  if (active.length >= MAX_ACTIVE_KEYS) return fail(`You can have ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);

  const credentials = generateApiCredentials();
  await ctx.store.addVendorApiKey(vendor.id, credentials, ctx.now);
  await audit(ctx.store, user, "API_KEY_CREATED", credentials.keyPrefix, ctx.now);
  return { status: "SAVED", secret: { apiKey: credentials.apiKey, signingSecret: credentials.signingSecret } };
}

export async function revokeOwnApiKey(
  ctx: { store: EtimaadStore; now: Date },
  user: VendorUserSession,
  keyId: string,
): Promise<Result> {
  const vendor = await ownerVendor(ctx.store, user);
  if (!vendor) return fail("Only the owner can revoke keys.");
  const key = (await ctx.store.listVendorApiKeys(vendor.id)).find((k) => k.id === keyId && k.status === "ACTIVE");
  if (!key) return fail("Key not found or already revoked.");
  if (!(await ctx.store.revokeVendorApiKey(vendor.id, key.id, ctx.now))) return fail("Key not found or already revoked.");
  await audit(ctx.store, user, "API_KEY_REVOKED", key.keyPrefix, ctx.now);
  return { status: "SAVED" };
}

export async function saveOwnSettings(
  ctx: { store: EtimaadStore; now: Date },
  user: VendorUserSession,
  raw: unknown,
): Promise<Result> {
  const vendor = await ownerVendor(ctx.store, user);
  if (!vendor) return fail("Only the owner can change settings.");
  const parsed = parseVendorSettings(raw);
  if (!parsed.ok) return fail("Settings are not valid. Check the numbers.");
  await ctx.store.saveVendorSettings(vendor.id, parsed.value as unknown as Record<string, unknown>, ctx.now);
  await audit(ctx.store, user, "SETTINGS_SAVED", null, ctx.now);
  return { status: "SAVED" };
}
