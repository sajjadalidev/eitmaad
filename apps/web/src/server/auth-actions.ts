"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOGIN_MESSAGES, LoginRateLimiter, attemptLogin, safeNextPath, sessionFor } from "./login";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, getSessionSecret, signSession } from "./session";
import { getUserDirectory } from "./users";

export interface LoginState {
  error: string | null;
}

const globalForLogin = globalThis as unknown as { etimaadLoginLimiter?: LoginRateLimiter };

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const directory = getUserDirectory();
  const secret = getSessionSecret();
  if (!directory || !secret) return { error: "Login is not available yet." };

  globalForLogin.etimaadLoginLimiter ??= new LoginRateLimiter();
  const now = new Date();
  const result = await attemptLogin(
    { email: formData.get("email"), password: formData.get("password") },
    { directory, limiter: globalForLogin.etimaadLoginLimiter, now },
  );
  if (!result.ok) return { error: LOGIN_MESSAGES[result.code] };

  const user = result.value;
  const token = await signSession(sessionFor(user, now), secret);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  redirect(safeNextPath(formData.get("next"), user.kind));
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
