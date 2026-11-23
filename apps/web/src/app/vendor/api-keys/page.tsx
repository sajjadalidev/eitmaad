import type { Metadata } from "next";
import { OwnerOnly } from "@/components/owner-only";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import { MAX_ACTIVE_KEYS } from "@/server/vendor-self-service";
import { KeyManager } from "./key-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "API keys" };

const when = (d: Date | null) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "-");

export default async function VendorApiKeysPage() {
  const session = await requireSession("vendor");
  const keys = session.vendorId ? await getRuntime().store.listVendorApiKeys(session.vendorId) : [];

  return (
    <OwnerOnly title="API keys">
      <h1>API keys</h1>
      <p className="muted">
        Your store or plugin uses a key to send orders and run risk checks. Each key has a signing secret. Both are
        shown only once, when you create them. You can have up to {MAX_ACTIVE_KEYS} active keys.
      </p>
      <KeyManager
        keys={keys.map((k) => ({
          id: k.id,
          prefix: k.keyPrefix,
          status: k.status,
          created: when(k.createdAt),
          lastUsed: when(k.lastUsedAt),
          revoked: when(k.revokedAt),
        }))}
        maxActive={MAX_ACTIVE_KEYS}
      />
      <div className="card">
        <h3>How to use a key</h3>
        <ul>
          <li>Put the key in the <code>X-Api-Key</code> header.</li>
          <li>Sign order events with the signing secret. See the API docs.</li>
          <li>To change a key: create a new one, update your store, then revoke the old one.</li>
          <li>If a key leaks, revoke it at once.</li>
        </ul>
      </div>
    </OwnerOnly>
  );
}
