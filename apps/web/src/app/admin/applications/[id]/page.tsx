import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  APPLICATION_STATUS_LABEL as STATUS_LABEL,
  APPROVAL_CHECKS,
  DOCUMENTS,
  DOCUMENTS_BY_TYPE,
  MAX_TRUST_WEIGHT,
  PROBATION_DAYS,
  allowedActions,
  type DocumentKey,
} from "@/server/application-review";
import { getRuntime } from "@/server/config";
import { requireSession } from "@/server/require-session";
import type { ReviewAction } from "@/server/store";
import { ReviewPanel } from "./review-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Application review" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERSONAL_EMAIL = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com"];

const ACTION_LABEL: Record<ReviewAction, string> = {
  START_REVIEW: "Review started",
  REQUEST_DOCUMENTS: "Documents requested",
  DOCUMENTS_RECEIVED: "Documents received",
  ADD_NOTE: "Note added",
  APPROVE: "Approved, vendor created",
  REJECT: "Rejected",
};

const BUSINESS_TYPE_LABEL = { PVT_LTD: "Private Ltd", PARTNERSHIP: "Partnership", SOLE_PROPRIETOR: "Sole proprietor" };

const docLabel = (key: string) => DOCUMENTS[key as DocumentKey] ?? key;
const when = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function Check({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  const cls = ok === null ? "status-mid" : ok ? "status-ok" : "status-bad";
  const mark = ok === null ? "?" : ok ? "OK" : "Check";
  return (
    <li>
      <strong className={cls}>{mark}</strong> {children}
    </li>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession("admin");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { store } = getRuntime();
  const application = await store.getApplication(id);
  if (!application) notFound();
  const [history, matches] = await Promise.all([
    store.listApplicationHistory(id),
    store.findApplicationMatches(application),
  ]);

  const emailDomain = application.contactEmail.split("@")[1]?.toLowerCase() ?? "";
  const storeHost = hostOf(application.storeUrl);
  const personalEmail = PERSONAL_EMAIL.includes(emailDomain);
  const suggested = DOCUMENTS_BY_TYPE[application.businessType];

  return (
    <>
      <p className="small">
        <Link href="/admin/vendors">Back to vendors and applications</Link>
      </p>
      <h1>
        {application.displayName} <span className="badge">{STATUS_LABEL[application.status]}</span>
      </h1>

      <div className="grid grid-2">
        <div className="card stack">
          <h2>Details</h2>
          <p>
            <strong>Legal name:</strong> {application.legalName}
            <br />
            <strong>Business:</strong> {application.category} / {BUSINESS_TYPE_LABEL[application.businessType]}
            <br />
            <strong>Platform:</strong> {application.platform}
            <br />
            <strong>Website:</strong>{" "}
            {application.storeUrl ? (
              <a href={application.storeUrl} target="_blank" rel="noopener noreferrer nofollow">
                {application.storeUrl}
              </a>
            ) : (
              "not given"
            )}
            <br />
            <strong>Contact:</strong> {application.contactName},{" "}
            <a href={`mailto:${application.contactEmail}`}>{application.contactEmail}</a>
            <br />
            <strong>Applied:</strong> {when(application.createdAt)} UTC
          </p>
          {application.vendorId && (
            <p className="badge badge-accent">Vendor created. It now appears in the vendors list.</p>
          )}
        </div>

        <div className="card stack">
          <h2>Cross checks</h2>
          <ul className="plain-list">
            <Check ok={matches.otherApplicationsSameEmail === 0}>
              {matches.otherApplicationsSameEmail === 0
                ? "No other application with this email."
                : `${matches.otherApplicationsSameEmail} other application(s) with this email.`}
            </Check>
            <Check ok={matches.otherApplicationsSameNetwork <= 1}>
              {matches.otherApplicationsSameNetwork === 0
                ? "No other application from the same network."
                : `${matches.otherApplicationsSameNetwork} other application(s) from the same network.`}
            </Check>
            <Check ok={matches.similarVendors.length === 0}>
              {matches.similarVendors.length === 0
                ? "No existing vendor with a similar name."
                : `Similar vendor names: ${matches.similarVendors.map((v) => `${v.displayName} (${v.status})`).join(", ")}.`}
            </Check>
            <Check ok={storeHost ? true : null}>
              {storeHost ? `Website given: ${storeHost}. Open it and confirm it is a real store.` : "No website given."}
            </Check>
            <Check ok={personalEmail ? null : storeHost ? emailDomain === storeHost || storeHost.endsWith(`.${emailDomain}`) : null}>
              {personalEmail
                ? `Personal email (${emailDomain}). Ask for a business proof.`
                : storeHost && (emailDomain === storeHost || storeHost.endsWith(`.${emailDomain}`))
                  ? "Email domain matches the website."
                  : `Email domain (${emailDomain}) does not match the website.`}
            </Check>
          </ul>
          <p className="muted small">Manual checks: NTN on the FBR Active Taxpayer List, and CNIC name against the business.</p>
        </div>
      </div>

      {application.requestedDocuments.length > 0 && (
        <div className="card stack">
          <h2>Waiting for these documents</h2>
          <ul>
            {application.requestedDocuments.map((d) => (
              <li key={d}>{docLabel(d)}</li>
            ))}
          </ul>
        </div>
      )}

      <h2>Decision</h2>
      <ReviewPanel
        applicationId={application.id}
        allowed={allowedActions(application.status, session.role)}
        documents={(Object.keys(DOCUMENTS) as DocumentKey[]).map((key) => ({
          key,
          label: DOCUMENTS[key],
          suggested: suggested.includes(key),
          requested: application.requestedDocuments.includes(key),
        }))}
        checks={Object.entries(APPROVAL_CHECKS).map(([key, label]) => ({ key, label }))}
        maxTrust={MAX_TRUST_WEIGHT}
        probationDays={PROBATION_DAYS}
      />

      <h2>History</h2>
      <div className="card">
        <ol className="timeline">
          <li>
            <strong>Application received</strong>
            <br />
            <span className="muted small">{when(application.createdAt)} UTC, from the join form</span>
          </li>
          {history.map((e) => (
            <li key={e.id}>
              <strong>{ACTION_LABEL[e.action]}</strong>
              {e.fromStatus !== e.toStatus && (
                <span className="muted small">
                  {" "}
                  ({STATUS_LABEL[e.fromStatus]} to {STATUS_LABEL[e.toStatus]})
                </span>
              )}
              <br />
              <span className="muted small">
                {when(e.createdAt)} UTC, by {e.actorName ?? "unknown"}
              </span>
              {e.note && <p className="small">{e.note}</p>}
              {e.action === "REQUEST_DOCUMENTS" && e.documents.length > 0 && (
                <p className="small">Asked for: {e.documents.map(docLabel).join(", ")}.</p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
