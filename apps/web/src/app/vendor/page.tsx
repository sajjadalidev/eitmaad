import Link from "next/link";
import { dailyLookupQuota, startOfPktDay } from "@etimaad/core";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

const GETTING_STARTED = [
  { text: "Accept the data sharing agreement", href: null },
  { text: "Create an API key", href: "/vendor/api-keys" },
  { text: "Install the WooCommerce plugin or Shopify app", href: "/integrations" },
  { text: "Choose actions for each risk level", href: "/vendor/settings" },
] as const;

async function loadStats(vendorId: string | null) {
  if (!vendorId) return null;
  try {
    const { store } = getRuntime();
    const now = new Date();
    const [overview, vendor] = await Promise.all([
      store.vendorOverview(vendorId, new Date(now.getTime() - 30 * DAY_MS), startOfPktDay(now)),
      store.getVendor(vendorId),
    ]);
    if (!vendor) return null;
    return { ...overview, quota: dailyLookupQuota(vendor.status, overview.ordersReported30Days) };
  } catch {
    return null;
  }
}

export default async function VendorOverviewPage() {
  const session = await requireSession("vendor");
  const stats = await loadStats(session.vendorId);
  const show = (n: number | undefined) => (stats ? String(n ?? 0) : "-");

  const cards = [
    ["Orders reported (30 days)", show(stats?.ordersReported30Days)],
    ["Risk checks today", show(stats?.lookupsToday)],
    ["Daily check quota", show(stats?.quota)],
    ["Orders with reason OTHER", show(stats?.ordersMissingReason)],
    ["Open disputes", show(stats?.openDisputes)],
  ] as const;

  return (
    <>
      <h1>Overview</h1>
      {!stats && <p className="notice">Numbers could not be loaded. Contact support if this continues.</p>}
      <div className="grid grid-4">
        {cards.map(([label, value]) => (
          <div className="card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
      <p className="muted small">Risk checks reset at midnight Pakistan time.</p>
      <div className="card stack">
        <h2>Getting started</h2>
        <ul className="check-list">
          {GETTING_STARTED.map((item) => (
            <li key={item.text}>{item.href ? <Link href={item.href}>{item.text}</Link> : item.text}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
