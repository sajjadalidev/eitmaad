"use client";

import { useActionState } from "react";
import type { VendorAdminAction } from "@/server/store";
import { vendorAction, type VendorActionState } from "./actions";

const INITIAL: VendorActionState = { status: "IDLE", message: null };

export interface VendorPanelProps {
  vendorId: string;
  allowed: VendorAdminAction[];
  trustWeight: number;
  // Allowed range per status, or null when the status fixes the weight.
  ranges: { ACTIVE: { min: number; max: number } | null; PROBATION: { min: number; max: number } | null };
  currentRange: { min: number; max: number } | null;
  activeKeys: { id: string; keyPrefix: string }[];
  restrictedWeight: number;
}

export function VendorPanel(props: VendorPanelProps) {
  const [state, formAction, pending] = useActionState(vendorAction, INITIAL);
  const can = (a: VendorAdminAction) => props.allowed.includes(a);
  const hidden = (action: VendorAdminAction) => (
    <>
      <input type="hidden" name="vendorId" value={props.vendorId} />
      <input type="hidden" name="action" value={action} />
    </>
  );
  const weightField = (id: string, range: { min: number; max: number }, value: number) => (
    <div className="field">
      <label htmlFor={id}>
        Trust weight ({range.min} to {range.max})
      </label>
      <input id={id} name="trustWeight" type="number" min={range.min} max={range.max} step={0.05} defaultValue={value} required />
    </div>
  );

  if (props.allowed.length === 0) return <p className="muted">Your role can only view this vendor.</p>;

  return (
    <div className="stack">
      {state.message && (
        <p className={state.status === "ERROR" ? "notice" : "badge badge-accent"} role={state.status === "ERROR" ? "alert" : "status"}>
          {state.message}
        </p>
      )}

      <div className="grid grid-2">
        {can("MAKE_ACTIVE") && props.ranges.ACTIVE && (
          <form className="card form" action={formAction}>
            {hidden("MAKE_ACTIVE")}
            <h3>End probation</h3>
            <p className="muted small">Makes the vendor ACTIVE with a full lookup quota.</p>
            {weightField("w-active", props.ranges.ACTIVE, Math.max(props.ranges.ACTIVE.min, props.trustWeight))}
            <div className="field">
              <label htmlFor="n-active">Note (optional)</label>
              <textarea id="n-active" name="note" rows={2} maxLength={2000} />
            </div>
            <button className="btn btn-primary" disabled={pending}>
              Make active
            </button>
          </form>
        )}

        {can("SET_TRUST_WEIGHT") && props.currentRange && (
          <form className="card form" action={formAction}>
            {hidden("SET_TRUST_WEIGHT")}
            <h3>Change trust weight</h3>
            <p className="muted small">Scores use the new weight as each customer&apos;s score is rebuilt.</p>
            {weightField("w-set", props.currentRange, props.trustWeight)}
            <div className="field">
              <label htmlFor="n-set">Reason (optional)</label>
              <textarea id="n-set" name="note" rows={2} maxLength={2000} />
            </div>
            <button className="btn" disabled={pending}>
              Save trust weight
            </button>
          </form>
        )}

        {can("RESTRICT") && (
          <form className="card form" action={formAction}>
            {hidden("RESTRICT")}
            <h3>Restrict</h3>
            <p className="muted small">
              Trust weight drops to {props.restrictedWeight} and risk checks to 200 a day. Use for bad data or abuse.
            </p>
            <div className="field">
              <label htmlFor="n-restrict">Reason (required)</label>
              <textarea id="n-restrict" name="note" rows={2} maxLength={2000} required />
            </div>
            <button className="btn" disabled={pending}>
              Restrict vendor
            </button>
          </form>
        )}

        {can("LIFT_RESTRICTION") && props.ranges.PROBATION && (
          <form className="card form" action={formAction}>
            {hidden("LIFT_RESTRICTION")}
            <h3>Lift restriction</h3>
            <div className="field">
              <label htmlFor="s-lift">New status</label>
              <select id="s-lift" name="targetStatus" defaultValue="PROBATION">
                <option value="PROBATION">Probation (trust {props.ranges.PROBATION.min} to {props.ranges.PROBATION.max})</option>
                {props.ranges.ACTIVE && (
                  <option value="ACTIVE">
                    Active (trust {props.ranges.ACTIVE.min} to {props.ranges.ACTIVE.max})
                  </option>
                )}
              </select>
            </div>
            {weightField("w-lift", { min: 0.1, max: props.ranges.PROBATION.max }, 0.5)}
            <div className="field">
              <label htmlFor="n-lift">Reason (required)</label>
              <textarea id="n-lift" name="note" rows={2} maxLength={2000} required />
            </div>
            <button className="btn" disabled={pending}>
              Lift restriction
            </button>
          </form>
        )}

        {can("REVOKE_KEY") && props.activeKeys.length > 0 && (
          <form className="card form" action={formAction}>
            {hidden("REVOKE_KEY")}
            <h3>Revoke an API key</h3>
            <p className="muted small">The key stops working at once. Use it if a key leaked.</p>
            <div className="field">
              <label htmlFor="k-revoke">Key</label>
              <select id="k-revoke" name="keyId">
                {props.activeKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    etm_{k.keyPrefix}_...
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="n-revoke">Reason (optional)</label>
              <textarea id="n-revoke" name="note" rows={2} maxLength={2000} />
            </div>
            <button className="btn" disabled={pending}>
              Revoke key
            </button>
          </form>
        )}

        {can("ADD_NOTE") && (
          <form className="card form" action={formAction}>
            {hidden("ADD_NOTE")}
            <h3>Add a note</h3>
            <div className="field">
              <label htmlFor="n-note">Note</label>
              <textarea id="n-note" name="note" rows={2} maxLength={2000} required />
            </div>
            <button className="btn" disabled={pending}>
              Save note
            </button>
          </form>
        )}

        {can("TERMINATE") && (
          <form className="card form" action={formAction}>
            {hidden("TERMINATE")}
            <h3>Terminate</h3>
            <p className="muted small">Final. All API keys are revoked and the vendor&apos;s users can no longer log in.</p>
            <div className="field">
              <label htmlFor="n-term">Reason (required)</label>
              <textarea id="n-term" name="note" rows={2} maxLength={2000} required />
            </div>
            <label className="choice">
              <input type="checkbox" required />
              <span>I understand this cannot be undone.</span>
            </label>
            <button className="btn" disabled={pending}>
              Terminate vendor
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
