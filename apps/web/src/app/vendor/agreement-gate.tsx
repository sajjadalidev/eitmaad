"use client";

import { useActionState } from "react";
import { agreementAction, type FormState } from "./self-service-actions";

const INITIAL: FormState = { status: "IDLE", message: null };

export function AgreementGate({ points, version, isOwner }: { points: readonly string[]; version: string; isOwner: boolean }) {
  const [state, formAction, pending] = useActionState(agreementAction, INITIAL);

  return (
    <div className="stack">
      <h1>Data sharing agreement</h1>
      <p className="muted">Before you use Etimaad, the store owner accepts these rules once. Version {version}.</p>
      <div className="card">
        <ol className="stack">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </div>
      {isOwner ? (
        <form className="card form" action={formAction}>
          <div className="field">
            <label htmlFor="signedByName">Your full name</label>
            <input id="signedByName" name="signedByName" required minLength={3} maxLength={120} autoComplete="name" />
          </div>
          <label className="choice">
            <input type="checkbox" name="accepted" value="yes" required />
            <span>I accept this agreement for my store.</span>
          </label>
          {state.status === "ERROR" && state.message && (
            <p className="notice" role="alert">
              {state.message}
            </p>
          )}
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Saving..." : "Accept and continue"}
          </button>
          <p className="muted small">We save your name, the time and the agreement version.</p>
        </form>
      ) : (
        <p className="notice">Your store owner must accept this agreement first. Ask them to log in.</p>
      )}
    </div>
  );
}
