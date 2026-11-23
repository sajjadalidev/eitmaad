import { describe, expect, it } from "vitest";
import { LoginRateLimiter, attemptLogin, safeNextPath, sessionFor } from "./login";
import { hashPassword, verifyPassword } from "./passwords";
import { signSession, verifySession, type SessionPayload } from "./session";
import { DevAuthenticator, SupabaseAuthenticator, type DevUser, type PortalUser } from "./users";

const NOW = new Date("2026-11-20T12:00:00Z");
const SECRET = "test-session-secret-0123456789-abcdef";

const owner: DevUser = {
  id: "u1",
  email: "owner@shop.test",
  name: "Owner",
  kind: "vendor",
  role: "OWNER",
  vendorId: "v1",
  passwordHash: hashPassword("right-password"),
  status: "ACTIVE",
};

function deps(users: DevUser[] = [owner], limiter = new LoginRateLimiter()) {
  return { authenticator: new DevAuthenticator(users), limiter, now: NOW };
}

describe("SupabaseAuthenticator", () => {
  const portalUser: PortalUser = {
    id: "admin-1",
    email: "admin@etimaad.pk",
    name: "Admin",
    kind: "admin",
    role: "ADMIN",
    vendorId: null,
    status: "ACTIVE",
  };
  const signIn = async (email: string, password: string) =>
    email === "admin@etimaad.pk" && password === "right" ? { authUserId: "auth-1" } : null;
  const lookup = (users: Record<string, PortalUser>) => ({
    findPortalUserByAuthId: async (id: string) => users[id] ?? null,
  });

  it("returns the mapped user for a correct password", async () => {
    const auth = new SupabaseAuthenticator(signIn, lookup({ "auth-1": portalUser }));
    expect(await auth.verify("admin@etimaad.pk", "right")).toEqual(portalUser);
  });

  it("rejects a wrong password", async () => {
    const auth = new SupabaseAuthenticator(signIn, lookup({ "auth-1": portalUser }));
    expect(await auth.verify("admin@etimaad.pk", "wrong")).toBeNull();
  });

  it("rejects a Supabase user that is not an admin or vendor user", async () => {
    const auth = new SupabaseAuthenticator(signIn, lookup({}));
    expect(await auth.verify("admin@etimaad.pk", "right")).toBeNull();
  });

  it("rejects a disabled user", async () => {
    const auth = new SupabaseAuthenticator(signIn, lookup({ "auth-1": { ...portalUser, status: "DISABLED" } }));
    expect(await auth.verify("admin@etimaad.pk", "right")).toBeNull();
  });

  it("works through attemptLogin", async () => {
    const auth = new SupabaseAuthenticator(signIn, lookup({ "auth-1": portalUser }));
    const r = await attemptLogin(
      { email: "Admin@Etimaad.pk", password: "right" },
      { authenticator: auth, limiter: new LoginRateLimiter(), now: NOW },
    );
    expect(r.ok && r.value.kind).toBe("admin");
  });
});

describe("passwords", () => {
  it("verifies only the right password", () => {
    const stored = hashPassword("secret");
    expect(verifyPassword("secret", stored)).toBe(true);
    expect(verifyPassword("Secret", stored)).toBe(false);
    expect(verifyPassword("secret", "garbage")).toBe(false);
  });
});

describe("attemptLogin", () => {
  it("logs in with the right password, any email case", async () => {
    const r = await attemptLogin({ email: " Owner@Shop.test ", password: "right-password" }, deps());
    expect(r.ok && r.value.id).toBe("u1");
    expect(r.ok && "passwordHash" in r.value).toBe(false);
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const wrong = await attemptLogin({ email: "owner@shop.test", password: "nope" }, deps());
    const unknown = await attemptLogin({ email: "nobody@shop.test", password: "nope" }, deps());
    expect(wrong).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(unknown).toEqual(wrong);
  });

  it("rejects disabled users and bad input", async () => {
    const disabled = await attemptLogin(
      { email: "owner@shop.test", password: "right-password" },
      deps([{ ...owner, status: "DISABLED" }]),
    );
    expect(disabled).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(await attemptLogin({ email: "not-an-email", password: "x" }, deps())).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
  });

  it("blocks after 5 failures, even with the right password", async () => {
    const d = deps();
    for (let i = 0; i < 5; i++) await attemptLogin({ email: "owner@shop.test", password: "nope" }, d);
    const blocked = await attemptLogin({ email: "owner@shop.test", password: "right-password" }, d);
    expect(blocked).toEqual({ ok: false, code: "TOO_MANY_ATTEMPTS" });
    const later = await attemptLogin(
      { email: "owner@shop.test", password: "right-password" },
      { ...d, now: new Date(NOW.getTime() + 16 * 60_000) },
    );
    expect(later.ok).toBe(true);
  });
});

describe("session cookie", () => {
  const { passwordHash: _hash, ...ownerUser } = owner;
  const payload: SessionPayload = sessionFor(ownerUser, NOW);

  it("round-trips a valid session", async () => {
    const token = await signSession(payload, SECRET);
    expect(await verifySession(token, SECRET, NOW)).toEqual(payload);
  });

  it("rejects a changed payload, a wrong secret and an expired session", async () => {
    const token = await signSession(payload, SECRET);
    const [body, sig] = token.split(".");
    const forged = await signSession({ ...payload, kind: "admin" }, SECRET);
    const swapped = `${forged.split(".")[0]}.${sig}`;

    expect(await verifySession(swapped, SECRET, NOW)).toBeNull();
    expect(await verifySession(`${body}.${sig}x`, SECRET, NOW)).toBeNull();
    expect(await verifySession(token, `${SECRET}x`, NOW)).toBeNull();
    expect(await verifySession(token, SECRET, new Date(NOW.getTime() + 13 * 3_600_000))).toBeNull();
    expect(await verifySession("garbage", SECRET, NOW)).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("allows only the user's own area", () => {
    expect(safeNextPath("/vendor/settings", "vendor")).toBe("/vendor/settings");
    expect(safeNextPath("/admin", "vendor")).toBe("/vendor");
    expect(safeNextPath("//evil.example", "vendor")).toBe("/vendor");
    expect(safeNextPath("https://evil.example", "admin")).toBe("/admin");
    expect(safeNextPath("/vendorx", "vendor")).toBe("/vendor");
    expect(safeNextPath(null, "admin")).toBe("/admin");
  });
});
