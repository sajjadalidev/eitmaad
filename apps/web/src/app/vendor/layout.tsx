import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal-shell";
import { AGREEMENT_POINTS, AGREEMENT_VERSION, hasCurrentAgreement } from "@/server/agreement";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import { AgreementGate } from "./agreement-gate";

export const metadata: Metadata = { title: { default: "Vendor portal", template: "%s | Vendor portal" } };

const NAV = [
  { href: "/vendor", label: "Overview" },
  { href: "/vendor/orders", label: "Orders" },
  { href: "/vendor/disputes", label: "Disputes" },
  { href: "/vendor/api-keys", label: "API keys" },
  { href: "/vendor/settings", label: "Settings" },
  { href: "/vendor/team", label: "Team" },
] as const;

async function agreementAccepted(vendorId: string | null): Promise<boolean> {
  if (!vendorId) return false;
  try {
    return await hasCurrentAgreement(getRuntime().store, vendorId);
  } catch {
    // If the check fails, do not lock the vendor out of their own data.
    return true;
  }
}

export default async function VendorLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("vendor");
  const accepted = await agreementAccepted(session.vendorId);
  return (
    <PortalShell area="Vendor portal" items={NAV} user={session}>
      {accepted ? (
        children
      ) : (
        <AgreementGate points={AGREEMENT_POINTS} version={AGREEMENT_VERSION} isOwner={session.role === "OWNER"} />
      )}
    </PortalShell>
  );
}
