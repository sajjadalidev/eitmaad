"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotAction, type ForgotState } from "./actions";

const INITIAL: ForgotState = { status: "IDLE", message: null };

export function ForgotForm() {
  const [state, formAction, pending] = useActionState(forgotAction, INITIAL);

  if (state.status === "SENT") {
    return (
      <div className="card stack" role="status">
        <h1 style={{ fontSize: "1.6rem" }}>Check your email</h1>
        <p>{state.message}</p>
        <p className="muted small">The link works once and only for a short time.</p>
        <p>
          <Link href="/login">Back to log in</Link>
        </p>
      </div>
    );
  }

  return (
    <form className="form card" action={formAction}>
      <h1 style={{ fontSize: "1.6rem" }}>Forgot password</h1>
      <p className="muted">Enter your work email. We will send a link to set a new password.</p>
      <div className="field">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={320} />
      </div>
      {state.status === "ERROR" && state.message && (
        <p className="notice" role="alert">
          {state.message}
        </p>
      )}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Sending..." : "Send link"}
      </button>
      <p className="small">
        <Link href="/login">Back to log in</Link>
      </p>
    </form>
  );
}
