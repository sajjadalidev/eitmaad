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
  const overview = await loadOverview();
  const value = (n: number | undefined) => (overview ? String(n ?? 0) : "-");

  const cards = [
    { label: "Applications waiting for review", value: value(overview?.applicationsWaiting), href: "/admin/vendors" },
    { label: "Disputes for admin review", value: value(overview?.disputesForReview), href: "/admin/disputes" },
    { label: "Active vendors", value: value(overview?.activeVendors), href: "/admin/vendors" },
    { label: "Anomaly alerts", value: "Not built yet", href: null },
  ] as const;

  return (
    <>
      <h1>Overview</h1>
      {!overview && <p className="notice">Numbers could not be loaded. Check the database settings.</p>}
      <div className="grid grid-4">
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <div className="stat-label">{c.href ? <Link href={c.href}>{c.label}</Link> : c.label}</div>
            <div className={c.value === "Not built yet" ? "muted" : "stat-value"}>{c.value}</div>
          </div>
        ))}
      </div>
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
