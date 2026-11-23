import type { Metadata } from "next";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import { TeamManager } from "./team-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Team" };

export default async function VendorTeamPage() {
  const session = await requireSession("vendor");
  const users = session.vendorId ? await getRuntime().store.listVendorUsers(session.vendorId) : [];
  const isOwner = session.role === "OWNER";

  return (
    <>
      <h1>Team</h1>
      <p className="muted">
        People who can log in to your store&apos;s portal. Staff can see orders and risk checks. Only owners can change
        API keys, settings and the team.
      </p>
      <TeamManager
        isOwner={isOwner}
        selfId={session.sub}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          lastLogin: u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : "-",
        }))}
      />
    </>
  );
}
