"use server";

import { headers } from "next/headers";
import { HONEYPOT_FIELD, submitApplication } from "@/server/applications";
import { getRuntime } from "@/server/config";

export interface JoinState {
  status: "IDLE" | "RECEIVED" | "ERROR";
  message: string | null;
  fields: string[];
}

const FIELD_LABELS: Record<string, string> = {
  legal_name: "Business legal name",
  display_name: "Store or brand name",
  category: "Category",
  business_type: "Business type",
  platform: "Store platform",
  store_url: "Store website",
  contact_name: "Your name",
  contact_email: "Work email",
};

function clientIp(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}

export async function joinAction(_previous: JoinState, formData: FormData): Promise<JoinState> {
  const input: Record<string, unknown> = {};
  for (const key of [...Object.keys(FIELD_LABELS), HONEYPOT_FIELD]) {
    const value = formData.get(key);
    if (typeof value === "string") input[key] = value;
  }

  try {
    const runtime = getRuntime();
    const result = await submitApplication(
      { store: runtime.store, pepper: runtime.pepper, now: new Date() },
      input,
      clientIp(await headers()),
    );

    switch (result.status) {
      case "RECEIVED":
        return { status: "RECEIVED", message: null, fields: [] };
      case "INVALID_INPUT":
        return {
          status: "ERROR",
          message: `Please check: ${result.fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}.`,
          fields: result.fields,
        };
      case "ALREADY_RECEIVED":
        return {
          status: "ERROR",
          message: "We already have your application. We will contact you after review.",
          fields: [],
        };
      case "TOO_MANY":
        return { status: "ERROR", message: "Too many applications from your network. Try again later.", fields: [] };
    }
  } catch (error) {
    // Log only the error message, never the form contents.
    console.error("Join form failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "ERROR", message: "Applications are not available right now. Please try again later.", fields: [] };
  }
}
