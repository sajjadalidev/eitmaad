// The site's own origin, for links in account emails.
// SITE_URL wins when set; otherwise the request host is used.

import { headers } from "next/headers";
import { envValue } from "./env";

export async function siteOrigin(): Promise<string> {
  const fixed = envValue("SITE_URL");
  if (fixed) return fixed.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const SET_PASSWORD_PATH = "/set-password";
