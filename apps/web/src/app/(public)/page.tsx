import Link from "next/link";
import { ActionTable } from "@/components/action-table";

const STEPS = [
  {
    title: "Report outcomes",
    text: "Send every order result: delivered, refused, returned or cancelled, with a reason code. Our plugin or API does it for you.",
  },
  {
    title: "Check at checkout",
    text: "Before you ship cash on delivery, ask Etimaad about the customer's phone number. The answer comes back in under 100 ms.",
  },
  {
    title: "Act on the advice",
    text: "You get a risk level and a suggested action. You always make the final decision.",
  },
];

const FAIRNESS = [
  "Customers are never penalised for a vendor or courier mistake.",
  "One merchant alone can never mark a customer as high risk.",
  "Old mistakes fade over time, and prepaid orders help rebuild trust.",
  "Customers can see their record and dispute any entry.",
  "Phone numbers are stored only as secure hashes, never as plain text.",
];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="badge badge-accent">Pilot for Pakistani merchants</span>
          <h1 style={{ marginTop: 16 }}>Know before you ship COD.</h1>
          <p className="lead">
            Etimaad is a shared trust network for online stores and restaurants. Check a customer&apos;s delivery
            record at checkout and stop losing money on refused cash on delivery orders.
          </p>
          <div className="btn-row">
            <Link href="/join" className="btn btn-primary">
              Join the pilot
            </Link>
            <Link href="/docs" className="btn">
              Read the API docs
            </Link>
          </div>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="container">
          <h2>How it works</h2>
          <div className="grid grid-3" style={{ marginTop: 20 }}>
            {STEPS.map((step, i) => (
              <div className="card" key={step.title}>
                <div className="step-number">{i + 1}</div>
                <h3>{step.title}</h3>
                <p className="muted">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="container grid grid-2" style={{ alignItems: "start" }}>
          <div>
            <h2>Recommended actions</h2>
            <p className="muted">
              Each check returns one of four actions. You set which action goes with each risk level in your
              settings.
            </p>
          </div>
          <ActionTable />
        </div>
      </section>

      <section className="section">
        <div className="container grid grid-2" style={{ alignItems: "start" }}>
          <div>
            <h2>Fair by design</h2>
            <p className="muted">
              A trust network only works if customers are treated fairly. These rules are built into the scoring
              model.
            </p>
          </div>
          <ul className="check-list card">
            {FAIRNESS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-tight">
        <div className="container">
          <h2>Works with your store</h2>
          <div className="grid grid-3" style={{ marginTop: 20 }}>
            <div className="card">
              <h3>WooCommerce</h3>
              <p className="muted">Plugin that reports outcomes and can hide COD at checkout for high-risk orders.</p>
            </div>
            <div className="card">
              <h3>Shopify</h3>
              <p className="muted">App that checks each new order and tags it, so your team knows whom to call.</p>
            </div>
            <div className="card">
              <h3>REST API</h3>
              <p className="muted">For custom stores and apps. Signed requests, clear error codes.</p>
            </div>
          </div>
          <p style={{ marginTop: 20 }}>
            <Link href="/integrations">See all integration details</Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="card" style={{ textAlign: "center", padding: 36 }}>
            <h2>Start with the pilot</h2>
            <p className="muted">We are onboarding a small group of merchants first.</p>
            <Link href="/join" className="btn btn-primary">
              Apply to join
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
