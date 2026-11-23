"use client";

import { useActionState } from "react";
import { inviteStaffAction, userStatusAction, type FormState } from "../self-service-actions";

const INITIAL: FormState = { status: "IDLE", message: null };

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "DISABLED";
  lastLogin: string;
}

export function TeamManager({ users, isOwner, selfId }: { users: UserRow[]; isOwner: boolean; selfId: string }) {
  const [invited, inviteAction, inviting] = useActionState(inviteStaffAction, INITIAL);
  const [changed, statusAction, changing] = useActionState(userStatusAction, INITIAL);
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
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              {isOwner && <th></th>}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={isOwner ? 5 : 4}>No users yet.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.id === selfId ? " (you)" : ""}
                    <br />
                    <span className="muted small">{u.email}</span>
                  </td>
                  <td>{u.role.toLowerCase()}</td>
                  <td>
                    <span className="badge">{u.status === "ACTIVE" ? "Active" : "Disabled"}</span>
                  </td>
                  <td>{u.lastLogin}</td>
                  {isOwner && (
                    <td>
                      {u.role === "STAFF" && u.id !== selfId && (
                        <form action={statusAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="status" value={u.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                          <button className="btn" disabled={changing}>
                            {u.status === "ACTIVE" ? "Disable" : "Enable"}
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isOwner ? (
        <form className="card form" action={inviteAction}>
          <h2>Add a staff user</h2>
          <p className="muted small">They get an email with a link to set their own password.</p>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" required minLength={2} maxLength={120} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" required maxLength={320} autoComplete="off" />
          </div>
          <button className="btn btn-primary" disabled={inviting}>
            {inviting ? "Sending..." : "Send invite"}
          </button>
        </form>
      ) : (
        <p className="muted small">Only an owner can add or disable users.</p>
      )}
    </div>
  );
}
