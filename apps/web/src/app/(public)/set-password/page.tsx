import type { Metadata } from "next";
import { envValue } from "@/server/env";
import { SetPasswordForm } from "./set-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set your password", robots: { index: false } };

export default function SetPasswordPage() {
  const url = envValue("SUPABASE_URL");
  // The publishable key is safe in the browser; it can only do what a normal visitor can.
  const publishableKey = envValue("SUPABASE_PUBLISHABLE_KEY");

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 520 }}>
        {url && publishableKey ? (
          <SetPasswordForm url={url} publishableKey={publishableKey} />
        ) : (
          <div className="card stack">
            <h1 style={{ fontSize: "1.6rem" }}>Set your password</h1>
            <p className="muted">Local development: no password is needed. Log in with the dev password.</p>
          </div>
        )}
      </div>
    </section>
  );
}
