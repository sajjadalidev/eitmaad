"use client";

import { useActionState } from "react";
import { recomputeAction, searchAction, type CustomerActionState } from "./actions";

const INITIAL: CustomerActionState = { status: "IDLE", message: null };

export function SearchForm() {
  const [state, formAction, pending] = useActionState(searchAction, INITIAL);
  return (
    <form className="card form" action={formAction}>
      <div className="field">
        <label htmlFor="phone">Customer mobile number</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" placeholder="03XX XXXXXXX" autoComplete="off" required maxLength={20} />
      </div>
      {state.status === "ERROR" && state.message && (
        <p className="notice" role="alert">
          {state.message}
        </p>
      )}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Searching..." : "Find customer"}
      </button>
    </form>
  );
}

export function RecomputeForm({ customerId }: { customerId: string }) {
  const [state, formAction, pending] = useActionState(recomputeAction, INITIAL);
  return (
    <form action={formAction} className="btn-row">
      <input type="hidden" name="customerId" value={customerId} />
      <button className="btn" disabled={pending}>
        {pending ? "Rebuilding..." : "Rebuild score now"}
      </button>
      {state.message && (
        <span className={state.status === "ERROR" ? "status-bad small" : "status-ok small"} role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}
