import type { Metadata } from "next";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join the pilot" };

export default function JoinPage() {
  return (
    <section className="section">
      <div className="container grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <h1>Join the pilot</h1>
          <p className="lead">Tell us about your business. We review every application by hand.</p>
          <h3>What happens next</h3>
          <ol>
            <li>We review your details.</li>
            <li>You upload KYC documents and accept the data sharing agreement.</li>
            <li>You get an API key or plugin access.</li>
            <li>You start on a 60 day probation period.</li>
          </ol>
          <h3>Documents we will ask for</h3>
          <ul>
            <li>Private Ltd: SECP certificate and NTN</li>
            <li>Partnership: firm registration and NTN</li>
            <li>Sole proprietor: NTN, or owner CNIC with one business proof</li>
          </ul>
        </div>

        <JoinForm />
      </div>
    </section>
  );
}
