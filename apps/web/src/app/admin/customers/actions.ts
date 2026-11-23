"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRuntime } from "@/server/config";
import { findCustomerByPhone, recomputeForAdmin } from "@/server/customer-detail";
import { requireSession } from "@/server/require-session";

export interface CustomerActionState {
  status: "IDLE" | "SAVED" | "ERROR";
  message: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function searchAction(_previous: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const session = await requireSession("admin");
  const phone = formData.get("phone");
  if (typeof phone !== "string" || phone.trim() === "") return { status: "ERROR", message: "Enter a phone number." };

  let customerId: string | null = null;
  try {
    const runtime = getRuntime();
    const result = await findCustomerByPhone(
      { store: runtime.store, pepper: runtime.pepper, keyVersion: runtime.keyVersion, now: new Date() },
      { id: session.sub, name: session.name, role: session.role },
      phone,
    );
    if (result.status === "INVALID_PHONE") return { status: "ERROR", message: "This is not a Pakistani mobile number." };
    if (result.status === "NOT_FOUND") return { status: "ERROR", message: "No customer with this number in the network." };
    customerId = result.customerId;
  } catch (error) {
    // Never log the number.
    console.error("Customer search failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "ERROR", message: "Search failed. Please try again." };
  }
  // The page URL holds only the customer id, never the phone number.
  redirect(`/admin/customers/${customerId}`);
}

export async function recomputeAction(_previous: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const session = await requireSession("admin");
  const customerId = formData.get("customerId");
  if (typeof customerId !== "string" || !UUID.test(customerId)) return { status: "ERROR", message: "Invalid customer." };
  try {
    const result = await recomputeForAdmin(
      { store: getRuntime().store, now: new Date() },
      { id: session.sub, name: session.name, role: session.role },
      customerId,
    );
    if (result.status === "ERROR") return { status: "ERROR", message: result.message };
    revalidatePath(`/admin/customers/${customerId}`);
    return { status: "SAVED", message: "Score rebuilt from the latest orders." };
  } catch (error) {
    console.error("Recompute failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "ERROR", message: "Could not rebuild the score. Please try again." };
  }
}
