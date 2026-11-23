// Links a user that already exists in Supabase Auth to Etimaad as an admin or vendor user.
// This writes to a real database. Run it only with explicit approval:
//   DATABASE_MIGRATION_URL=... pnpm link-user --kind admin --email you@company.pk --name "Your Name" --role ADMIN --yes
//   DATABASE_MIGRATION_URL=... pnpm link-user --kind vendor --vendor-id <uuid> --email a@b.pk --name "A" --role OWNER --yes
// Create the user first in Supabase: Authentication > Users > Add user. This script never handles passwords.

import { createDb } from "@etimaad/db";
import { ADMIN_ROLES, VENDOR_ROLES, linkPortalUser, type LinkInput } from "../src/server/portal-user-admin";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!args.includes("--yes")) fail("Refusing to run without --yes. This writes to a real database.");
const url = process.env.DATABASE_MIGRATION_URL ?? fail("DATABASE_MIGRATION_URL is not set.");
const kind = arg("--kind");
const email = arg("--email") ?? fail("Missing --email.");
const name = arg("--name") ?? fail("Missing --name.");
const role = arg("--role") ?? fail("Missing --role.");

let input: LinkInput;
if (kind === "admin") {
  if (!(ADMIN_ROLES as readonly string[]).includes(role)) fail(`--role must be one of ${ADMIN_ROLES.join(", ")}.`);
  input = { kind, email, name, role: role as (typeof ADMIN_ROLES)[number] };
} else if (kind === "vendor") {
  if (!(VENDOR_ROLES as readonly string[]).includes(role)) fail(`--role must be one of ${VENDOR_ROLES.join(", ")}.`);
  const vendorId = arg("--vendor-id") ?? fail("Missing --vendor-id.");
  input = { kind, email, name, role: role as (typeof VENDOR_ROLES)[number], vendorId };
} else {
  fail("--kind must be admin or vendor.");
}

const db = createDb(url);
try {
  const rows = await db.$client`select id from auth.users where lower(email) = lower(${email}) limit 1`;
  const authUserId = rows[0]?.id as string | undefined;
  if (!authUserId) fail("No Supabase Auth user with this email. Add the user in Supabase first.");
  const id = await linkPortalUser(db, input, authUserId);
  console.log(`Linked ${input.kind} user ${id} (role ${input.role}) to the Supabase user.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Link failed:", message.replace(/postgres(ql)?:\/\/\S+/g, "[url]"));
  process.exitCode = 1;
} finally {
  await db.$client.end({ timeout: 5 });
}
