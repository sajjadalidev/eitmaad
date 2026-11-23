// Sends account emails so a person sets their own password (blueprint section 20.5).
// Production: Supabase Auth sends the invite and reset emails. Etimaad never sees the password.
// Development: no email; the invited person logs in with the dev password.

import { createClient } from "@supabase/supabase-js";
import { envValue } from "./env";
import type { InMemoryStore } from "./memory-store";

export type InviteResult =
  | { status: "INVITED"; authUserId: string }
  | { status: "EXISTS" }
  | { status: "ERROR"; message: string };

export interface AccountInviter {
  // Creates the login and emails a link to set a password.
  invite(email: string, name: string, redirectTo: string): Promise<InviteResult>;
  // Emails a link to set a new password for an existing login.
  sendPasswordLink(email: string, redirectTo: string): Promise<boolean>;
  // True when real emails are sent.
  readonly sendsEmail: boolean;
}

export class SupabaseInviter implements AccountInviter {
  readonly sendsEmail = true;

  constructor(
    private readonly url: string,
    private readonly secretKey: string,
    private readonly publishableKey: string,
  ) {}

  async invite(email: string, name: string, redirectTo: string): Promise<InviteResult> {
    const admin = createClient(this.url, this.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { name } });
    if (!error && data.user) return { status: "INVITED", authUserId: data.user.id };
    if (error && (error.code === "email_exists" || /already been registered|already exists/i.test(error.message))) {
      return { status: "EXISTS" };
    }
    return { status: "ERROR", message: error?.message ?? "Invite failed." };
  }

  async sendPasswordLink(email: string, redirectTo: string): Promise<boolean> {
    const client = createClient(this.url, this.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) console.warn("Password link failed:", error.message);
    return !error;
  }
}

export class DevInviter implements AccountInviter {
  readonly sendsEmail = false;

  constructor(private readonly store: InMemoryStore) {}

  async invite(email: string): Promise<InviteResult> {
    const key = email.trim().toLowerCase();
    if (this.store.devAuthUsers.has(key)) return { status: "EXISTS" };
    const authUserId = crypto.randomUUID();
    this.store.devAuthUsers.set(key, authUserId);
    console.info("[dev] Invite created. No email is sent locally; log in with the dev password.");
    return { status: "INVITED", authUserId };
  }

  async sendPasswordLink(): Promise<boolean> {
    console.info("[dev] Password link requested. No email is sent locally.");
    return true;
  }
}

export function supabaseInviterConfigured(): boolean {
  return (
    envValue("SUPABASE_URL") !== "" &&
    envValue("SUPABASE_PUBLISHABLE_KEY") !== "" &&
    envValue("SUPABASE_SERVICE_ROLE_KEY") !== ""
  );
}

// Supabase in production (or with ETIMAAD_AUTH=supabase), else the dev inviter. Null when not configured.
export function getInviter(devStore: () => InMemoryStore): AccountInviter | null {
  const useSupabase = process.env.NODE_ENV === "production" || process.env.ETIMAAD_AUTH === "supabase";
  if (useSupabase) {
    if (!supabaseInviterConfigured()) return null;
    return new SupabaseInviter(
      envValue("SUPABASE_URL"),
      envValue("SUPABASE_SERVICE_ROLE_KEY"),
      envValue("SUPABASE_PUBLISHABLE_KEY"),
    );
  }
  return new DevInviter(devStore());
}
