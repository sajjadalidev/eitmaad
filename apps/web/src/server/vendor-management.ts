// Admin actions on a vendor (blueprint sections 5.1 and 20.3.2).
// Lifecycle: PROBATION -> ACTIVE <-> RESTRICTED -> TERMINATED.

import type { VendorStatus } from "@etimaad/core";
import { z } from "zod";
import { VENDOR_ADMIN_ACTIONS, type EtimaadStore, type VendorAdminAction, type VendorChange, type VendorProfile } from "./store";

export const RESTRICTED_TRUST_WEIGHT = 0.2;
const ACTIVE_MIN_TRUST = 0.7;
const MIN_TRUST = 0.1;

export const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  PENDING_VERIFICATION: "Pending verification",
  PROBATION: "Probation",
  ACTIVE: "Active",
  RESTRICTED: "Restricted",
  TERMINATED: "Terminated",
};

// Highest trust weight for this vendor's KYC level (light KYC is capped for good).
export function maxTrustWeight(kycLevel: VendorProfile["kycLevel"]): number {
  return kycLevel === "LIGHT" ? 0.7 : 1;
}

// Allowed trust weight range for a status, or null if the status fixes it.
export function trustRange(status: VendorStatus, kycLevel: VendorProfile["kycLevel"]): { min: number; max: number } | null {
  const max = maxTrustWeight(kycLevel);
  if (status === "ACTIVE") return { min: Math.min(ACTIVE_MIN_TRUST, max), max };
  if (status === "PROBATION") return { min: MIN_TRUST, max };
  return null;
}

interface Rule {
  from: VendorStatus[];
  roles: string[];
  noteRequired: boolean;
}

const LIVE: VendorStatus[] = ["PENDING_VERIFICATION", "PROBATION", "ACTIVE", "RESTRICTED"];

export const VENDOR_RULES: Record<VendorAdminAction, Rule> = {
  MAKE_ACTIVE: { from: ["PROBATION"], roles: ["ADMIN"], noteRequired: false },
  RESTRICT: { from: ["PROBATION", "ACTIVE"], roles: ["ADMIN"], noteRequired: true },
  LIFT_RESTRICTION: { from: ["RESTRICTED"], roles: ["ADMIN"], noteRequired: true },
  TERMINATE: { from: LIVE, roles: ["ADMIN"], noteRequired: true },
  SET_TRUST_WEIGHT: { from: ["PROBATION", "ACTIVE"], roles: ["ADMIN"], noteRequired: false },
  REVOKE_KEY: { from: LIVE, roles: ["ADMIN"], noteRequired: false },
  ADD_NOTE: { from: [...LIVE, "TERMINATED"], roles: ["ADMIN", "SUPPORT"], noteRequired: true },
};

export function allowedVendorActions(status: VendorStatus, role: string): VendorAdminAction[] {
  return VENDOR_ADMIN_ACTIONS.filter((a) => VENDOR_RULES[a].from.includes(status) && VENDOR_RULES[a].roles.includes(role));
}

const inputSchema = z.object({
  vendorId: z.uuid(),
  action: z.enum(VENDOR_ADMIN_ACTIONS),
  note: z.string().trim().max(2000).optional(),
  trustWeight: z.coerce.number().optional(),
  targetStatus: z.enum(["ACTIVE", "PROBATION"]).optional(),
  keyId: z.string().max(100).optional(),
});

export type VendorActionResult = { status: "SAVED" } | { status: "ERROR"; message: string };
const fail = (message: string): VendorActionResult => ({ status: "ERROR", message });

export async function manageVendor(
  ctx: { store: EtimaadStore; now: Date },
  actor: { id: string; name: string; role: string },
  raw: unknown,
): Promise<VendorActionResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return fail("The form is not valid. Reload the page and try again.");
  const input = parsed.data;
  const note = input.note ? input.note : null;

  const vendor = await ctx.store.getVendorProfile(input.vendorId);
  if (!vendor) return fail("Vendor not found.");

  const rule = VENDOR_RULES[input.action];
  if (!rule.roles.includes(actor.role)) return fail("Your role cannot do this.");
  if (!rule.from.includes(vendor.status)) return fail("This step is not possible in the current status. Reload the page.");
  if (rule.noteRequired && !note) return fail("Please write a reason.");

  let toStatus = vendor.status;
  let toTrust = vendor.trustWeight;
  let keyId: string | null = null;
  let keyPrefix: string | null = null;

  const pickTrust = (status: VendorStatus): string | null => {
    const range = trustRange(status, vendor.kycLevel);
    if (!range) return null;
    const w = input.trustWeight;
    if (w === undefined || !Number.isFinite(w) || w < range.min || w > range.max) {
      return `Trust weight must be between ${range.min} and ${range.max} for ${VENDOR_STATUS_LABEL[status].toLowerCase()}.`;
    }
    toTrust = Math.round(w * 100) / 100;
    return null;
  };

  switch (input.action) {
    case "MAKE_ACTIVE": {
      toStatus = "ACTIVE";
      const error = pickTrust("ACTIVE");
      if (error) return fail(error);
      break;
    }
    case "RESTRICT":
      toStatus = "RESTRICTED";
      toTrust = RESTRICTED_TRUST_WEIGHT;
      break;
    case "LIFT_RESTRICTION": {
      if (!input.targetStatus) return fail("Choose the new status.");
      toStatus = input.targetStatus;
      const error = pickTrust(toStatus);
      if (error) return fail(error);
      break;
    }
    case "TERMINATE":
      toStatus = "TERMINATED";
      break;
    case "SET_TRUST_WEIGHT": {
      const error = pickTrust(vendor.status);
      if (error) return fail(error);
      if (toTrust === vendor.trustWeight) return fail("The trust weight is the same as now.");
      break;
    }
    case "REVOKE_KEY": {
      const key = (await ctx.store.listVendorApiKeys(vendor.id)).find((k) => k.id === input.keyId && k.status === "ACTIVE");
      if (!key) return fail("Choose an active key.");
      keyId = key.id;
      keyPrefix = key.keyPrefix;
      break;
    }
    case "ADD_NOTE":
      break;
  }

  const change: VendorChange = {
    vendorId: vendor.id,
    action: input.action,
    fromStatus: vendor.status,
    toStatus,
    fromTrust: vendor.trustWeight,
    toTrust,
    note,
    keyId,
    keyPrefix,
    actorId: actor.id,
    actorName: actor.name,
    now: ctx.now,
  };
  const saved = await ctx.store.updateVendor(change);
  return saved === "SAVED" ? { status: "SAVED" } : fail("Someone else changed this vendor. Reload the page.");
}
