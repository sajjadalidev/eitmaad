// Simple admin audit rows: who looked at or acted on what, and when (blueprint section 13).

import type { AdminAuditEntry, AdminAuditRow } from "./store";

export function adminAuditValues(entry: AdminAuditEntry) {
  return {
    actorType: "ADMIN" as const,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: null,
    after: { actorName: entry.actorName, note: entry.note },
    createdAt: entry.now,
  };
}

export function toAdminAuditRow(id: string, action: string, after: unknown, createdAt: Date): AdminAuditRow {
  const a = (after ?? {}) as { actorName?: string; note?: string | null };
  return { id, action, actorName: a.actorName ?? null, note: a.note ?? null, createdAt };
}
