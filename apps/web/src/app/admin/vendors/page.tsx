import { VENDOR_STATUSES, type VendorStatus } from "@etimaad/core";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import type { VendorSummary } from "@/server/store";
import { VENDOR_STATUS_LABEL } from "@/server/vendor-management";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vendors" };

const DAY_MS = 86_400_000;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "-");

async function loadVendors(): Promise<VendorSummary[] | null> {
  try {
    return await getRuntime().store.listVendorSummaries(new Date(Date.now() - 30 * DAY_MS));
  } catch {
    return null;
  }
}

export default async function AdminVendorsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireSession("admin");
  const raw = (await searchParams).status;
  const status = (VENDOR_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as VendorStatus) : undefined;
  const all = await loadVendors();
  const vendors = (all ?? []).filter((v) => !status || v.status === status);

  const rows = vendors.map((v) => [
    <span key="n">
      <Link href={`/admin/vendors/${v.id}`}>
        <strong>{v.displayName}</strong>
      </Link>
      <br />
      <span className="muted small">
        {v.legalName}, {v.category}
      </span>
    </span>,
    <span key="s">
      <span className="badge">{VENDOR_STATUS_LABEL[v.status]}</span>
      <br />
      <span className="muted small">
        KYC {v.kycLevel ? v.kycLevel.toLowerCase() : "not recorded"}, trust {v.trustWeight.toFixed(2)}
      </span>
    </span>,
    <span key="d" className="small">
      Joined {day(v.createdAt)}
      {v.status === "PROBATION" && (
        <>
          <br />
          Probation ends {day(v.probationEndsAt)}
        </>
      )}
    </span>,
    <span key="a" className="small">
      {v.orders30Days} orders
      <br />
      {v.userFaults30Days} customer faults
      <br />
      {v.lookups30Days} risk checks
    </span>,
    v.portalUsers,
    <Link key="o" className="btn" href={`/admin/vendors/${v.id}`}>
      Open
    </Link>,
  ]);

  const count = (s: VendorStatus) => (all ?? []).filter((v) => v.status === s).length;
  const tabs = [
    { label: `All (${all?.length ?? 0})`, href: "/admin/vendors", current: !status },
    ...VENDOR_STATUSES.filter((s) => s !== "PENDING_VERIFICATION" || count(s) > 0).map((s) => ({
      label: `${VENDOR_STATUS_LABEL[s]} (${count(s)})`,
      href: `/admin/vendors?status=${s}`,
      current: status === s,
    })),
  ];

  return (
    <>
      <h1>Vendors</h1>
      <p className="muted">
        Stores that are approved and connected. New stores come from <Link href="/admin/applications">Applications</Link>.
        Open a store to see its full profile, data quality checks and actions.
      </p>
      <nav className="tabs" aria-label="Filter by status">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.current ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {all === null && <p className="notice">Vendors could not be loaded. Check the database settings.</p>}
      <DataTable
        columns={["Store", "Status", "Dates", "Last 30 days", "Users", ""]}
        rows={rows}
        emptyMessage={status ? "No vendors with this status." : "No vendors yet."}
      />
    </>
  );
}
