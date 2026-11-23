"use server";

import { revalidatePath } from "next/cache";
import { reviewApplication } from "@/server/application-review";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import type { NewVendorCredentials } from "@/server/store";
import { getInviter } from "@/server/account-invites";
import type { InMemoryStore } from "@/server/memory-store";
import { SET_PASSWORD_PATH, siteOrigin } from "@/server/site-url";
import { inviteVendorUser } from "@/server/vendor-accounts";

export interface ReviewState {
  status: "IDLE" | "SAVED" | "ERROR";
  message: string | null;
  // Shown once, right after approval. Never stored in plain text.
  credentials: NewVendorCredentials | null;
  // What happened with the owner invite after approval.
  invite?: string | null;
}

async function inviteOwner(
  session: Awaited<ReturnType<typeof requireSession>>,
  applicationId: string,
  vendorId: string,
): Promise<string> {
  try {
    const { store } = getRuntime();
    const application = await store.getApplication(applicationId);
    if (!application) return "Owner invite not sent: application not found.";
    const result = await inviteVendorUser(
      {
        store,
        inviter: getInviter(() => store as InMemoryStore),
        redirectTo: `${await siteOrigin()}${SET_PASSWORD_PATH}`,
        now: new Date(),
      },
      { type: "ADMIN", id: session.sub, name: session.name, role: session.role, vendorId: null },
      { vendorId, email: application.contactEmail, name: application.contactName, role: "OWNER" },
    );
    return result.status === "ERROR"
      ? `Owner invite not sent: ${result.message} Use "Invite a user" on the vendor profile.`
      : result.message;
  } catch (error) {
    console.error("Owner invite failed:", error instanceof Error ? error.message : "unknown error");
    return 'Owner invite not sent. Use "Invite a user" on the vendor profile.';
  }
}

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
};

export async function reviewAction(_previous: ReviewState, formData: FormData): Promise<ReviewState> {
  const session = await requireSession("admin");
  const applicationId = text(formData, "applicationId");

  try {
    const result = await reviewApplication(
      { store: getRuntime().store, now: new Date() },
      { id: session.sub, name: session.name, role: session.role },
      {
        applicationId,
        action: text(formData, "action"),
        note: text(formData, "note"),
        documents: formData.getAll("documents").filter((v) => typeof v === "string"),
        checks: formData.getAll("checks").filter((v) => typeof v === "string"),
        kycLevel: text(formData, "kycLevel"),
        trustWeight: text(formData, "trustWeight"),
      },
    );
    if (result.status === "ERROR") return { status: "ERROR", message: result.message, credentials: null };

    revalidatePath(`/admin/applications/${applicationId}`);
    revalidatePath("/admin/vendors");
    revalidatePath("/admin/applications");
    revalidatePath("/admin");

    // After approval, invite the applicant as the store owner so they set their own password.
    let invite: string | null = null;
    if (result.credentials && applicationId) {
      invite = await inviteOwner(session, applicationId, result.credentials.vendorId);
    }
    return { status: "SAVED", message: "Saved.", credentials: result.credentials ?? null, invite };
  } catch (error) {
    // Log the error only, never form contents or keys.
    console.error("Application review failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "ERROR", message: "Could not save. Please try again.", credentials: null };
  }
}
