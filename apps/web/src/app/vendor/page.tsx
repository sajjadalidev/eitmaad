import Link from "next/link";
import { dailyLookupQuota, startOfPktDay } from "@etimaad/core";
import { DataTable } from "@/components/data-table";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const RECENT_CHECKS = 20;

async function loadStats(vendorId: string | null) {
  if (!vendorId) return null;
  try {
    const { store } = getRuntime();
    const now = new Date();
    const [overview, vendor, lookups, keys, users, lastOrders] = await Promise.all([
      store.vendorOverview(vendorId, new Date(now.getTime() - 30 * DAY_MS), startOfPktDay(now)),
      store.getVendor(vendorId),
      store.listVendorLookups(vendorId, RECENT_CHECKS),
      store.listVendorApiKeys(vendorId),
      store.listVendorUsers(vendorId),
      store.listVendorOrders(vendorId, 1),
    ]);
    if (!vendor) return null;
    const settingsSaved = typeof vendor.settings === "object" && vendor.settings !== null && Object.keys(vendor.settings).length > 0;
    const steps = [
      { text: "Accept the data sharing agreement", href: null, done: true },
      { text: "Create an API key", href: "/vendor/api-keys", done: keys.some((k) => k.status === "ACTIVE") },
      { text: "Connect your store and send your first order", href: "/integrations", done: lastOrders.length > 0 },
      { text: "Run your first risk check", href: "/docs", done: lookups.length > 0 },
      { text: "Choose actions for each risk level", href: "/vendor/settings", done: settingsSaved },
      { text: "Add your team", href: "/vendor/team", done: users.length > 1 },
    ];
    return { ...overview, lookups, steps, quota: dailyLookupQuota(vendor.status, overview.ordersReported30Days) };
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
      <h2>Recent risk checks</h2>
      <DataTable
        columns={["Time (UTC)", "Order value (PKR)", "Risk level", "Advice", "Reply time"]}
        rows={(stats?.lookups ?? []).map((l) => [
          l.createdAt.toISOString().slice(0, 16).replace("T", " "),
          l.orderValuePkr.toLocaleString("en-PK"),
          <span key="t" className="badge">
            {l.returnedTier.replaceAll("_", " ")}
          </span>,
          l.returnedAction.replaceAll("_", " "),
          `${l.latencyMs} ms`,
        ])}
        emptyMessage="No risk checks yet."
      />
      {stats && (
        <div className="card stack">
          <h2>
            Getting started ({stats.steps.filter((s) => s.done).length} of {stats.steps.length} done)
          </h2>
          <ul className="plain-list">
            {stats.steps.map((item) => (
              <li key={item.text}>
                <strong className={item.done ? "status-ok" : "status-mid"}>{item.done ? "Done" : "To do"}</strong>{" "}
                {item.href && !item.done ? <Link href={item.href}>{item.text}</Link> : item.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
