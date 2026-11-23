"use server";

import { revalidatePath } from "next/cache";
import { getInviter } from "@/server/account-invites";
import { acceptAgreement } from "@/server/agreement";
import { getRuntime } from "@/server/config";
import type { InMemoryStore } from "@/server/memory-store";
import { requireSession } from "@/server/require-session";
import { SET_PASSWORD_PATH, siteOrigin } from "@/server/site-url";
import { inviteVendorUser, setVendorUserStatus } from "@/server/vendor-accounts";
import { createOwnApiKey, revokeOwnApiKey, saveOwnSettings } from "@/server/vendor-self-service";

export interface FormState {
  status: "IDLE" | "SAVED" | "ERROR";
  message: string | null;
  // Shown once after a key is created. Never stored in plain text.
  secret?: { apiKey: string; signingSecret: string } | null;
}

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
};

async function context() {
  const session = await requireSession("vendor");
  return { session, store: getRuntime().store, now: new Date() };
}

function done(message: string, paths: string[]): FormState {
  for (const p of paths) revalidatePath(p);
  return { status: "SAVED", message };
}

export async function agreementAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { session, store, now } = await context();
  const result = await acceptAgreement(
    { store, now },
    { id: session.sub, name: session.name, role: session.role, vendorId: session.vendorId },
    { signedByName: text(formData, "signedByName"), accepted: text(formData, "accepted") },
  );
  if (result.status === "ERROR") return { status: "ERROR", message: result.message };
  return done("Agreement accepted.", ["/vendor", "/vendor/team"]);
}

export async function createKeyAction(_p: FormState, _formData: FormData): Promise<FormState> {
  const { session, store, now } = await context();
  try {
    const result = await createOwnApiKey({ store, now }, session);
    if (result.status === "ERROR") return { status: "ERROR", message: result.message };
    revalidatePath("/vendor/api-keys");
    revalidatePath("/vendor");
    return { status: "SAVED", message: "Key created. Copy it now.", secret: result.secret };
  } catch (error) {
    console.error("Create key failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "ERROR", message: "Could not create the key. Try again." };
  }
}

export async function revokeKeyAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { session, store, now } = await context();
  const result = await revokeOwnApiKey({ store, now }, session, text(formData, "keyId") ?? "");
  if (result.status === "ERROR") return { status: "ERROR", message: result.message };
  return done("Key revoked. It stops working at once.", ["/vendor/api-keys"]);
}

export async function saveSettingsAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { session, store, now } = await context();
  let settings: unknown;
  try {
    settings = JSON.parse(text(formData, "settings") ?? "");
  } catch {
    return { status: "ERROR", message: "Settings are not valid." };
  }
  const result = await saveOwnSettings({ store, now }, session, settings);
  if (result.status === "ERROR") return { status: "ERROR", message: result.message };
  return done("Settings saved. The next risk check uses them.", ["/vendor/settings", "/vendor"]);
}

const actorOf = (s: Awaited<ReturnType<typeof requireSession>>) => ({
  type: "VENDOR" as const,
  id: s.sub,
  name: s.name,
  role: s.role,
  vendorId: s.vendorId,
});

export async function inviteStaffAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { session, store, now } = await context();
  try {
    const result = await inviteVendorUser(
      {
        store,
        inviter: getInviter(() => store as InMemoryStore),
        redirectTo: `${await siteOrigin()}${SET_PASSWORD_PATH}`,
        now,
      },
      actorOf(session),
      { vendorId: session.vendorId, email: text(formData, "email"), name: text(formData, "name"), role: "STAFF" },
    );
    if (result.status === "ERROR") return { status: "ERROR", message: result.message };
    return done(result.message, ["/vendor/team"]);
  } catch (error) {
    console.error("Invite failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "ERROR", message: "Could not add the user. Try again." };
  }
}

export async function userStatusAction(_p: FormState, formData: FormData): Promise<FormState> {
  const { session, store, now } = await context();
  const result = await setVendorUserStatus({ store, now }, actorOf(session), {
    vendorId: session.vendorId,
    userId: text(formData, "userId"),
    status: text(formData, "status"),
  });
  if (result.status === "ERROR") return { status: "ERROR", message: result.message };
  return done(result.message, ["/vendor/team"]);
}
