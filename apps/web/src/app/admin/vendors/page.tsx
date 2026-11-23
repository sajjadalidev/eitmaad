import type { Metadata } from "next";
import { DataTable } from "@/components/data-table";

export const metadata: Metadata = { title: "Vendors and KYC" };

const DOCUMENTS = [
  ["Private Ltd", "SECP certificate + NTN", "None"],
  ["Partnership", "Firm registration + NTN", "None"],
  ["Sole proprietor", "NTN in owner's name", "Owner CNIC + one business proof"],
] as const;

const CHECKS = [
  "NTN appears on the FBR Active Taxpayer List.",
  "CNIC is not already used by another vendor.",
  "Store ownership is proven by a plugin or app install.",
  "Data sharing agreement is accepted.",
];

const RED_FLAGS = [
  "Brand-new store with no order history.",
  "CNIC name and business name do not match.",
  "Many failures reported right after joining.",
];

export default function AdminVendorsPage() {
  return (
    <>
      <h1>Vendors and KYC</h1>
      <DataTable
        columns={["Applied", "Business", "Category", "KYC level", "Status", ""]}
        rows={[]}
        emptyMessage="No applications."
      />
      <h2>Accepted documents</h2>
      <DataTable
        columns={["Business type", "Full KYC (trust up to 1.0)", "Light KYC (trust up to 0.7)"]}
        rows={DOCUMENTS.map((r) => [...r])}
      />
      <div className="grid grid-2">
        <div className="card">
          <h3>Before approving</h3>
          <ul className="check-list">
            {CHECKS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Red flags</h3>
          <ul>
            {RED_FLAGS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
