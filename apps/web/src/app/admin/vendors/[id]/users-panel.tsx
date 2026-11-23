"use client";

import { useActionState } from "react";
import { inviteUserAction, userStatusAdminAction, type VendorActionState } from "./actions";

const INITIAL: VendorActionState = { status: "IDLE", message: null };

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "DISABLED";
  linked: boolean;
  lastLogin: string;
}

export function UsersPanel({ vendorId, users, canManage }: { vendorId: string; users: UserRow[]; canManage: boolean }) {
  const [invited, inviteAction, inviting] = useActionState(inviteUserAction, INITIAL);
  const [changed, statusAction, changing] = useActionState(userStatusAdminAction, INITIAL);
  const message = changed.status !== "IDLE" ? changed : invited;

  return (
    <div className="stack">
      {message.message && (
        <p className={message.status === "ERROR" ? "notice" : "badge badge-accent"} role="status">
          {message.message}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={canManage ? 5 : 4}>No portal users yet. Invite the owner below.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    <br />
                    <span className="muted small">{u.email}</span>
                  </td>
                  <td>{u.role.toLowerCase()}</td>
                  <td>
                    <span className="badge">{u.status === "ACTIVE" ? "Active" : "Disabled"}</span>
                    {!u.linked && <span className="muted small"> login not linked</span>}
                  </td>
                  <td>{u.lastLogin}</td>
                  {canManage && (
                    <td>
                      <form action={statusAction}>
                        <input type="hidden" name="vendorId" value={vendorId} />
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="status" value={u.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                        <button className="btn" disabled={changing}>
                          {u.status === "ACTIVE" ? "Disable" : "Enable"}
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <form className="card form" action={inviteAction}>
          <h3>Invite a user</h3>
          <p className="muted small">
            They get an email with a link to set their own password. Inviting an existing user again sends a new link.
          </p>
          <input type="hidden" name="vendorId" value={vendorId} />
          <div className="field">
            <label htmlFor="inv-name">Name</label>
            <input id="inv-name" name="name" required minLength={2} maxLength={120} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="inv-email">Work email</label>
            <input id="inv-email" name="email" type="email" required maxLength={320} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="inv-role">Role</label>
            <select id="inv-role" name="role" defaultValue={users.some((u) => u.role === "OWNER") ? "STAFF" : "OWNER"}>
              <option value="OWNER">Owner (keys, settings, team)</option>
              <option value="STAFF">Staff (view only)</option>
            </select>
          </div>
          <button className="btn btn-primary" disabled={inviting}>
            {inviting ? "Sending..." : "Send invite"}
          </button>
        </form>
      )}
    </div>
  );
}
