import type { ReactNode } from "react";
import { requireSession } from "@/server/require-session";

// Shows the page only to the vendor OWNER (blueprint section 8.1, VENDOR_USERS roles).
export async function OwnerOnly({ title, children }: { title: string; children: ReactNode }) {
  const session = await requireSession("vendor");
  if (session.role === "OWNER") return <>{children}</>;
  return (
    <>
      <h1>{title}</h1>
      <div className="card">
        <p>Only the account owner can open this page. Ask your owner for access.</p>
      </div>
    </>
  );
}
