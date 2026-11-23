// How application review steps are written to and read from AUDIT_LOG.

import { REVIEW_ACTIONS, type ApplicationChange, type ApplicationEvent, type ApplicationStatus, type ReviewAction } from "./store";

export const APPLICATION_ENTITY = "vendor_application";
const ACTION_PREFIX = "APPLICATION_";

export interface AuditRowValues {
  actorType: "ADMIN";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: { status: ApplicationStatus };
  after: { status: ApplicationStatus; note: string | null; documents: string[]; actorName: string; vendorId?: string };
  createdAt: Date;
}

export function applicationAuditRow(change: ApplicationChange, vendorId?: string): AuditRowValues {
  return {
    actorType: "ADMIN",
    actorId: change.actorId,
    action: `${ACTION_PREFIX}${change.action}`,
    entityType: APPLICATION_ENTITY,
    entityId: change.applicationId,
    before: { status: change.fromStatus },
    after: {
      status: change.toStatus,
      note: change.note,
      documents: change.requestedDocuments,
      actorName: change.actorName,
      ...(vendorId ? { vendorId } : {}),
    },
    createdAt: change.now,
  };
}

export function toApplicationEvent(
  id: string,
  action: string,
  actorId: string | null,
  before: unknown,
  after: unknown,
  createdAt: Date,
): ApplicationEvent {
  const b = (before ?? {}) as Partial<AuditRowValues["before"]>;
  const a = (after ?? {}) as Partial<AuditRowValues["after"]>;
  const name = action.startsWith(ACTION_PREFIX) ? action.slice(ACTION_PREFIX.length) : action;
  return {
    id,
    action: (REVIEW_ACTIONS as readonly string[]).includes(name) ? (name as ReviewAction) : "ADD_NOTE",
    actorId,
    actorName: a.actorName ?? null,
    fromStatus: b.status ?? "NEW",
    toStatus: a.status ?? b.status ?? "NEW",
    note: a.note ?? null,
    documents: a.documents ?? [],
    createdAt,
  };
}
