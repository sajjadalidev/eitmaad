import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div>
          <strong>Etimaad</strong>
          <p className="muted small">Shared COD trust network for Pakistani merchants.</p>
        </div>
        <nav className="nav" aria-label="Footer">
          <Link href="/customers">For customers</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/docs">API docs</Link>
          <Link href="/integrations">Integrations</Link>
        </nav>
      </div>
    </footer>
  );
}
