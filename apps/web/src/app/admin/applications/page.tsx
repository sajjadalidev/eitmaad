import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { APPLICATION_STATUS_LABEL, APPROVAL_CHECKS } from "@/server/application-review";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import { APPLICATION_STATUSES, type AdminOverview, type ApplicationStatus, type VendorApplicationRecord } from "@/server/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Applications" };

const BUSINESS_TYPE_LABEL: Record<VendorApplicationRecord["businessType"], string> = {
  PVT_LTD: "Private Ltd",
  PARTNERSHIP: "Partnership",
  SOLE_PROPRIETOR: "Sole proprietor",
};

// What the admin should do next, in plain words.
const NEXT_STEP: Record<ApplicationStatus, string> = {
  NEW: "start the review",
  REVIEWING: "approve, reject or ask for documents",
  DOCUMENTS_REQUESTED: "mark documents received",
  APPROVED: "none, vendor created",
  REJECTED: "none",
};

const DOCUMENTS = [
  ["Private Ltd", "SECP certificate + NTN", "None"],
  ["Partnership", "Firm registration + NTN", "None"],
  ["Sole proprietor", "NTN in owner's name", "Owner CNIC + one business proof"],
] as const;

const RED_FLAGS = [
  "Brand-new store with no order history.",
  "CNIC name and business name do not match.",
  "Many failures reported right after joining.",
];

async function load(status: ApplicationStatus | undefined): Promise<{
  list: VendorApplicationRecord[];
  counts: AdminOverview["applications"];
} | null> {
  try {
    const { store } = getRuntime();
    const [list, overview] = await Promise.all([store.listApplications(200, status), store.adminOverview()]);
    return { list, counts: overview.applications };
  } catch {
    return null;
  }
}

export default async function AdminApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireSession("admin");
  const raw = (await searchParams).status;
  const status = (APPLICATION_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as ApplicationStatus) : undefined;
  const data = await load(status);
  const counts = data?.counts;
  const total = counts ? Object.values(counts).reduce((s, n) => s + n, 0) : 0;

  const rows = (data?.list ?? []).map((a) => [
    a.createdAt.toISOString().slice(0, 16).replace("T", " "),
    <span key="b">
      <Link href={`/admin/applications/${a.id}`}>
        <strong>{a.displayName}</strong>
      </Link>
      <br />
      <span className="muted small">
        {a.legalName}
        <br />
        {a.category}, {BUSINESS_TYPE_LABEL[a.businessType]}, {a.platform.toLowerCase()}
      </span>
    </span>,
    <span key="c">
      {a.contactName}
      <br />
      <span className="muted small">{a.contactEmail}</span>
    </span>,
    <span key="s">
      <span className="badge">{APPLICATION_STATUS_LABEL[a.status]}</span>
      <br />
      <span className="muted small">Next: {NEXT_STEP[a.status]}</span>
    </span>,
    <Link key="r" className="btn" href={`/admin/applications/${a.id}`}>
      {a.status === "APPROVED" || a.status === "REJECTED" ? "View" : "Review"}
    </Link>,
  ]);

  const tabs: { label: string; href: string; current: boolean }[] = [
    { label: `All (${total})`, href: "/admin/applications", current: !status },
    ...APPLICATION_STATUSES.map((s) => ({
      label: `${APPLICATION_STATUS_LABEL[s]} (${counts?.[s] ?? 0})`,
      href: `/admin/applications?status=${s}`,
      current: status === s,
    })),
  ];

  return (
    <>
      <h1>Applications</h1>
      <p className="muted">
        Flow: <strong>New</strong> → <strong>Under review</strong> → (optional) <strong>Waiting for documents</strong> →{" "}
        <strong>Approved</strong> or <strong>Rejected</strong>. Approval creates the vendor, which then appears under{" "}
        <Link href="/admin/vendors">Vendors</Link>.
      </p>
      <nav className="tabs" aria-label="Filter by status">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.current ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {!data && <p className="notice">Applications could not be loaded. Check the database settings.</p>}
      <DataTable
        columns={["Applied (UTC)", "Business", "Contact", "Status", ""]}
        rows={rows}
        emptyMessage={status ? "No applications with this status." : "No applications yet."}
      />

      <h2>KYC guide</h2>
      <DataTable
        columns={["Business type", "Full KYC (trust up to 1.0)", "Light KYC (trust up to 0.7)"]}
        rows={DOCUMENTS.map((r) => [...r])}
      />
      <div className="grid grid-2">
        <div className="card">
          <h3>Before approving</h3>
          <ul className="check-list">
            {Object.values(APPROVAL_CHECKS).map((c) => (
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
