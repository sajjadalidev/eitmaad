"use server";

import { revalidatePath } from "next/cache";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import { manageVendor } from "@/server/vendor-management";

export interface VendorActionState {
  status: "IDLE" | "SAVED" | "ERROR";
  message: string | null;
}

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
};

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
