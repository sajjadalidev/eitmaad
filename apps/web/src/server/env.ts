// Reads env values with surrounding spaces, newlines and quotes removed.
// Values pasted into a hosting dashboard often carry a hidden newline.

import { createHash } from "node:crypto";

export function envValue(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
}

// Short, one-way fingerprint for comparing two copies of a secret. It does not reveal the secret.
export function fingerprint(secret: string): string | null {
  return secret ? createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 8) : null;
}
