// Vendor portal users: invite, resend, disable (blueprint section 20.2.1).
// An admin can invite an OWNER or STAFF; a vendor OWNER can invite STAFF for their own store.

import { z } from "zod";
import type { AccountInviter } from "./account-invites";
import type { EtimaadStore } from "./store";

export interface AccountActor {
  type: "ADMIN" | "VENDOR";
  id: string;
  name: string;
  role: string;
  // Set for vendor users: the store they belong to.
  vendorId: string | null;
}

export type AccountResult =
  | { status: "INVITED" | "LINK_SENT" | "SAVED"; message: string }
  | { status: "ERROR"; message: string };

const fail = (message: string): AccountResult => ({ status: "ERROR", message });

const inviteSchema = z.object({
  vendorId: z.uuid(),
  email: z.string().trim().toLowerCase().email().max(320),
  name: z.string().trim().min(2).max(120),
  role: z.enum(["OWNER", "STAFF"]),
});

function canManage(actor: AccountActor, vendorId: string): boolean {
  if (actor.type === "ADMIN") return actor.role === "ADMIN" || actor.role === "SUPPORT";
  return actor.role === "OWNER" && actor.vendorId === vendorId;
}

export async function inviteVendorUser(
  ctx: { store: EtimaadStore; inviter: AccountInviter | null; redirectTo: string; now: Date },
  actor: AccountActor,
  raw: unknown,
): Promise<AccountResult> {
  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) return fail("Enter a name and a valid email.");
  const input = parsed.data;
  if (!ctx.inviter) return fail("Account emails are not set up on the server yet.");
  if (!canManage(actor, input.vendorId)) return fail("You cannot add users to this store.");
  if (actor.type === "VENDOR" && input.role !== "STAFF") return fail("Owners can add staff users only.");

  const vendor = await ctx.store.getVendor(input.vendorId);
  if (!vendor || vendor.status === "TERMINATED") return fail("This store cannot have new users.");

  const users = await ctx.store.listVendorUsers(input.vendorId);
  const same = users.find((u) => u.email === input.email);
  if (same?.linked) {
    if (same.status !== "ACTIVE") return fail("This user is disabled. Enable them first.");
    const sent = await ctx.inviter.sendPasswordLink(input.email, ctx.redirectTo);
    return sent
      ? { status: "LINK_SENT", message: `This user already exists. A new set-password link was sent to ${input.email}.` }
      : fail("Could not send the email. Try again later.");
  }

  const invited = await ctx.inviter.invite(input.email, input.name, ctx.redirectTo);
  if (invited.status === "ERROR") {
    console.warn("Invite failed:", invited.message);
    return fail("Could not send the invite. Try again later.");
  }
  let authUserId: string | null = invited.status === "INVITED" ? invited.authUserId : null;
  if (invited.status === "EXISTS") {
    authUserId = await ctx.store.findAuthUserIdByEmail(input.email);
    if (!authUserId) return fail("This email has a login that could not be found. Contact support.");
  }

  const other = await ctx.store.findPortalUserByAuthId(authUserId!);
  if (other && !(other.kind === "vendor" && other.vendorId === input.vendorId)) {
    return fail("This email already belongs to another Etimaad account.");
  }

  await ctx.store.linkVendorUser({ vendorId: input.vendorId, authUserId: authUserId!, email: input.email, name: input.name, role: input.role });
  if (invited.status === "EXISTS") await ctx.inviter.sendPasswordLink(input.email, ctx.redirectTo);

  await ctx.store.recordAdminAudit({
    actorType: actor.type,
    actorId: actor.id,
    actorName: actor.name,
    action: "VENDOR_USER_INVITED",
    entityType: "vendor_users",
    entityId: input.vendorId,
    note: `${input.role} ${input.email}`,
    now: ctx.now,
  });

  const how = ctx.inviter.sendsEmail
    ? `An email was sent to ${input.email} to set a password.`
    : "Local development: no email is sent. Log in with the dev password.";
  return { status: "INVITED", message: `${input.name} was added as ${input.role.toLowerCase()}. ${how}` };
}

const statusSchema = z.object({
  vendorId: z.uuid(),
  userId: z.string().min(1).max(100),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export async function setVendorUserStatus(
  ctx: { store: EtimaadStore; now: Date },
  actor: AccountActor & { userId?: string },
  raw: unknown,
): Promise<AccountResult> {
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) return fail("The form is not valid. Reload the page.");
  const input = parsed.data;
  if (!canManage(actor, input.vendorId)) return fail("You cannot change users of this store.");
  if (actor.type === "VENDOR" && actor.id === input.userId) return fail("You cannot disable yourself.");

  const users = await ctx.store.listVendorUsers(input.vendorId);
  const target = users.find((u) => u.id === input.userId);
  if (!target) return fail("User not found.");
  if (actor.type === "VENDOR" && target.role === "OWNER") return fail("Only Etimaad support can change an owner.");
  if (input.status === "DISABLED" && target.role === "OWNER") {
    const activeOwners = users.filter((u) => u.role === "OWNER" && u.status === "ACTIVE").length;
    if (activeOwners <= 1) return fail("A store needs at least one active owner.");
  }

  await ctx.store.setVendorUserStatus(input.vendorId, input.userId, input.status);
  await ctx.store.recordAdminAudit({
    actorType: actor.type,
    actorId: actor.id,
    actorName: actor.name,
    action: input.status === "DISABLED" ? "VENDOR_USER_DISABLED" : "VENDOR_USER_ENABLED",
    entityType: "vendor_users",
    entityId: input.vendorId,
    note: target.email,
    now: ctx.now,
  });
  return {
    status: "SAVED",
    message:
      input.status === "DISABLED"
        ? `${target.name} is disabled. They cannot log in again (an open session ends within 12 hours).`
        : `${target.name} can log in again.`,
  };
}
