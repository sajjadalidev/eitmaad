// Admin review of vendor applications (blueprint section 20.3).
// Every step is checked here, then saved with an audit row in one transaction.

import { z } from "zod";
import type {
  ApplicationChange,
  ApplicationStatus,
  BUSINESS_TYPES,
  EtimaadStore,
  NewVendorCredentials,
  ReviewAction,
} from "./store";

export const PROBATION_DAYS = 60;

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  NEW: "New",
  REVIEWING: "Under review",
  DOCUMENTS_REQUESTED: "Waiting for documents",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
const DAY_MS = 86_400_000;

// Documents an admin can ask for. Keys are stored; labels are shown.
export const DOCUMENTS = {
  SECP_CERTIFICATE: "SECP incorporation certificate",
  NTN_CERTIFICATE: "NTN certificate (FBR)",
  FIRM_REGISTRATION: "Firm registration certificate",
  OWNER_CNIC: "Owner CNIC (front and back)",
  BUSINESS_PROOF: "One business proof (utility bill, bank letter or lease)",
  STORE_OWNERSHIP: "Proof of store ownership (plugin install or admin screenshot)",
  DATA_SHARING_AGREEMENT: "Signed data sharing agreement",
} as const;
export type DocumentKey = keyof typeof DOCUMENTS;
const DOCUMENT_KEYS = Object.keys(DOCUMENTS) as DocumentKey[];

// Documents usually needed for full KYC, by business type (see the admin KYC table).
export const DOCUMENTS_BY_TYPE: Record<(typeof BUSINESS_TYPES)[number], DocumentKey[]> = {
  PVT_LTD: ["SECP_CERTIFICATE", "NTN_CERTIFICATE", "DATA_SHARING_AGREEMENT"],
  PARTNERSHIP: ["FIRM_REGISTRATION", "NTN_CERTIFICATE", "DATA_SHARING_AGREEMENT"],
  SOLE_PROPRIETOR: ["NTN_CERTIFICATE", "OWNER_CNIC", "BUSINESS_PROOF", "DATA_SHARING_AGREEMENT"],
};

// Must all be confirmed before approval.
export const APPROVAL_CHECKS = {
  NTN_ACTIVE: "NTN appears on the FBR Active Taxpayer List.",
  CNIC_UNIQUE: "CNIC is not already used by another vendor.",
  STORE_OWNED: "Store ownership is proven by a plugin or app install.",
  AGREEMENT_ACCEPTED: "Data sharing agreement is accepted.",
} as const;
const CHECK_KEYS = Object.keys(APPROVAL_CHECKS);

export const MAX_TRUST_WEIGHT = { FULL: 1, LIGHT: 0.7 } as const;

const OPEN: ApplicationStatus[] = ["NEW", "REVIEWING", "DOCUMENTS_REQUESTED"];

interface Rule {
  from: ApplicationStatus[];
  // null keeps the current status.
  to: ApplicationStatus | null;
  roles: string[];
  noteRequired: boolean;
}

export const REVIEW_RULES: Record<ReviewAction, Rule> = {
  START_REVIEW: { from: ["NEW"], to: "REVIEWING", roles: ["ADMIN", "SUPPORT"], noteRequired: false },
  REQUEST_DOCUMENTS: { from: OPEN, to: "DOCUMENTS_REQUESTED", roles: ["ADMIN", "SUPPORT"], noteRequired: false },
  DOCUMENTS_RECEIVED: { from: ["DOCUMENTS_REQUESTED"], to: "REVIEWING", roles: ["ADMIN", "SUPPORT"], noteRequired: false },
  ADD_NOTE: { from: [...OPEN, "APPROVED", "REJECTED"], to: null, roles: ["ADMIN", "SUPPORT"], noteRequired: true },
  APPROVE: { from: ["REVIEWING"], to: "APPROVED", roles: ["ADMIN"], noteRequired: false },
  REJECT: { from: OPEN, to: "REJECTED", roles: ["ADMIN"], noteRequired: true },
};

