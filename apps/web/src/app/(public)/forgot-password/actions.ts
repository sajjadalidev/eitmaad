"use server";

import { z } from "zod";
import { getInviter } from "@/server/account-invites";
import { getRuntime } from "@/server/config";
import type { InMemoryStore } from "@/server/memory-store";
import { SET_PASSWORD_PATH, siteOrigin } from "@/server/site-url";

export interface ForgotState {
  status: "IDLE" | "SENT" | "ERROR";
  message: string | null;
}

// Same answer whether or not the email has an account, so emails cannot be guessed.
const SENT: ForgotState = {
  status: "SENT",
  message: "If this email has an Etimaad login, a link to set a new password is on its way. Check your inbox and spam folder.",
};

export async function forgotAction(_previous: ForgotState, formData: FormData): Promise<ForgotState> {
  const parsed = z.string().trim().toLowerCase().email().max(320).safeParse(formData.get("email"));
  if (!parsed.success) return { status: "ERROR", message: "Enter your work email." };

  const inviter = getInviter(() => getRuntime().store as InMemoryStore);
  if (!inviter) return { status: "ERROR", message: "Password reset is not available right now. Contact support." };
  await inviter.sendPasswordLink(parsed.data, `${await siteOrigin()}${SET_PASSWORD_PATH}`);
  return SENT;
}
