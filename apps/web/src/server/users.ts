// Portal login (blueprint section 20.5).
// Development: local dev accounts from dev-credentials.json.
// Production: Supabase Auth checks the password, then ADMIN_USERS or VENDOR_USERS decide the role.
// Etimaad keeps its own signed session cookie; no Supabase session is kept.

import { createClient } from "@supabase/supabase-js";
import credentials from "./dev-credentials.json";
import { envValue } from "./env";
import { hashPassword, verifyPassword } from "./passwords";
import type { SessionKind } from "./session";

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  kind: SessionKind;
  role: string;
  vendorId: string | null;
  status: "ACTIVE" | "DISABLED";
}

export interface Authenticator {
  // Returns the user only for a correct password and an ACTIVE account.
  verify(email: string, password: string): Promise<PortalUser | null>;
}

// ---------- Development ----------

export interface DevUser extends PortalUser {
  passwordHash: string;
}

let dummyHash: string | null = null;

export class DevAuthenticator implements Authenticator {
  private readonly byEmail = new Map<string, DevUser>();

  constructor(users: readonly DevUser[]) {
    for (const user of users) this.byEmail.set(user.email.toLowerCase(), user);
  }

  // Users invited locally (not in dev-credentials.json) log in with the same dev password.
  invitedLookup: ((email: string) => Promise<PortalUser | null>) | null = null;
  devPasswordHash: string | null = null;

  async verify(email: string, password: string): Promise<PortalUser | null> {
    const key = email.trim().toLowerCase();
    const user = this.byEmail.get(key);
    // Hash even for unknown emails, so the response time does not reveal which emails exist.
    dummyHash ??= hashPassword("not-a-real-password");
    const passwordOk = verifyPassword(password, user?.passwordHash ?? this.devPasswordHash ?? dummyHash);
    if (!user) {
      const invited = passwordOk && this.invitedLookup ? await this.invitedLookup(key) : null;
      return invited && invited.status === "ACTIVE" ? invited : null;
    }
    if (!passwordOk || user.status !== "ACTIVE") return null;
    const { passwordHash: _hash, ...portalUser } = user;
    return portalUser;
  }
}

function createDevAuthenticator(): DevAuthenticator {
  const passwordHash = hashPassword(credentials.devPassword);
  const auth = new DevAuthenticator(
    credentials.users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      kind: u.kind === "admin" ? "admin" : "vendor",
      role: u.role,
      vendorId: u.vendorId,
      passwordHash,
      status: "ACTIVE",
    })),
  );
  auth.devPasswordHash = passwordHash;
  return auth;
}

// ---------- Production (Supabase Auth) ----------

export type SignInFn = (email: string, password: string) => Promise<{ authUserId: string } | null>;

export interface PortalUserLookup {
  findPortalUserByAuthId(authUserId: string): Promise<PortalUser | null>;
  // Only the local in-memory store has this.
  findDevPortalUserByEmail?(email: string): Promise<PortalUser | null>;
}

export class SupabaseAuthenticator implements Authenticator {
  constructor(
    private readonly signIn: SignInFn,
    private readonly lookup: PortalUserLookup,
  ) {}

  async verify(email: string, password: string): Promise<PortalUser | null> {
    const signedIn = await this.signIn(email, password);
    if (!signedIn) return null;
    const user = await this.lookup.findPortalUserByAuthId(signedIn.authUserId);
    return user && user.status === "ACTIVE" ? user : null;
  }
}

// Checks the password with Supabase, then ends that Supabase session at once.
export function supabaseSignIn(url: string, publishableKey: string): SignInFn {
  return async (email, password) => {
    const client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user) return null;
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { authUserId: data.user.id };
  };
}

export function supabaseAuthConfigured(): boolean {
  return envValue("SUPABASE_URL") !== "" && envValue("SUPABASE_PUBLISHABLE_KEY") !== "";
}

// ---------- Choice ----------

const globalForAuth = globalThis as unknown as { etimaadDevAuthenticator?: DevAuthenticator };

function useSupabase(): boolean {
  return process.env.NODE_ENV === "production" || process.env.ETIMAAD_AUTH === "supabase";
}

// Returns null when login is not available (Supabase not configured in production).
export function getAuthenticator(lookup: () => PortalUserLookup): Authenticator | null {
  if (useSupabase()) {
    if (!supabaseAuthConfigured()) return null;
    return new SupabaseAuthenticator(
      supabaseSignIn(envValue("SUPABASE_URL"), envValue("SUPABASE_PUBLISHABLE_KEY")),
      lookup(),
    );
  }
  globalForAuth.etimaadDevAuthenticator ??= createDevAuthenticator();
  const store = lookup();
  globalForAuth.etimaadDevAuthenticator.invitedLookup = store.findDevPortalUserByEmail
    ? (email) => store.findDevPortalUserByEmail!(email)
    : null;
  return globalForAuth.etimaadDevAuthenticator;
}