// Actions this person may take on an application in this status.
export function allowedActions(status: ApplicationStatus, role: string): ReviewAction[] {
  return (Object.keys(REVIEW_RULES) as ReviewAction[]).filter((a) => {
    const rule = REVIEW_RULES[a];
    return rule.from.includes(status) && rule.roles.includes(role);
  });
}

const inputSchema = z.object({
  applicationId: z.uuid(),
  action: z.enum(Object.keys(REVIEW_RULES) as [ReviewAction, ...ReviewAction[]]),
  note: z.string().trim().max(2000).optional(),
  documents: z.array(z.enum(DOCUMENT_KEYS as [DocumentKey, ...DocumentKey[]])).max(DOCUMENT_KEYS.length).default([]),
  checks: z.array(z.string()).default([]),
  kycLevel: z.enum(["FULL", "LIGHT"]).optional(),
  trustWeight: z.coerce.number().optional(),
});

export interface Reviewer {
  id: string;
  name: string;
  role: string;
}

export type ReviewResult =
  | { status: "SAVED"; credentials?: NewVendorCredentials }
  | { status: "ERROR"; message: string };

const fail = (message: string): ReviewResult => ({ status: "ERROR", message });

export async function reviewApplication(
  ctx: { store: EtimaadStore; now: Date },
  reviewer: Reviewer,
  raw: unknown,
): Promise<ReviewResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return fail("The form is not valid. Reload the page and try again.");
  const input = parsed.data;
  const note = input.note ? input.note : null;

  const application = await ctx.store.getApplication(input.applicationId);
  if (!application) return fail("Application not found.");

  const rule = REVIEW_RULES[input.action];
  if (!rule.roles.includes(reviewer.role)) return fail("Your role cannot do this.");
  if (!rule.from.includes(application.status)) {
    return fail("This step is not possible in the current status. Reload the page.");
  }
  if (rule.noteRequired && !note) return fail("Please write a note.");

  let requestedDocuments = application.requestedDocuments;
  if (input.action === "REQUEST_DOCUMENTS") {
    if (input.documents.length === 0) return fail("Choose at least one document.");
    requestedDocuments = input.documents;
  } else if (input.action === "DOCUMENTS_RECEIVED" || input.action === "APPROVE" || input.action === "REJECT") {
    requestedDocuments = [];
  }

  const change: ApplicationChange = {
    applicationId: application.id,
    action: input.action,
    fromStatus: application.status,
    toStatus: rule.to ?? application.status,
    note,
    requestedDocuments,
    actorId: reviewer.id,
    actorName: reviewer.name,
    now: ctx.now,
  };

  if (input.action !== "APPROVE") {
    const saved = await ctx.store.reviewApplication(change);
    return saved === "SAVED" ? { status: "SAVED" } : fail("Someone else changed this application. Reload the page.");
  }

  if (!CHECK_KEYS.every((k) => input.checks.includes(k))) return fail("Confirm every check before approving.");
  if (!input.kycLevel) return fail("Choose the KYC level.");
  const max = MAX_TRUST_WEIGHT[input.kycLevel];
  const weight = input.trustWeight;
  if (weight === undefined || !Number.isFinite(weight) || weight < 0.1 || weight > max) {
    return fail(`Trust weight must be between 0.1 and ${max} for ${input.kycLevel.toLowerCase()} KYC.`);
  }

  const result = await ctx.store.approveApplication(change, {
    kycLevel: input.kycLevel,
    trustWeight: Math.round(weight * 100) / 100,
    probationEndsAt: new Date(ctx.now.getTime() + PROBATION_DAYS * DAY_MS),
  });
  if (result.status === "STALE") return fail("Someone else changed this application. Reload the page.");
  return { status: "SAVED", credentials: result.credentials };
}
