// Links a Supabase Auth user to an ADMIN_USERS or VENDOR_USERS row (blueprint sections 8.1, 20.5).
// Passwords stay in Supabase. Etimaad only stores the Supabase user id and the role.

import { adminUsers, vendorUsers } from "@etimaad/db";
import type { AnyPgDatabase } from "./postgres-store";

export const ADMIN_ROLES = ["ADMIN", "SUPPORT", "ANALYST"] as const;
export const VENDOR_ROLES = ["OWNER", "STAFF"] as const;

export type LinkInput =
  | { kind: "admin"; email: string; name: string; role: (typeof ADMIN_ROLES)[number] }
  | { kind: "vendor"; email: string; name: string; role: (typeof VENDOR_ROLES)[number]; vendorId: string };

// Creates the row, or links an existing row with the same email. Returns the row id.
export async function linkPortalUser(db: AnyPgDatabase, input: LinkInput, authUserId: string): Promise<string> {
  const email = input.email.trim().toLowerCase();

  if (input.kind === "admin") {
    const [row] = await db
      .insert(adminUsers)
      .values({ authUserId, name: input.name, workEmail: email, role: input.role })
      .onConflictDoUpdate({ target: adminUsers.workEmail, set: { authUserId, name: input.name, role: input.role } })
      .returning({ id: adminUsers.id });
    if (!row) throw new Error("Admin user insert returned no row");
    return row.id;
  }

  const [row] = await db
    .insert(vendorUsers)
    .values({ vendorId: input.vendorId, authUserId, name: input.name, email, role: input.role })
    .onConflictDoUpdate({
      target: [vendorUsers.vendorId, vendorUsers.email],
      set: { authUserId, name: input.name, role: input.role },
    })
    .returning({ id: vendorUsers.id });
  if (!row) throw new Error("Vendor user insert returned no row");
  return row.id;
}
