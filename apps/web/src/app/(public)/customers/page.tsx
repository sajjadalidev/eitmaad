import type { Metadata } from "next";

export const metadata: Metadata = { title: "For customers" };

export default function CustomersPage() {
  return (
    <section className="section">
      <div className="container stack" style={{ maxWidth: 760 }}>
        <h1>For customers</h1>
        <p className="lead">
          Some online stores in Pakistan use Etimaad to decide whether to offer cash on delivery. This page explains
          what that means for you.
        </p>
        <p className="notice">Draft. The final text will be approved by our legal adviser before launch.</p>

        <h2>What stores share with us</h2>
        <ul>
          <li>The result of your order: delivered, refused, returned or cancelled, and the reason.</li>
          <li>The order value and the payment method.</li>
          <li>Your phone number, which we turn into a secure code (hash). We do not keep the number itself.</li>
        </ul>

        <h2>What we never do</h2>
        <ul>
          <li>We do not sell your data or use it for marketing.</li>
          <li>We do not tell a store which other stores you shopped with.</li>
          <li>We do not blame you for a store or courier mistake.</li>
        </ul>

        <h2>How stores use it</h2>
        <p>
          When you place an order, the store may ask us for a risk level. Based on that, it may ask you to confirm by
          phone, pay part in advance, or pay fully in advance. Delivered orders, including prepaid ones, improve your
          record over time.
        </p>

        <h2>Your rights</h2>
        <ul>
          <li>
            <strong>See your record:</strong> ask what we hold about your number.
          </li>
          <li>
            <strong>Dispute an entry:</strong> for example an order you never placed, or a wrong reason.
          </li>
          <li>
            <strong>Changed number:</strong> if your number used to belong to someone else, we can separate the old
            history.
          </li>
          <li>
            <strong>Erasure:</strong> you can ask us to delete your data. Records of refused orders are kept until
            they expire after 24 months, to prevent fraud.
          </li>
        </ul>
        <p>We confirm that the number is yours with a one-time SMS code before we share or change anything.</p>

        <h2>Contact</h2>
        <div className="card">
          <p>
            <strong>Grievance contact:</strong> <span className="muted">details will be published before launch.</span>
          </p>
          <p className="muted small">Disputes are answered within 7 days.</p>
        </div>
      </div>
    </section>
  );
}
