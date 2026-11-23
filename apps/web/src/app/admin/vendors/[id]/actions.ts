"use server";

import { revalidatePath } from "next/cache";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import { manageVendor } from "@/server/vendor-management";
import { getInviter } from "@/server/account-invites";
import type { InMemoryStore } from "@/server/memory-store";
import { SET_PASSWORD_PATH, siteOrigin } from "@/server/site-url";
import { inviteVendorUser, setVendorUserStatus } from "@/server/vendor-accounts";

export interface VendorActionState {
  status: "IDLE" | "SAVED" | "ERROR";
  message: string | null;
}

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
};

const adminActor = (s: Awaited<ReturnType<typeof requireSession>>) => ({
  type: "ADMIN" as const,
  id: s.sub,
  name: s.name,
  role: s.role,
  vendorId: null,
});

export async function inviteUserAction(_previous: VendorActionState, formData: FormData): Promise<VendorActionState> {
  const session = await requireSession("admin");
  const vendorId = text(formData, "vendorId");
  try {
    const { store } = getRuntime();
    const result = await inviteVendorUser(
      {
        store,
        inviter: getInviter(() => store as InMemoryStore),
        redirectTo: `${await siteOrigin()}${SET_PASSWORD_PATH}`,
        now: new Date(),
      },
      adminActor(session),
      { vendorId, email: text(formData, "email"), name: text(formData, "name"), role: text(formData, "role") },
    );
    if (result.status === "ERROR") return { status: "ERROR", message: result.message };
    revalidatePath(`/admin/vendors/${vendorId}`);
    return { status: "SAVED", message: result.message };
  } catch (error) {
    console.error("Invite failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "ERROR", message: "Could not send the invite. Try again." };
  }
}

export async function userStatusAdminAction(_previous: VendorActionState, formData: FormData): Promise<VendorActionState> {
  const session = await requireSession("admin");
  const vendorId = text(formData, "vendorId");
  const result = await setVendorUserStatus({ store: getRuntime().store, now: new Date() }, adminActor(session), {
    vendorId,
    userId: text(formData, "userId"),
    status: text(formData, "status"),
  });
  if (result.status === "ERROR") return { status: "ERROR", message: result.message };
  revalidatePath(`/admin/vendors/${vendorId}`);
  return { status: "SAVED", message: result.message };
}

export async function vendorAction(_previous: VendorActionState, formData: FormData): Promise<VendorActionState> {
  const session = await requireSession("admin");
  const vendorId = text(formData, "vendorId");

  try {
    const result = await manageVendor(
      { store: getRuntime().store, now: new Date() },
      { id: session.sub, name: session.name, role: session.role },
      {
        vendorId,
        action: text(formData, "action"),
        note: text(formData, "note"),
        trustWeight: text(formData, "trustWeight"),
        targetStatus: text(formData, "targetStatus"),
        keyId: text(formData, "keyId"),
      },
    );
    if (result.status === "ERROR") return { status: "ERROR", message: result.message };

    revalidatePath(`/admin/vendors/${vendorId}`);
    revalidatePath("/admin/vendors");
    revalidatePath("/admin");
    return { status: "SAVED", message: "Saved." };
  } catch (error) {
    console.error("Vendor action failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "ERROR", message: "Could not save. Please try again." };
  }
}
