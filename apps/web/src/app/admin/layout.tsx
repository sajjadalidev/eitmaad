import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal-shell";
import { requireSession } from "@/server/require-session";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" } };

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/vendors", label: "Vendors and KYC" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/scoring", label: "Scoring model" },
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("admin");
  return (
    <PortalShell area="Admin console" items={NAV} user={session}>
      {children}
    </PortalShell>
  );
}
