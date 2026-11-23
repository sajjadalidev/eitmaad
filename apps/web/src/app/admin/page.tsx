import Link from "next/link";
import { getRuntime } from "@/server/config";
import type { AdminOverview } from "@/server/store";

export const dynamic = "force-dynamic";

async function loadOverview(): Promise<AdminOverview | null> {
  try {
    return await getRuntime().store.adminOverview();
  } catch {
    return null;
  }
}

export default async function AdminOverviewPage() {
  const o = await loadOverview();
  const a = o?.applications;
  const v = o?.vendors;
  const n = (x: number | undefined) => (o ? String(x ?? 0) : "-");

  const cards = [
    {
      label: "Applications to review",
      value: n(a && a.NEW + a.REVIEWING),
      detail: a ? `${a.NEW} new, ${a.REVIEWING} under review` : "",
      href: "/admin/applications",
    },
    {
      label: "Waiting for documents",
      value: n(a?.DOCUMENTS_REQUESTED),
      detail: "Applicants asked for KYC papers",
      href: "/admin/applications?status=DOCUMENTS_REQUESTED",
    },
    {
      label: "Live vendors",
      value: n(v && v.PROBATION + v.ACTIVE + v.RESTRICTED),
      detail: v ? `${v.ACTIVE} active, ${v.PROBATION} probation, ${v.RESTRICTED} restricted` : "",
      href: "/admin/vendors",
    },
    {
      label: "Disputes for admin review",
      value: n(o?.disputesForReview),
      detail: "Customer disputes",
      href: "/admin/disputes",
    },
  ] as const;

  return (
    <>
      <h1>Overview</h1>
      {!o && <p className="notice">Numbers could not be loaded. Check the database settings.</p>}
      <div className="grid grid-4">
        {cards.map((c) => (
          <Link className="card card-link" key={c.label} href={c.href}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{c.value}</div>
            <div className="muted small">{c.detail}</div>
          </Link>
        ))}
      </div>
      {a && (
        <p className="muted small">
          All applications: {a.APPROVED} approved, {a.REJECTED} rejected. Terminated vendors: {v?.TERMINATED ?? 0}.
        </p>
      )}
      <div className="card">
        <h2>Rules for operators</h2>
        <ul className="check-list">
          <li>Every change you make here is written to the audit log.</li>
          <li>Never download or copy customer data out of the console.</li>
          <li>KYC documents are deleted right after review.</li>
        </ul>
      </div>
    </>
  );
}
