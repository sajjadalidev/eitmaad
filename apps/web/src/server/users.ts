// Portal user directory. Local development uses the dev accounts.
// Production will use Supabase Auth with VENDOR_USERS and ADMIN_USERS (blueprint section 20).

import credentials from "./dev-credentials.json";
import { hashPassword } from "./passwords";
import type { SessionKind } from "./session";

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  kind: SessionKind;
  role: string;
  vendorId: string | null;
  passwordHash: string;
  status: "ACTIVE" | "DISABLED";
}

export interface UserDirectory {
  findByEmail(email: string): Promise<PortalUser | null>;
}

export class InMemoryUserDirectory implements UserDirectory {
  private readonly byEmail = new Map<string, PortalUser>();

  constructor(users: readonly PortalUser[]) {
    for (const user of users) this.byEmail.set(user.email.toLowerCase(), user);
  }

  async findByEmail(email: string) {
    return this.byEmail.get(email.trim().toLowerCase()) ?? null;
  }
}

function createDevDirectory(): UserDirectory {
  const passwordHash = hashPassword(credentials.devPassword);
  return new InMemoryUserDirectory(
    credentials.users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      kind: u.kind === "admin" ? "admin" : "vendor",
      role: u.role,
      vendorId: u.vendorId,
      passwordHash,
      status: "ACTIVE",
    })),
  );
}

const globalForDev = globalThis as unknown as { etimaadDevUsers?: UserDirectory };

// No directory in production until Supabase Auth is connected. Login then stays off.
export function getUserDirectory(): UserDirectory | null {
  if (process.env.NODE_ENV === "production") return null;
  globalForDev.etimaadDevUsers ??= createDevDirectory();
  return globalForDev.etimaadDevUsers;
}
