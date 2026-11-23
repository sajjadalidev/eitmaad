// Data sharing agreement a vendor accepts before using the portal (blueprint sections 5.1, 11).
// DRAFT text: a lawyer must review it before launch. A new version needs a new acceptance.

import { createHash } from "node:crypto";
import { z } from "zod";
import type { EtimaadStore } from "./store";

export const AGREEMENT_VERSION = "2026-11-draft";

export const AGREEMENT_POINTS = [
  "We report true order results only, with the correct reason code, within 30 days of the event.",
  "We do not blame the customer for our own or our courier's mistakes.",
  "We show the Etimaad customer notice at checkout and send its version with every order.",
  "We use risk checks only for real orders at checkout, never to look up people.",
  "We keep API keys and signing secrets private and tell Etimaad at once if one leaks.",
  "We answer customer disputes with evidence within 7 days.",
  "We do not copy, sell or share any data we get from Etimaad.",
  "Etimaad may restrict or end our access if we break these rules or send false data.",
] as const;

export const AGREEMENT_CHECKSUM = createHash("sha256")
  .update(`${AGREEMENT_VERSION}\n${AGREEMENT_POINTS.join("\n")}`)
  .digest("hex");

const inputSchema = z.object({
  signedByName: z.string().trim().min(3).max(120),
  accepted: z.literal("yes"),
});

export async function acceptAgreement(
  ctx: { store: EtimaadStore; now: Date },
  user: { id: string; name: string; role: string; vendorId: string | null },
  raw: unknown,
): Promise<{ status: "SAVED" } | { status: "ERROR"; message: string }> {
  if (!user.vendorId) return { status: "ERROR", message: "No store found for your login." };
  if (user.role !== "OWNER") return { status: "ERROR", message: "Only the account owner can accept the agreement." };
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { status: "ERROR", message: "Type your full name and tick the box." };

  const current = await ctx.store.getAgreement(user.vendorId);
  if (current?.agreementVersion === AGREEMENT_VERSION) return { status: "SAVED" };

  await ctx.store.saveAgreement({
    vendorId: user.vendorId,
    agreementVersion: AGREEMENT_VERSION,
    signedByName: parsed.data.signedByName,
    signedAt: ctx.now,
    documentChecksum: AGREEMENT_CHECKSUM,
  });
  await ctx.store.recordAdminAudit({
    actorType: "VENDOR",
    actorId: user.id,
    actorName: user.name,
    action: "AGREEMENT_ACCEPTED",
    entityType: "vendor_users",
    entityId: user.vendorId,
    note: AGREEMENT_VERSION,
    now: ctx.now,
  });
  return { status: "SAVED" };
}

export async function hasCurrentAgreement(store: EtimaadStore, vendorId: string): Promise<boolean> {
  return (await store.getAgreement(vendorId))?.agreementVersion === AGREEMENT_VERSION;
}
