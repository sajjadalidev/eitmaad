import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

const SECTIONS = [
  {
    title: "Who we are",
    text: "Etimaad runs a fraud and cash on delivery risk network for merchants in Pakistan.",
  },
  {
    title: "Data we process",
    text: "Order outcomes, reason codes, order value, payment method, and hashed phone numbers sent by merchants. Merchant business and contact details for onboarding.",
  },
  {
    title: "Why we process it",
    text: "Only to help merchants reduce cash on delivery losses and fraud. Never for marketing or resale.",
  },
  {
    title: "Who can see it",
    text: "A merchant sees its own records and a risk level for a customer. Merchants never see other merchants' names or raw orders.",
  },
  {
    title: "How long we keep it",
    text: "Order records for 24 months. Lookup logs for 12 months. Dispute records for 36 months. KYC documents are deleted right after review.",
  },
  {
    title: "Your rights",
    text: "Access, correction through a dispute, and erasure with fraud-prevention limits. See the For customers page.",
  },
  {
    title: "Security",
    text: "Encryption in transit and at rest, hashed identifiers, access control and audit logs.",
  },
  {
    title: "Contact",
    text: "Grievance contact details will be published before launch.",
  },
];

export default function PrivacyPage() {
  return (
    <section className="section">
      <div className="container stack" style={{ maxWidth: 760 }}>
        <h1>Privacy policy</h1>
        <p className="notice">
          Draft outline only. This is not the final policy and not legal advice. It will be written or approved by
          counsel before launch.
        </p>
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h2>{s.title}</h2>
            <p>{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
