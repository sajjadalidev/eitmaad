import type { Metadata } from "next";
import { DataTable } from "@/components/data-table";
import { ReasonCodeTable } from "@/components/reason-code-table";

export const metadata: Metadata = { title: "Orders" };

export default function VendorOrdersPage() {
  return (
    <>
      <h1>Orders</h1>
      <p className="muted">
        Orders that failed, were cancelled or returned need a reason code. Without one they count as unknown and
        help nobody.
      </p>
      <div className="btn-row">
        <button className="btn" disabled>
          Mark selected
        </button>
      </div>
      <DataTable
        columns={["Order ref", "Date", "Status", "Payment", "Value (PKR)", "Reason code"]}
        rows={[]}
        emptyMessage="No orders yet. They appear here once your store sends events."
      />
      <h2>Reason code guide</h2>
      <ReasonCodeTable />
    </>
  );
}
