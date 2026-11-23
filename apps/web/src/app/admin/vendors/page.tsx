import type { Metadata } from "next";
import { DataTable } from "@/components/data-table";
import { getRuntime } from "@/server/config";
import type { VendorApplicationRecord } from "@/server/store";

export const dynamic = "force-dynamic";

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

const BUSINESS_TYPE_LABEL: Record<VendorApplicationRecord["businessType"], string> = {
  PVT_LTD: "Private Ltd",
  PARTNERSHIP: "Partnership",
  SOLE_PROPRIETOR: "Sole proprietor",
};

async function loadApplications(): Promise<VendorApplicationRecord[] | null> {
  try {
    return await getRuntime().store.listApplications(50);
  } catch {
    return null;
  }
}

export default async function AdminVendorsPage() {
  const applications = await loadApplications();
  const rows = (applications ?? []).map((a) => [
    a.createdAt.toISOString().slice(0, 16).replace("T", " "),
    <span key="b">
      <strong>{a.displayName}</strong>
      <br />
      <span className="muted small">{a.legalName}</span>
    </span>,
    `${a.category} / ${BUSINESS_TYPE_LABEL[a.businessType]}`,
    a.platform,
    <span key="c">
      {a.contactName}
      <br />
      <span className="muted small">{a.contactEmail}</span>
    </span>,
    <span key="s" className="badge">
      {a.status}
    </span>,
  ]);

  return (
    <>
      <h1>Vendors and KYC</h1>
      <h2>Applications</h2>
      {applications === null && <p className="notice">Applications could not be loaded. Check the database settings.</p>}
      <DataTable
        columns={["Applied (UTC)", "Business", "Category / type", "Platform", "Contact", "Status"]}
        rows={rows}
        emptyMessage="No applications yet."
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
