"use server";

import { revalidatePath } from "next/cache";
import { reviewApplication } from "@/server/application-review";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import type { NewVendorCredentials } from "@/server/store";

export interface ReviewState {
  status: "IDLE" | "SAVED" | "ERROR";
  message: string | null;
  // Shown once, right after approval. Never stored in plain text.
  credentials: NewVendorCredentials | null;
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
    return { status: "SAVED", message: "Saved.", credentials: result.credentials ?? null };
  } catch (error) {
    // Log the error only, never form contents or keys.
    console.error("Application review failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "ERROR", message: "Could not save. Please try again.", credentials: null };
  }
}
