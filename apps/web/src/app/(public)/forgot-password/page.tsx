import type { Metadata } from "next";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 520 }}>
        <ForgotForm />
      </div>
    </section>
  );
}
