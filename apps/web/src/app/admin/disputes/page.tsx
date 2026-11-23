import type { Metadata } from "next";
import { DataTable } from "@/components/data-table";

export const metadata: Metadata = { title: "Disputes" };

export default function AdminDisputesPage() {
  return (
    <>
      <h1>Disputes</h1>
      <div className="card">
        <ul className="check-list">
          <li>You see disputes where the vendor sent evidence but missed the 7 day deadline.</li>
          <li>You also see disputes beyond the limit of 3 per customer in 90 days.</li>
          <li>Uphold removes the order from scoring. Reject keeps it at full weight.</li>
          <li>Write a short resolution note every time.</li>
        </ul>
      </div>
      <DataTable
        columns={["Opened", "Category", "Order ref", "Vendor", "Evidence", "Status", ""]}
        rows={[]}
        emptyMessage="No disputes waiting for review."
      />
    </>
  );
}
