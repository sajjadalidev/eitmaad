"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const MIN_LENGTH = 10;

type Stage = "CHECKING" | "READY" | "SAVING" | "DONE" | "INVALID";

// Reads the one-time link from the email (invite or password reset) and lets the person choose a password.
export function SetPasswordForm({ url, publishableKey }: { url: string; publishableKey: string }) {
  const supabase: SupabaseClient = useMemo(
    () =>
      createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    [url, publishableKey],
  );
  const [stage, setStage] = useState<Stage>("CHECKING");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      // Remove the one-time tokens from the address bar and history.
      window.history.replaceState(null, "", window.location.pathname);

      let ok = false;
      if (hash.get("access_token") && hash.get("refresh_token")) {
        const { error: e } = await supabase.auth.setSession({
          access_token: hash.get("access_token")!,
          refresh_token: hash.get("refresh_token")!,
        });
        ok = !e;
      } else if (query.get("token_hash") && query.get("type")) {
        const type = query.get("type") === "invite" ? "invite" : "recovery";
        const { error: e } = await supabase.auth.verifyOtp({ token_hash: query.get("token_hash")!, type });
        ok = !e;
      }
      const { data } = ok ? await supabase.auth.getUser() : { data: { user: null } };
      if (cancelled) return;
      if (data.user) {
        setEmail(data.user.email ?? null);
        setStage("READY");
      } else {
        setStage("INVALID");
      }
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("The two passwords do not match.");
    setError(null);
    setStage("SAVING");
    const { error: e2 } = await supabase.auth.updateUser({ password });
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    if (e2) {
      setError(e2.message.includes("different") ? "Choose a password you have not used before." : "Could not save the password. Try again.");
      setStage("READY");
      return;
    }
    setStage("DONE");
  }

  if (stage === "CHECKING") {
    return (
      <div className="card" role="status">
        <p className="muted">Checking your link...</p>
      </div>
    );
  }

  if (stage === "INVALID") {
    return (
      <div className="card stack" role="alert">
        <h1 style={{ fontSize: "1.6rem" }}>This link does not work</h1>
        <p>The link has expired or was already used. Links work once and only for a short time.</p>
        <p>
          <Link className="btn btn-primary" href="/forgot-password">
            Get a new link
          </Link>
        </p>
      </div>
    );
  }

  if (stage === "DONE") {
    return (
      <div className="card stack" role="status">
        <h1 style={{ fontSize: "1.6rem" }}>Password saved</h1>
        <p>You can now log in with your email and the new password.</p>
        <p>
          <Link className="btn btn-primary" href="/login">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form className="form card" onSubmit={onSubmit}>
      <h1 style={{ fontSize: "1.6rem" }}>Set your password</h1>
      {email && <p className="muted small">For {email}</p>}
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_LENGTH} required />
      </div>
      <div className="field">
        <label htmlFor="confirm">Type it again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={MIN_LENGTH} required />
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={stage === "SAVING"}>
        {stage === "SAVING" ? "Saving..." : "Save password"}
      </button>
      <p className="muted small">At least {MIN_LENGTH} characters. Etimaad never sees or stores your password.</p>
    </form>
  );
}
