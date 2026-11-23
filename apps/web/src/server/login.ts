// Login checks, kept free of Next.js so they can be tested.

import { z } from "zod";
import { err, ok, type Result } from "@etimaad/core";
import { SESSION_TTL_SECONDS, homeFor, type SessionKind, type SessionPayload } from "./session";
import type { Authenticator, PortalUser } from "./users";

export type LoginError = "INVALID_INPUT" | "INVALID_CREDENTIALS" | "TOO_MANY_ATTEMPTS";

export const LOGIN_MESSAGES: Record<LoginError, string> = {
  INVALID_INPUT: "Enter your email and password.",
  INVALID_CREDENTIALS: "Email or password is wrong.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Try again in 15 minutes.",
};

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200),
});

// Blocks an email after too many failed attempts in a time window.
export class LoginRateLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60_000,
  ) {}

  private recent(key: string, now: Date): number[] {
    const since = now.getTime() - this.windowMs;
    const list = (this.failures.get(key) ?? []).filter((t) => t > since);
    this.failures.set(key, list);
    return list;
  }

  isBlocked(key: string, now: Date): boolean {
    return this.recent(key, now).length >= this.maxFailures;
  }

  recordFailure(key: string, now: Date): void {
    this.recent(key, now).push(now.getTime());
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}

export async function attemptLogin(
  input: { email: unknown; password: unknown },
  deps: { authenticator: Authenticator; limiter: LoginRateLimiter; now: Date },
): Promise<Result<PortalUser, LoginError>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return err("INVALID_INPUT");
  const { email, password } = parsed.data;

  if (deps.limiter.isBlocked(email, deps.now)) return err("TOO_MANY_ATTEMPTS");

  const user = await deps.authenticator.verify(email, password);
  if (!user) {
    deps.limiter.recordFailure(email, deps.now);
    return err("INVALID_CREDENTIALS");
  }

  deps.limiter.reset(email);
  return ok(user);
}

export function sessionFor(user: PortalUser, now: Date): SessionPayload {
  return {
    sub: user.id,
    kind: user.kind,
    name: user.name,
    email: user.email,
    role: user.role,
    vendorId: user.vendorId,
    exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS,
  };
}

// Only allows a redirect back into the user's own area. Blocks open redirects.
export function safeNextPath(next: unknown, kind: SessionKind): string {
  const home = homeFor(kind);
  if (typeof next !== "string") return home;
  const isOwnArea = next === home || next.startsWith(`${home}/`);
  const isPlainPath = /^\/[A-Za-z0-9/_-]*$/.test(next) && !next.startsWith("//");
  return isOwnArea && isPlainPath ? next : home;
}
