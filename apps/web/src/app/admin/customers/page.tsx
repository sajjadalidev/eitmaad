import type { Metadata } from "next";
import { requireSession } from "@/server/require-session";
import { SearchForm } from "./forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Customers" };

export default async function AdminCustomersPage() {
  await requireSession("admin");
  return (
    <>
      <h1>Customers</h1>
      <p className="muted">
        Find a customer by mobile number to see their risk level, how the score was made, and what each store
        reported. Use it for support calls and disputes only.
      </p>
      <SearchForm />
      <div className="card stack">
        <h2>Privacy rules</h2>
        <ul className="check-list">
          <li>The number is turned into a secure code (hash) at once. It is never saved or written to logs.</li>
          <li>Every search and every view is written to the audit log with your name.</li>
          <li>Never copy customer data out of the console.</li>
        </ul>
      </div>
    </>
  );
}
