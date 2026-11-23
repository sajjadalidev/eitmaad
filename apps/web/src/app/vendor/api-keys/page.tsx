import type { Metadata } from "next";
import { DataTable } from "@/components/data-table";
import { OwnerOnly } from "@/components/owner-only";

export const metadata: Metadata = { title: "API keys" };

export default function VendorApiKeysPage() {
  return (
    <OwnerOnly title="API keys">
      <h1>API keys</h1>
      <p className="muted">
        Each key has a signing secret. The full key and secret are shown only once, when you create them. Only the
        owner of the account can create or revoke keys.
      </p>
      <div className="btn-row">
        <button className="btn btn-primary" disabled>
          Create key
        </button>
      </div>
      <DataTable
        columns={["Key prefix", "Scopes", "Created", "Last used", "Status", ""]}
        rows={[]}
        emptyMessage="No keys yet."
      />
      <div className="card">
        <h3>Scopes</h3>
        <ul>
          <li>
            <code>events:write</code> send order events
          </li>
          <li>
            <code>batches:write</code> upload batches
          </li>
          <li>
            <code>risk:read</code> run risk checks
          </li>
          <li>
            <code>disputes:write</code> raise and answer disputes
          </li>
        </ul>
      </div>
    </OwnerOnly>
  );
}
