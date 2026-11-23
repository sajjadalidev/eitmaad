"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntime } from "./config";
import { LOGIN_MESSAGES, LoginRateLimiter, attemptLogin, safeNextPath, sessionFor } from "./login";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, getSessionSecret, signSession } from "./session";
import { getAuthenticator } from "./users";

export interface LoginState {
  error: string | null;
}

const globalForLogin = globalThis as unknown as { etimaadLoginLimiter?: LoginRateLimiter };

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const unavailable = { error: "Login is not available right now. Please try again later." };
  const secret = getSessionSecret();
  if (!secret) return unavailable;

  globalForLogin.etimaadLoginLimiter ??= new LoginRateLimiter();
  const now = new Date();
  let result: Awaited<ReturnType<typeof attemptLogin>>;
  try {
    const authenticator = getAuthenticator(() => getRuntime().store);
    if (!authenticator) return unavailable;
    result = await attemptLogin(
      { email: formData.get("email"), password: formData.get("password") },
      { authenticator, limiter: globalForLogin.etimaadLoginLimiter, now },
    );
  } catch (error) {
    // Log only the error message, never the email or password.
    console.error("Login failed:", error instanceof Error ? error.message : "unknown error");
    return unavailable;
  }
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
