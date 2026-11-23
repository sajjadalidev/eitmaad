import { DEFAULT_VENDOR_SETTINGS, parseVendorSettings } from "@etimaad/core";
import type { Metadata } from "next";
import { OwnerOnly } from "@/components/owner-only";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import { SettingsEditor } from "./settings-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

export default async function VendorSettingsPage() {
  const session = await requireSession("vendor");
  const vendor = session.vendorId ? await getRuntime().store.getVendor(session.vendorId) : null;
  const parsed = parseVendorSettings(vendor?.settings ?? {});
  const initial = parsed.ok ? parsed.value : DEFAULT_VENDOR_SETTINGS;

  return (
    <OwnerOnly title="Settings">
      <h1>Settings</h1>
      <p className="muted">
        Choose what to do for each risk level. Rules can only make an action stricter, never looser. The preview
        uses the same code as the live API.
      </p>
      <SettingsEditor initial={initial} />
    </OwnerOnly>
  );
}
