// Vendor sign-up applications from the public /join form (blueprint section 20.1).
// Saving an application never creates a vendor or an API key. An admin reviews it first.

import { randomUUID } from "node:crypto";
import { SOURCE_PLATFORMS, hmacSha256Hex } from "@etimaad/core";
import { z } from "zod";
import { BUSINESS_TYPES, VENDOR_CATEGORIES, type EtimaadStore } from "./store";

const HOUR_MS = 3_600_000;
export const MAX_PER_EMAIL_PER_DAY = 3;
export const MAX_PER_IP_PER_HOUR = 5;

// Hidden field. People never see it; simple bots fill it in.
import { HONEYPOT_FIELD } from "./honeypot";

export { HONEYPOT_FIELD };

const URL_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;

export const applicationSchema = z.object({
  legal_name: z.string().trim().min(2).max(200),
  display_name: z.string().trim().min(2).max(200),
  category: z.enum(VENDOR_CATEGORIES),
  business_type: z.enum(BUSINESS_TYPES),
  platform: z.enum(SOURCE_PLATFORMS),
  store_url: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || URL_PATTERN.test(v))
    .optional(),
  contact_name: z.string().trim().min(2).max(120),
  contact_email: z.string().trim().toLowerCase().email().max(320),
});

export type ApplicationResult =
  | { status: "RECEIVED" }
  | { status: "INVALID_INPUT"; fields: string[] }
  | { status: "ALREADY_RECEIVED" }
  | { status: "TOO_MANY" };

export interface ApplicationContext {
  store: EtimaadStore;
  pepper: string;
  now: Date;
}

export async function submitApplication(
  ctx: ApplicationContext,
  input: Record<string, unknown>,
  ip: string | null,
): Promise<ApplicationResult> {
  // Looks like success to a bot, but nothing is saved.
  const trap = input[HONEYPOT_FIELD];
  if (typeof trap === "string" && trap.trim() !== "") {
    // Logged without any form data, so a wrongly caught person can be noticed.
    console.warn("Join form: hidden spam field was filled; application not saved.");
    return { status: "RECEIVED" };
  }

  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "form")))];
    return { status: "INVALID_INPUT", fields };
  }
  const a = parsed.data;

  const sameEmail = await ctx.store.countApplicationsSince(
    { contactEmail: a.contact_email },
    new Date(ctx.now.getTime() - 24 * HOUR_MS),
  );
  if (sameEmail >= MAX_PER_EMAIL_PER_DAY) return { status: "ALREADY_RECEIVED" };

  const ipHash = ip ? hmacSha256Hex(ctx.pepper, `ip:${ip}`) : null;
  if (ipHash) {
    const sameIp = await ctx.store.countApplicationsSince({ ipHash }, new Date(ctx.now.getTime() - HOUR_MS));
    if (sameIp >= MAX_PER_IP_PER_HOUR) return { status: "TOO_MANY" };
  }

  await ctx.store.saveApplication({
    id: randomUUID(),
    legalName: a.legal_name,
    displayName: a.display_name,
    category: a.category,
    businessType: a.business_type,
    platform: a.platform,
    storeUrl: a.store_url ? a.store_url : null,
    contactName: a.contact_name,
    contactEmail: a.contact_email,
    ipHash,
    status: "NEW",
    createdAt: ctx.now,
  });
  return { status: "RECEIVED" };
}
