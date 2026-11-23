"use client";

import { useEffect } from "react";

// Shown at once after a menu click, while the server loads the next page.
export function PortalLoading() {
  return (
    <div className="card" role="status" aria-live="polite">
      <p className="muted">Loading...</p>
    </div>
  );
}

// Shown when a page fails on the server, instead of a frozen screen.
export function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Portal page failed:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="card stack" role="alert">
      <h2>This page could not load</h2>
      <p className="muted">It may be a short database delay. Try again. If it keeps failing, note the code below.</p>
      {error.digest && <p className="small muted">Error code: {error.digest}</p>}
      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
