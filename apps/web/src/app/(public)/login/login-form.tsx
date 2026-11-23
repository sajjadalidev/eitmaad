"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/server/auth-actions";

const INITIAL: LoginState = { error: null };

export function LoginForm({ next, devHint }: { next: string; devHint: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);

  return (
    <form className="form card" action={formAction}>
      <h1 style={{ fontSize: "1.6rem" }}>Log in</h1>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p className="notice" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Logging in..." : "Log in"}
      </button>
      {devHint && (
        <p className="muted small">
          Local development: use the accounts in <code>apps/web/src/server/dev-credentials.json</code>.
        </p>
      )}
    </form>
  );
}
