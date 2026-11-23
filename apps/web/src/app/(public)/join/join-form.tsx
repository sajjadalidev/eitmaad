"use client";

import { useActionState } from "react";
import { HONEYPOT_FIELD } from "@/server/honeypot";
import { joinAction, type JoinState } from "./actions";

const INITIAL: JoinState = { status: "IDLE", message: null, fields: [] };

export function JoinForm() {
  const [state, formAction, pending] = useActionState(joinAction, INITIAL);

  if (state.status === "RECEIVED") {
    return (
      <div className="card stack" role="status">
        <h2>Application received</h2>
        <p>Thank you. We review every application by hand and will contact you by email.</p>
        <p className="muted small">No account or API key is created until the review is done.</p>
      </div>
    );
  }

  const invalid = (name: string) => (state.fields.includes(name) ? true : undefined);

  return (
    <form className="form card" action={formAction} noValidate={false}>
      <div className="field">
        <label htmlFor="legal_name">Business legal name</label>
        <input id="legal_name" name="legal_name" required minLength={2} maxLength={200} aria-invalid={invalid("legal_name")} />
      </div>
      <div className="field">
        <label htmlFor="display_name">Store or brand name</label>
        <input id="display_name" name="display_name" required minLength={2} maxLength={200} aria-invalid={invalid("display_name")} />
      </div>
      <div className="field">
        <label htmlFor="category">Category</label>
        <select id="category" name="category" defaultValue="ecommerce">
          <option value="food">Food and restaurants</option>
          <option value="ecommerce">E-commerce</option>
          <option value="retail">Retail</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="business_type">Business type</label>
        <select id="business_type" name="business_type" defaultValue="SOLE_PROPRIETOR">
          <option value="PVT_LTD">Private Ltd</option>
          <option value="PARTNERSHIP">Partnership</option>
          <option value="SOLE_PROPRIETOR">Sole proprietor</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="platform">Store platform</label>
        <select id="platform" name="platform" defaultValue="WOOCOMMERCE">
          <option value="WOOCOMMERCE">WooCommerce</option>
          <option value="SHOPIFY">Shopify</option>
          <option value="API">Custom (API)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="store_url">Store website</label>
        <input id="store_url" name="store_url" type="url" placeholder="https://" maxLength={300} aria-invalid={invalid("store_url")} />
      </div>
      <div className="field">
        <label htmlFor="contact_name">Your name</label>
        <input id="contact_name" name="contact_name" required minLength={2} maxLength={120} aria-invalid={invalid("contact_name")} />
      </div>
      <div className="field">
        <label htmlFor="contact_email">Work email</label>
        <input
          id="contact_email"
          name="contact_email"
          type="email"
          required
          maxLength={320}
          autoComplete="email"
          aria-invalid={invalid("contact_email")}
        />
      </div>

      {/* Hidden from people. Bots that fill it are ignored. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor={HONEYPOT_FIELD}>Leave this field empty</label>
        <input
          id={HONEYPOT_FIELD}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          data-1p-ignore=""
          data-lpignore="true"
          data-form-type="other"
          defaultValue=""
        />
      </div>

      {state.status === "ERROR" && state.message && (
        <p className="notice" role="alert">
          {state.message}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending..." : "Submit application"}
      </button>
      <p className="muted small">We use these details only to review your application.</p>
    </form>
  );
}
