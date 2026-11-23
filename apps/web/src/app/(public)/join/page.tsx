import type { Metadata } from "next";

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

        <form className="form card" aria-describedby="join-status">
          <div className="field">
            <label htmlFor="legal_name">Business legal name</label>
            <input id="legal_name" name="legal_name" required />
          </div>
          <div className="field">
            <label htmlFor="display_name">Store or brand name</label>
            <input id="display_name" name="display_name" required />
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
            <select id="business_type" name="business_type" defaultValue="sole">
              <option value="pvt">Private Ltd</option>
              <option value="partnership">Partnership</option>
              <option value="sole">Sole proprietor</option>
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
            <input id="store_url" name="store_url" type="url" placeholder="https://" />
          </div>
          <div className="field">
            <label htmlFor="contact_name">Your name</label>
            <input id="contact_name" name="contact_name" required />
          </div>
          <div className="field">
            <label htmlFor="contact_email">Work email</label>
            <input id="contact_email" name="contact_email" type="email" required />
          </div>
          <button type="submit" className="btn btn-primary" disabled>
            Submit application
          </button>
          <p id="join-status" className="muted small">
            Applications open with the pilot. This form is not connected yet.
          </p>
        </form>
      </div>
    </section>
  );
}
