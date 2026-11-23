import type { Metadata } from "next";
import { OwnerOnly } from "@/components/owner-only";
import { SettingsEditor } from "./settings-editor";

export const metadata: Metadata = { title: "Settings" };

export default function VendorSettingsPage() {
  return (
    <OwnerOnly title="Settings">
      <h1>Settings</h1>
      <p className="muted">
        Choose what to do for each risk level. Rules can only make an action stricter, never looser. The preview
        uses the same code as the live API.
      </p>
      <SettingsEditor />
    </OwnerOnly>
  );
}
