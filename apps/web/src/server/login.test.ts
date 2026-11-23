import { describe, expect, it } from "vitest";
import { LoginRateLimiter, attemptLogin, safeNextPath, sessionFor } from "./login";
import { hashPassword, verifyPassword } from "./passwords";
import { signSession, verifySession, type SessionPayload } from "./session";
import { InMemoryUserDirectory, type PortalUser } from "./users";

const NOW = new Date("2026-11-20T12:00:00Z");
const SECRET = "test-session-secret-0123456789-abcdef";

const owner: PortalUser = {
  id: "u1",
  email: "owner@shop.test",
  name: "Owner",
  kind: "vendor",
  role: "OWNER",
  vendorId: "v1",
  passwordHash: hashPassword("right-password"),
  status: "ACTIVE",
};

function deps(users: PortalUser[] = [owner], limiter = new LoginRateLimiter()) {
  return { directory: new InMemoryUserDirectory(users), limiter, now: NOW };
}

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
  const payload: SessionPayload = sessionFor(owner, NOW);

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
