"use client";

import { useActionState } from "react";
import { createKeyAction, revokeKeyAction, type FormState } from "../self-service-actions";

const INITIAL: FormState = { status: "IDLE", message: null };

interface KeyRow {
  id: string;
  prefix: string;
  status: "ACTIVE" | "REVOKED";
  created: string;
  lastUsed: string;
  revoked: string;
}

export function KeyManager({ keys, maxActive }: { keys: KeyRow[]; maxActive: number }) {
  const [created, createAction, creating] = useActionState(createKeyAction, INITIAL);
  const [revoked, revokeAction, revoking] = useActionState(revokeKeyAction, INITIAL);
  const active = keys.filter((k) => k.status === "ACTIVE").length;
  const message = revoked.message && revoked.status !== "IDLE" ? revoked : created.secret ? null : created;

  return (
    <div className="stack">
      {created.secret && (
        <div className="card stack" role="status">
          <h2>New key created</h2>
          <p className="notice">Copy both values now and store them safely. They are not shown again.</p>
          <div className="field">
            <label>API key</label>
            <div className="secret">{created.secret.apiKey}</div>
          </div>
          <div className="field">
            <label>Signing secret</label>
            <div className="secret">{created.secret.signingSecret}</div>
          </div>
        </div>
      )}
      {message?.message && (
        <p className={message.status === "ERROR" ? "notice" : "badge badge-accent"} role="status">
          {message.message}
        </p>
      )}

      <form action={createAction} className="btn-row">
        <button className="btn btn-primary" disabled={creating || active >= maxActive}>
          {creating ? "Creating..." : "Create key"}
        </button>
        {active >= maxActive && <span className="muted small">Revoke a key to create a new one.</span>}
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Status</th>
              <th>Created</th>
              <th>Last used</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={5}>No keys yet. Create one to connect your store.</td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id}>
                  <td>
                    <code>etm_{k.prefix}_...</code>
                  </td>
                  <td>
                    <span className="badge">{k.status === "ACTIVE" ? "Active" : `Revoked ${k.revoked}`}</span>
                  </td>
                  <td>{k.created}</td>
                  <td>{k.lastUsed}</td>
                  <td>
                    {k.status === "ACTIVE" && (
                      <form
                        action={revokeAction}
                        onSubmit={(e) => {
                          if (!window.confirm(`Revoke etm_${k.prefix}_...? It stops working at once.`)) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="keyId" value={k.id} />
                        <button className="btn" disabled={revoking}>
                          Revoke
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
