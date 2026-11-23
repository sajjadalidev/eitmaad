import type { Metadata } from "next";
import { DataTable } from "@/components/data-table";

export const metadata: Metadata = { title: "Disputes" };

export default function VendorDisputesPage() {
  return (
    <>
      <h1>Disputes</h1>
      <div className="card">
        <ul className="check-list">
          <li>Answer each dispute within 7 days.</li>
          <li>Add evidence: delivery attempt times, call logs, rider notes.</li>
          <li>No answer and no evidence: the dispute is decided in the customer&apos;s favour.</li>
          <li>Upheld disputes count against your data quality score.</li>
        </ul>
      </div>
      <DataTable
        columns={["Opened", "Order ref", "Category", "Due by", "Status"]}
        rows={[]}
        emptyMessage="No disputes."
      />
    </>
  );
}
