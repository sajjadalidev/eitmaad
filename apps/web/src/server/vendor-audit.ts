// How admin changes to a vendor are written to and read from AUDIT_LOG.

import type { VendorStatus } from "@etimaad/core";
import { VENDOR_ADMIN_ACTIONS, type VendorAdminAction, type VendorChange, type VendorEvent } from "./store";

export const VENDOR_ENTITY = "vendor";
const ACTION_PREFIX = "VENDOR_";

export interface VendorAuditRow {
  actorType: "ADMIN";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: { status: VendorStatus; trustWeight: number };
  after: { status: VendorStatus; trustWeight: number; note: string | null; keyPrefix: string | null; actorName: string };
  createdAt: Date;
}

export function vendorAuditRow(change: VendorChange): VendorAuditRow {
  return {
    actorType: "ADMIN",
    actorId: change.actorId,
    action: `${ACTION_PREFIX}${change.action}`,
    entityType: VENDOR_ENTITY,
    entityId: change.vendorId,
    before: { status: change.fromStatus, trustWeight: change.fromTrust },
    after: {
      status: change.toStatus,
      trustWeight: change.toTrust,
      note: change.note,
      keyPrefix: change.keyPrefix,
      actorName: change.actorName,
    },
    createdAt: change.now,
  };
}

export function toVendorEvent(id: string, action: string, before: unknown, after: unknown, createdAt: Date): VendorEvent {
  const b = (before ?? {}) as Partial<VendorAuditRow["before"]>;
  const a = (after ?? {}) as Partial<VendorAuditRow["after"]>;
  const name = action.startsWith(ACTION_PREFIX) ? action.slice(ACTION_PREFIX.length) : action;
  const fromStatus = b.status ?? "PROBATION";
  const fromTrust = b.trustWeight ?? 0;
  return {
    id,
    action: (VENDOR_ADMIN_ACTIONS as readonly string[]).includes(name) ? (name as VendorAdminAction) : "ADD_NOTE",
    actorName: a.actorName ?? null,
    fromStatus,
    toStatus: a.status ?? fromStatus,
    fromTrust,
    toTrust: a.trustWeight ?? fromTrust,
    note: a.note ?? null,
    keyPrefix: a.keyPrefix ?? null,
    createdAt,
  };
}
