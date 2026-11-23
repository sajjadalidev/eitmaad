import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return (
    <section className="section">
      <div className="container stack">
        <h1>Integrations</h1>
        <p className="lead">Three ways to connect. All of them follow the same scoring rules.</p>

        <div className="grid grid-3">
          <div className="card stack">
            <h2>WooCommerce</h2>
            <ul className="check-list">
              <li>Reports order outcomes when the status changes</li>
              <li>Reason code box on the order screen</li>
              <li>Can hide COD at checkout for high-risk customers</li>
              <li>Shows the consent notice above the Place Order button</li>
              <li>Works with classic and block checkout</li>
            </ul>
            <button className="btn" disabled>
              Download plugin (pilot merchants)
            </button>
          </div>

          <div className="card stack">
            <h2>Shopify</h2>
            <ul className="check-list">
              <li>Listens to order and delivery updates</li>
              <li>Checks every new order and tags it with the risk level</li>
              <li>Bulk page to mark outcomes and reasons</li>
              <li>Handles Shopify privacy requests</li>
            </ul>
            <p className="muted small">
              Shopify checks happen right after the order is placed. Hiding COD before checkout is planned for a later
              version.
            </p>
            <button className="btn" disabled>
              Install app (coming soon)
            </button>
          </div>

          <div className="card stack">
            <h2>REST API</h2>
            <ul className="check-list">
              <li>Send order events one by one or in batches</li>
              <li>Risk check in under 100 ms</li>
              <li>Signed requests with replay protection</li>
              <li>Clear error codes</li>
            </ul>
            <Link href="/docs" className="btn btn-primary">
              Read the docs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
