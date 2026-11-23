import { dailyLookupQuota, startOfPktDay, type FaultClass } from "@etimaad/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import type { FaultCounts, VendorAdminAction } from "@/server/store";
import {
  RESTRICTED_TRUST_WEIGHT,
  VENDOR_STATUS_LABEL,
  allowedVendorActions,
  trustRange,
} from "@/server/vendor-management";
import { VendorPanel } from "./vendor-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vendor profile" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
const RECENT = 20;

const ACTION_LABEL: Record<VendorAdminAction, string> = {
  MAKE_ACTIVE: "Made active",
  RESTRICT: "Restricted",
  LIFT_RESTRICTION: "Restriction lifted",
  TERMINATE: "Terminated",
  SET_TRUST_WEIGHT: "Trust weight changed",
  REVOKE_KEY: "API key revoked",
  ADD_NOTE: "Note added",
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

// Share of failed orders that the vendor blamed on the customer.
function customerShare(c: FaultCounts): { failed: number; share: number | null } {
  const failed = c.USER + c.VENDOR + c.LOGISTICS + c.UNKNOWN;
  return { failed, share: failed > 0 ? c.USER / failed : null };
}
const pct = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);

export default async function VendorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession("admin");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { store } = getRuntime();
  const vendor = await store.getVendorProfile(id);
  if (!vendor) notFound();

  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const [overview, keys, users, orders, lookups, history, own, network, summaries] = await Promise.all([
    store.vendorOverview(id, since30, startOfPktDay(now)),
    store.listVendorApiKeys(id),
    store.listVendorUsers(id),
    store.listVendorOrders(id, RECENT),
    store.listVendorLookups(id, RECENT),
    store.listVendorHistory(id),
    store.countFaults(id, since90),
    store.countFaults(null, since90),
    store.listVendorSummaries(since30),
  ]);
  const lookups30 = summaries.find((s) => s.id === id)?.lookups30Days ?? 0;
  const ownShare = customerShare(own);
  const networkShare = customerShare(network);
  const ratio = overview.ordersReported30Days > 0 ? lookups30 / overview.ordersReported30Days : null;
  const activeKeys = keys.filter((k) => k.status === "ACTIVE");

  const highBlame = ownShare.share !== null && networkShare.share !== null && ownShare.failed >= 5 && ownShare.share > networkShare.share + 0.15;
  const highLookups = ratio !== null && ratio > 5;

  return (
    <>
      <p className="small">
        <Link href="/admin/vendors">Back to vendors</Link>
      </p>
      <h1>
        {vendor.displayName} <span className="badge">{VENDOR_STATUS_LABEL[vendor.status]}</span>
      </h1>

      <div className="grid grid-4">
        {[
          ["Orders (30 days)", overview.ordersReported30Days],
          ["Risk checks today", overview.lookupsToday],
          ["Daily check quota", dailyLookupQuota(vendor.status, overview.ordersReported30Days)],
          ["Open disputes", overview.openDisputes],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-2">
        <div className="card stack">
          <h2>Profile</h2>
          <p>
            <strong>Legal name:</strong> {vendor.legalName}
            <br />
            <strong>Category:</strong> {vendor.category}
            <br />
            <strong>Trust weight:</strong> {vendor.trustWeight.toFixed(2)}
            <br />
            <strong>Fault claim bias:</strong> {vendor.faultClaimBias.toFixed(2)}
            <br />
            <strong>KYC:</strong> {vendor.kycLevel ? `${vendor.kycLevel.toLowerCase()}, verified ${day(vendor.kycVerifiedAt)}` : "not recorded"}
            <br />
            <strong>KYC reference:</strong> {vendor.kycReference ?? "-"}
            <br />
            <strong>Probation ends:</strong> {day(vendor.probationEndsAt)}
            <br />
            <strong>Joined:</strong> {day(vendor.createdAt)}
          </p>
          {vendor.kycReviewerNote && <p className="small muted">KYC note: {vendor.kycReviewerNote}</p>}
          {vendor.applicationId && (
            <p className="small">
              <Link href={`/admin/applications/${vendor.applicationId}`}>Open the original application</Link>
            </p>
          )}
        </div>

        <div className="card stack">
          <h2>Data quality checks</h2>
          <ul className="plain-list">
            <li>
              <strong className={highBlame ? "status-bad" : "status-ok"}>{highBlame ? "Check" : "OK"}</strong> Customer blamed in{" "}
              {pct(ownShare.share)} of {ownShare.failed} failed orders (network: {pct(networkShare.share)}), last 90 days.
            </li>
            <li>
              <strong className={highLookups ? "status-bad" : "status-ok"}>{highLookups ? "Check" : "OK"}</strong>{" "}
              {lookups30} risk checks for {overview.ordersReported30Days} reported orders in 30 days
              {ratio !== null ? ` (${ratio.toFixed(1)} per order)` : ""}.
            </li>
            <li>
              <strong className={overview.ordersMissingReason > 0 ? "status-mid" : "status-ok"}>
                {overview.ordersMissingReason > 0 ? "Check" : "OK"}
              </strong>{" "}
              {overview.ordersMissingReason} orders with reason OTHER.
            </li>
            <li>
              <strong className={activeKeys.length > 0 ? "status-ok" : "status-mid"}>{activeKeys.length > 0 ? "OK" : "Check"}</strong>{" "}
              {activeKeys.length} active API key(s), {users.length} portal user(s).
            </li>
          </ul>
          <p className="muted small">
            A much higher customer-blame share than the network can mean the vendor tags its own failures as customer faults.
          </p>
        </div>
      </div>

      <h2>Actions</h2>
      <VendorPanel
        vendorId={vendor.id}
        allowed={allowedVendorActions(vendor.status, session.role)}
        trustWeight={vendor.trustWeight}
        ranges={{ ACTIVE: trustRange("ACTIVE", vendor.kycLevel), PROBATION: trustRange("PROBATION", vendor.kycLevel) }}
        currentRange={trustRange(vendor.status, vendor.kycLevel)}
        activeKeys={activeKeys.map((k) => ({ id: k.id, keyPrefix: k.keyPrefix }))}
        restrictedWeight={RESTRICTED_TRUST_WEIGHT}
      />

      <h2>API keys</h2>
      <DataTable
        columns={["Key", "Status", "Created", "Last used", "Revoked"]}
        rows={keys.map((k) => [
          <code key="k">etm_{k.keyPrefix}_...</code>,
          <span key="s" className="badge">
            {k.status}
          </span>,
          when(k.createdAt),
          when(k.lastUsedAt),
          when(k.revokedAt),
        ])}
        emptyMessage="No API keys."
      />

      <h2>Portal users</h2>
      <DataTable
        columns={["Name", "Email", "Role", "Status", "Login linked", "Last login"]}
        rows={users.map((u) => [u.name, u.email, u.role, u.status, u.linked ? "Yes" : "No", when(u.lastLoginAt)])}
        emptyMessage="No portal users yet. Add the user in Supabase, then link with the link-user script."
      />

      <h2>Recent orders</h2>
      <DataTable
        columns={["Order ref", "Date", "Status", "Value (PKR)", "Reason code", "Whose fault"]}
        rows={orders.map((o) => [
          o.externalOrderRef,
          day(o.occurredAt),
          o.status.replaceAll("_", " ").toLowerCase(),
          o.orderValuePkr.toLocaleString("en-PK"),
          o.reasonCode ?? "-",
          FAULT_LABEL[o.derivedFault],
        ])}
        emptyMessage="No orders yet."
      />

      <h2>Recent risk checks</h2>
      <DataTable
        columns={["Time", "Order value (PKR)", "Risk level", "Advice", "Reply time"]}
        rows={lookups.map((l) => [
          when(l.createdAt),
          l.orderValuePkr.toLocaleString("en-PK"),
          l.returnedTier.replaceAll("_", " "),
          l.returnedAction.replaceAll("_", " "),
          `${l.latencyMs} ms`,
        ])}
        emptyMessage="No risk checks yet."
      />

      <h2>History</h2>
      <div className="card">
        {history.length === 0 ? (
          <p className="muted">No admin changes yet.</p>
        ) : (
          <ol className="timeline">
            {history.map((e) => (
              <li key={e.id}>
                <strong>{ACTION_LABEL[e.action]}</strong>
                {e.fromStatus !== e.toStatus && (
                  <span className="muted small">
                    {" "}
                    ({VENDOR_STATUS_LABEL[e.fromStatus]} to {VENDOR_STATUS_LABEL[e.toStatus]})
                  </span>
                )}
                {e.fromTrust !== e.toTrust && (
                  <span className="muted small">
                    {" "}
                    trust {e.fromTrust.toFixed(2)} to {e.toTrust.toFixed(2)}
                  </span>
                )}
                {e.keyPrefix && <span className="muted small"> key etm_{e.keyPrefix}_...</span>}
                <br />
                <span className="muted small">
                  {when(e.createdAt)}, by {e.actorName ?? "unknown"}
                </span>
                {e.note && <p className="small">{e.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
