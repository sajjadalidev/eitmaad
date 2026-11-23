"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ReviewAction } from "@/server/store";
import { reviewAction, type ReviewState } from "./actions";

const INITIAL: ReviewState = { status: "IDLE", message: null, credentials: null };

export interface ReviewPanelProps {
  applicationId: string;
  allowed: ReviewAction[];
  documents: { key: string; label: string; suggested: boolean; requested: boolean }[];
  checks: { key: string; label: string }[];
  maxTrust: { FULL: number; LIGHT: number };
  probationDays: number;
}

export function ReviewPanel(props: ReviewPanelProps) {
  const [state, formAction, pending] = useActionState(reviewAction, INITIAL);
  const can = (a: ReviewAction) => props.allowed.includes(a);
  const hidden = (action: ReviewAction) => (
    <>
      <input type="hidden" name="applicationId" value={props.applicationId} />
      <input type="hidden" name="action" value={action} />
    </>
  );

  if (state.credentials) {
    const c = state.credentials;
    return (
      <div className="card stack" role="status">
        <h2>Vendor created</h2>
        <p className="notice">
          Copy the API key and signing secret now and send them to the vendor in a safe way. They are shown only
          once and are not stored in plain text.
        </p>
        <div className="field">
          <label>API key</label>
          <div className="secret">{c.apiKey}</div>
        </div>
        <div className="field">
          <label>Signing secret</label>
          <div className="secret">{c.signingSecret}</div>
        </div>
        <p className="muted small">
          The vendor starts on {props.probationDays} days of probation. Next, add the owner&apos;s login in Supabase
          and link it with the link-user script.
        </p>
        <p>
          <Link href="/admin/vendors">Back to vendors</Link>
        </p>
      </div>
    );
  }

  if (props.allowed.length === 0) {
    return <p className="muted">Your role can only view this application.</p>;
  }

  return (
    <div className="stack">
      {state.message && (
        <p className={state.status === "ERROR" ? "notice" : "badge badge-accent"} role={state.status === "ERROR" ? "alert" : "status"}>
          {state.message}
        </p>
      )}

      {(can("START_REVIEW") || can("DOCUMENTS_RECEIVED")) && (
        <form className="card form" action={formAction}>
          {hidden(can("START_REVIEW") ? "START_REVIEW" : "DOCUMENTS_RECEIVED")}
          <h3>{can("START_REVIEW") ? "Start the review" : "Documents received"}</h3>
          <p className="muted small">
            {can("START_REVIEW")
              ? "Marks the application as under review so others know you are on it."
              : "Use this when the applicant has sent the requested documents. The review continues."}
          </p>
          <div className="field">
            <label htmlFor="note-start">Note (optional)</label>
            <textarea id="note-start" name="note" rows={2} maxLength={2000} />
          </div>
          <button className="btn btn-primary" disabled={pending}>
            {can("START_REVIEW") ? "Start review" : "Mark documents received"}
          </button>
        </form>
      )}

      {can("REQUEST_DOCUMENTS") && (
        <form className="card form" action={formAction}>
          {hidden("REQUEST_DOCUMENTS")}
          <h3>Ask for documents</h3>
          <p className="muted small">Ticked items are the usual ones for this business type. Email the applicant the list.</p>
          {props.documents.map((d) => (
            <label key={d.key} className="choice">
              <input type="checkbox" name="documents" value={d.key} defaultChecked={d.requested || d.suggested} />
              <span>{d.label}</span>
            </label>
          ))}
          <div className="field">
            <label htmlFor="note-docs">Message for the record (optional)</label>
            <textarea id="note-docs" name="note" rows={2} maxLength={2000} />
          </div>
          <button className="btn" disabled={pending}>
            Request documents
          </button>
        </form>
      )}

      {can("APPROVE") && (
        <form className="card form" action={formAction}>
          {hidden("APPROVE")}
          <h3>Approve</h3>
          <p className="muted small">
            Creates the vendor on {props.probationDays} days of probation with its first API key.
          </p>
          {props.checks.map((c) => (
            <label key={c.key} className="choice">
              <input type="checkbox" name="checks" value={c.key} required />
              <span>{c.label}</span>
            </label>
          ))}
          <div className="field">
            <label htmlFor="kycLevel">KYC level</label>
            <select id="kycLevel" name="kycLevel" defaultValue="FULL">
              <option value="FULL">Full (trust weight up to {props.maxTrust.FULL})</option>
              <option value="LIGHT">Light (trust weight up to {props.maxTrust.LIGHT})</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="trustWeight">Starting trust weight</label>
            <input id="trustWeight" name="trustWeight" type="number" min={0.1} max={1} step={0.05} defaultValue={0.5} required />
          </div>
          <div className="field">
            <label htmlFor="note-approve">Note (optional)</label>
            <textarea id="note-approve" name="note" rows={2} maxLength={2000} />
          </div>
          <button className="btn btn-primary" disabled={pending}>
            Approve and create vendor
          </button>
        </form>
      )}

      {can("REJECT") && (
        <form className="card form" action={formAction}>
          {hidden("REJECT")}
          <h3>Reject</h3>
          <div className="field">
            <label htmlFor="note-reject">Reason (required, kept in the history)</label>
            <textarea id="note-reject" name="note" rows={2} maxLength={2000} required />
          </div>
          <button className="btn" disabled={pending}>
            Reject application
          </button>
        </form>
      )}

      {can("ADD_NOTE") && (
        <form className="card form" action={formAction}>
          {hidden("ADD_NOTE")}
          <h3>Add a note</h3>
          <div className="field">
            <label htmlFor="note-add">Note</label>
            <textarea id="note-add" name="note" rows={2} maxLength={2000} required />
          </div>
          <button className="btn" disabled={pending}>
            Save note
          </button>
        </form>
      )}
    </div>
  );
}
