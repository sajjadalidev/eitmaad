import type { Metadata } from "next";
import { DataTable } from "@/components/data-table";
import { ReasonCodeTable } from "@/components/reason-code-table";

export const metadata: Metadata = { title: "API docs" };

const ENDPOINTS = [
  ["POST", "/v1/order-events", "Send 1 to 100 order events"],
  ["POST", "/v1/batches", "Create a batch upload (NDJSON, up to 50,000 records)"],
  ["GET", "/v1/batches/{id}", "Batch status and error report"],
  ["POST", "/v1/risk/check", "Risk level and recommended action for a phone number"],
  ["POST", "/v1/disputes", "Raise a dispute for an order"],
  ["POST", "/v1/disputes/{id}/vendor-response", "Answer a dispute with evidence"],
] as const;

const ERRORS = [
  ["400", "VALIDATION_ERROR"],
  ["401", "INVALID_KEY, BAD_SIGNATURE, TIMESTAMP_SKEW"],
  ["403", "SCOPE_DENIED, VENDOR_NOT_ACTIVE"],
  ["409", "IDEMPOTENCY_CONFLICT, INVALID_TRANSITION, CORRECTION_WINDOW_EXPIRED"],
  ["422", "INVALID_PHONE, CONSENT_NOTICE_MISSING, OCCURRED_AT_OUT_OF_WINDOW, REASON_STATUS_MISMATCH, PII_IN_REFERENCE"],
  ["429", "QUOTA_EXCEEDED"],
] as const;

const RISK_REQUEST = `POST /v1/risk/check
{
  "phone": "03001234567",
  "order_value_pkr": 18000,
  "payment_method_requested": "COD",
  "checkout_ref": "CHK-9921",
  "mode": "PRE_CHECKOUT"
}`;

const RISK_RESPONSE = `{
  "risk_tier": "MEDIUM",
  "score": 78,
  "recommended_action": "REQUIRE_PARTIAL_ADVANCE",
  "reasons": ["HIGH_ORDER_VALUE"],
  "data_sufficiency": "SUFFICIENT",
  "under_review": false,
  "network_signal": { "vendor_count_band": "2-4", "last_activity_band": "LAST_30_DAYS" },
  "your_history": { "orders": 6, "delivered": 5, "user_fault": 1, "success_rate": 81.82 },
  "model_version": 1
}`;

const SIGNATURE = `X-API-Key: <your key>
X-Timestamp: <unix seconds>
X-Signature: hex(HMAC_SHA256(signing_secret, X-Timestamp + "." + raw_body))`;

export default function DocsPage() {
  return (
    <section className="section">
      <div className="container stack">
        <h1>API docs</h1>
        <p className="lead">Overview of the Etimaad API. The full reference will be published with the pilot.</p>
        <p className="notice">The API is not live yet. Base URL and keys are shared with pilot merchants.</p>

        <h2>Authentication</h2>
        <p>Every request sends your API key. Write requests are also signed and must be sent within 5 minutes.</p>
        <pre>
          <code>{SIGNATURE}</code>
        </pre>
        <ul>
          <li>Phone numbers are always sent in the request body, never in the URL.</li>
          <li>
            Each event has your own <code>event_id</code>. Sending the same event again is safe.
          </li>
        </ul>

        <h2>Endpoints</h2>
        <DataTable
          columns={["Method", "Path", "Purpose"]}
          rows={ENDPOINTS.map(([m, p, d]) => [<code key="m">{m}</code>, <code key="p">{p}</code>, d])}
        />

        <h2>Risk check</h2>
        <div className="grid grid-2">
          <div>
            <p className="muted small">Request</p>
            <pre>
              <code>{RISK_REQUEST}</code>
            </pre>
          </div>
          <div>
            <p className="muted small">Response</p>
            <pre>
              <code>{RISK_RESPONSE}</code>
            </pre>
          </div>
        </div>
        <ul>
          <li>An unknown phone gets the same answer shape as a customer with little data.</li>
          <li>The score is shown only when at least 3 merchants have data for the customer.</li>
        </ul>

        <h2>Reason codes</h2>
        <p>
          Every failed, cancelled or returned order needs a reason code. Etimaad decides the fault from it. Only
          customer faults lower the score.
        </p>
        <ReasonCodeTable />

        <h2>Error codes</h2>
        <DataTable columns={["HTTP", "Codes"]} rows={ERRORS.map(([h, c]) => [h, <code key="c">{c}</code>])} />
      </div>
    </section>
  );
}
