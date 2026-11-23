import Link from "next/link";
import { Brand } from "./brand";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Brand />
        <nav className="nav" aria-label="Main">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/integrations">Integrations</Link>
          <Link href="/docs">API docs</Link>
          <Link href="/customers">For customers</Link>
          <Link href="/login">Log in</Link>
          <Link href="/join" className="btn btn-primary">
            Join the pilot
          </Link>
        </nav>
      </div>
    </header>
  );
}
