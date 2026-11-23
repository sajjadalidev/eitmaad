import Link from "next/link";

const STATS = [
  "Orders reported (30 days)",
  "Risk checks today",
  "Daily check quota",
  "Orders missing a reason",
  "Open disputes",
] as const;

const GETTING_STARTED = [
  { text: "Accept the data sharing agreement", href: null },
  { text: "Create an API key", href: "/vendor/api-keys" },
  { text: "Install the WooCommerce plugin or Shopify app", href: "/integrations" },
  { text: "Choose actions for each risk level", href: "/vendor/settings" },
] as const;

export default function VendorOverviewPage() {
  return (
    <>
      <h1>Overview</h1>
      <div className="grid grid-4">
        {STATS.map((label) => (
          <div className="card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">-</div>
          </div>
        ))}
      </div>
      <div className="card stack">
        <h2>Getting started</h2>
        <ul className="check-list">
          {GETTING_STARTED.map((item) => (
            <li key={item.text}>{item.href ? <Link href={item.href}>{item.text}</Link> : item.text}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
