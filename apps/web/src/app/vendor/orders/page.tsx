import type { FaultClass } from "@etimaad/core";
import type { Metadata } from "next";
import { DataTable } from "@/components/data-table";
import { ReasonCodeTable } from "@/components/reason-code-table";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import type { OrderRecord } from "@/server/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Orders" };

const MAX_ROWS = 100;

// Who the server holds responsible, in plain words.
const FAULT_LABEL: Record<FaultClass, string> = {
  NONE: "-",
  USER: "Customer",
  VENDOR: "Store",
  LOGISTICS: "Courier",
  NEUTRAL: "No one",
  UNKNOWN: "Unknown",
};

async function loadOrders(vendorId: string | null): Promise<OrderRecord[] | null> {
  if (!vendorId) return null;
  try {
    return await getRuntime().store.listVendorOrders(vendorId, MAX_ROWS);
  } catch {
    return null;
  }
}

export default async function VendorOrdersPage() {
  const session = await requireSession("vendor");
  const orders = await loadOrders(session.vendorId);
  const rows = (orders ?? []).map((o) => [
    o.externalOrderRef,
    o.occurredAt.toISOString().slice(0, 10),
    <span key="s" className="badge">
      {o.status.replaceAll("_", " ").toLowerCase()}
    </span>,
    o.paymentMethod.replaceAll("_", " ").toLowerCase(),
    o.orderValuePkr.toLocaleString("en-PK"),
    o.reasonCode ?? "-",
    FAULT_LABEL[o.derivedFault],
  ]);

  return (
    <>
      <h1>Orders</h1>
      <p className="muted">
        Orders that failed, were cancelled or returned need a reason code. Without one they count as unknown and
        help nobody.
      </p>
      {orders === null && <p className="notice">Orders could not be loaded. Contact support if this continues.</p>}
      <DataTable
        columns={["Order ref", "Date", "Status", "Payment", "Value (PKR)", "Reason code", "Whose fault"]}
        rows={rows}
        emptyMessage="No orders yet. They appear here once your store sends events."
      />
      {rows.length === MAX_ROWS && <p className="muted small">Showing the latest {MAX_ROWS} orders.</p>}
      <p className="muted small">
        Only &quot;Customer&quot; faults lower a customer&apos;s score. Store and courier faults never count against
        them.
      </p>
      <h2>Reason code guide</h2>
      <ReasonCodeTable />
    </>
  );
}
