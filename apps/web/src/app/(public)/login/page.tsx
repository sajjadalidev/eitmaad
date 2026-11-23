import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const devHint = process.env.NODE_ENV !== "production";

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 440 }}>
        <LoginForm next={typeof next === "string" ? next : ""} devHint={devHint} />
      </div>
    </section>
  );
}
