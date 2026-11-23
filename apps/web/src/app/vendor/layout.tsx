import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal-shell";
import { requireSession } from "@/server/require-session";

export const metadata: Metadata = { title: { default: "Vendor portal", template: "%s | Vendor portal" } };

const NAV = [
  { href: "/vendor", label: "Overview" },
  { href: "/vendor/orders", label: "Orders" },
  { href: "/vendor/disputes", label: "Disputes" },
  { href: "/vendor/api-keys", label: "API keys" },
  { href: "/vendor/settings", label: "Settings" },
] as const;

export default async function VendorLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("vendor");
  return (
    <PortalShell area="Vendor portal" items={NAV} user={session}>
      {children}
    </PortalShell>
  );
}
