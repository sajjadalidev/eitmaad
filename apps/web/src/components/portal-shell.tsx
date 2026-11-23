import type { ReactNode } from "react";
import { logoutAction } from "@/server/auth-actions";
import { Brand } from "./brand";
import { PortalNav, type NavItem } from "./portal-nav";

export function PortalShell({
  area,
  items,
  user,
  children,
}: {
  area: string;
  items: readonly NavItem[];
  user: { name: string; role: string };
  children: ReactNode;
}) {
  return (
    <div className="portal">
      <aside className="portal-side">
        <Brand />
        <div className="portal-area">{area}</div>
        <PortalNav items={items} />
        <div className="portal-user">
          <div className="small">{user.name}</div>
          <span className="badge">{user.role}</span>
          <form action={logoutAction}>
            <button type="submit" className="btn portal-logout">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="portal-main">
        <div className="notice" role="status">
          Preview. You are logged in with a local dev account. The database is not connected, so no real data is
          shown.
        </div>
        {children}
      </main>
    </div>
  );
}
