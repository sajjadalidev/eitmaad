import Link from "next/link";

const CARDS = [
  { label: "Vendors waiting for KYC", href: "/admin/vendors" },
  { label: "Disputes for admin review", href: "/admin/disputes" },
  { label: "Anomaly alerts", href: null },
  { label: "Active vendors", href: "/admin/vendors" },
] as const;

export default function AdminOverviewPage() {
  return (
    <>
      <h1>Overview</h1>
      <div className="grid grid-4">
        {CARDS.map((c) => (
          <div className="card" key={c.label}>
            <div className="stat-label">{c.href ? <Link href={c.href}>{c.label}</Link> : c.label}</div>
            <div className="stat-value">-</div>
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
