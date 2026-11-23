import type { FaultClass, RiskTier, ScoreRule } from "@etimaad/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { getRuntime } from "@/server/config";
import { RECOMPUTE_ROLES, loadCustomerDetail } from "@/server/customer-detail";
import { requireSession } from "@/server/require-session";
import { RecomputeForm } from "../forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Customer detail" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIER: Record<RiskTier, { label: string; cls: string }> = {
  LOW: { label: "LOW risk", cls: "status-ok" },
  MEDIUM: { label: "MEDIUM risk", cls: "status-mid" },
  HIGH: { label: "HIGH risk", cls: "status-bad" },
  INSUFFICIENT_DATA: { label: "Not enough data", cls: "muted" },
};

const RULE_TEXT: Record<ScoreRule, string> = {
  HARD_RULE_FAKE_ADDRESS: "Fake address reported by 2 or more stores in the last 180 days, so HIGH.",
  THIN_DATA_MULTI_VENDOR: "Not enough data yet, but recent customer faults at 2 or more stores, so HIGH.",
  THIN_DATA_SINGLE_VENDOR: "Not enough data yet, and recent customer faults at one store, so MEDIUM.",
  CORROBORATION_CAP: "The score says HIGH, but only one store reported faults, so it stays MEDIUM.",
  CORROBORATED_NEGATIVE: "Customer faults were reported by 2 or more stores.",
};

const EXCLUDED_TEXT: Record<string, string> = {
  vendor_fault: "Store's fault",
  logistics_fault: "Courier's fault",
  neutral: "No one's fault (for example cancelled before dispatch)",
  unknown: "Unknown (for example not enough delivery attempts)",
  disputed: "Removed after a dispute",
  daily_cap: "Above 3 orders a day at one store",
  pre_notice_backfill: "Old orders from before the customer notice",
};

const FAULT_LABEL: Record<FaultClass, string> = {
  NONE: "-",
  USER: "Customer",
  VENDOR: "Store",
  LOGISTICS: "Courier",
  NEUTRAL: "No one",
  UNKNOWN: "Unknown",
};

const when = (d: Date | null) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "-");
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "-");

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession("admin");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const detail = await loadCustomerDetail(
    { store: getRuntime().store, now: new Date() },
    { id: session.sub, name: session.name, role: session.role },
    id,
  );
  if (!detail) notFound();
  const { customer, profile, orders, vendors, stores, accessLog } = detail;
  const tier = TIER[profile?.riskTier ?? "INSUFFICIENT_DATA"];
  const b = profile?.breakdown;
  const excluded = b ? Object.entries(b.excluded).filter(([, n]) => n > 0) : [];

  return (
    <>
      <p className="small">
        <Link href="/admin/customers">Search another customer</Link>
      </p>
      <h1>
        Customer <code className="small">{customer.id.slice(0, 8)}</code>{" "}
        <span className={`badge ${tier.cls}`}>{tier.label}</span>
      </h1>
      <p className="muted small">
        First seen {day(customer.createdAt)}. Last activity {day(customer.lastActivityAt)}. Status {customer.status.toLowerCase()}.
        {profile?.hasOpenDispute ? " Has an open dispute." : ""}
      </p>

      <div className="grid grid-4">
        {[
          ["Score", profile ? profile.cumulativeScore.toFixed(1) : "-"],
          ["Orders in the network", profile?.totalNetworkOrders ?? orders.length],
          ["Delivered / customer faults", profile ? `${profile.totalDelivered} / ${profile.totalUserFault}` : "-"],
          ["Stores", profile?.distinctVendorCount ?? stores.length],
        ].map(([label, value]) => (
          <div className="card" key={String(label)}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
      {profile && profile.distinctVendorCount < 3 && (
        <p className="muted small">
          Stores see the exact score only when 3 or more stores know this customer. Admins always see it.
        </p>
      )}

      <div className="grid grid-2">
        <div className="card stack">
          <h2>How the score was made</h2>
          {b ? (
            <>
              <p>
                Score = 100 x (good + {b.alpha}) / (good + bad + {b.alpha + b.beta})
                <br />
                <strong>Good evidence:</strong> {b.positive_evidence.toFixed(2)} (delivered orders, weighted)
                <br />
                <strong>Bad evidence:</strong> {b.negative_evidence.toFixed(2)} (customer faults, weighted)
                <br />
                <strong>Orders that counted:</strong> {b.scoreable_orders}
                <br />
                <strong>Enough data:</strong> {b.data_sufficient ? "Yes" : "No (needs 3 orders that count)"}
              </p>
              <p className="muted small">
                Weights: recent orders count more, bigger orders count more, prepaid deliveries count a bit less, and
                each store&apos;s trust weight applies. Last built {b.calculated_at.slice(0, 16).replace("T", " ")} UTC.
              </p>
            </>
          ) : (
            <p className="muted">No score yet.</p>
          )}
          {session.role && RECOMPUTE_ROLES.includes(session.role) && <RecomputeForm customerId={customer.id} />}
        </div>

        <div className="card stack">
          <h2>Rules and exclusions</h2>
          {b && b.rules_fired.length > 0 ? (
            <ul>
              {b.rules_fired.map((r) => (
                <li key={r}>{RULE_TEXT[r]}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No special rule applied. The tier comes from the score.</p>
          )}
          <h3>Not counted against the customer</h3>
          {excluded.length > 0 ? (
            <ul>
              {excluded.map(([key, n]) => (
                <li key={key}>
                  {EXCLUDED_TEXT[key] ?? key}: {n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing was left out.</p>
          )}
        </div>
      </div>

      <h2>By store</h2>
      <DataTable
        columns={["Store", "Orders", "Delivered", "Customer faults", "Store / courier faults", "Store's own rate", "Risk checks by this store"]}
        rows={stores.map((s) => [
          <Link key="v" href={`/admin/vendors/${s.vendorId}`}>
            {s.vendorName}
          </Link>,
          s.orders,
          s.score ? s.score.delivered + s.score.partiallyDelivered : 0,
          s.score?.userFault ?? 0,
          s.score ? `${s.score.vendorFault} / ${s.score.logisticsFault}` : "0 / 0",
          s.score ? s.score.successRate.toFixed(1) : "-",
          s.lookups > 0 ? `${s.lookups} (last ${day(s.lastLookupAt)})` : "0",
        ])}
        emptyMessage="No store has reported or checked this customer."
      />

      <h2>Orders</h2>
      <DataTable
        columns={["Date", "Store", "Order ref", "Status", "Payment", "Value (PKR)", "Reason code", "Whose fault"]}
        rows={orders.map((o) => [
          day(o.occurredAt),
          vendors.get(o.vendorId)?.displayName ?? "Unknown store",
          o.externalOrderRef,
          <span key="s" className="badge">
            {o.status.replaceAll("_", " ").toLowerCase()}
          </span>,
          o.paymentMethod.replaceAll("_", " ").toLowerCase(),
          o.orderValuePkr.toLocaleString("en-PK"),
          o.reasonCode ?? "-",
          <span key="f" className={o.derivedFault === "USER" ? "status-bad" : undefined}>
            {FAULT_LABEL[o.derivedFault]}
            {o.isDisputed ? " (disputed)" : ""}
          </span>,
        ])}
        emptyMessage="No orders."
      />

      <h2>Who viewed this customer</h2>
      <DataTable
        columns={["Time", "Admin", "Action"]}
        rows={accessLog.map((a) => [when(a.createdAt), a.actorName ?? "unknown", a.action.replace("CUSTOMER_", "").toLowerCase()])}
        emptyMessage="No views yet."
      />
    </>
  );
}
