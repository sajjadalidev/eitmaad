// Signed session cookie. Uses Web Crypto, so it works in the proxy and in server code.

import credentials from "./dev-credentials.json";

export type SessionKind = "vendor" | "admin";

export interface SessionPayload {
  sub: string;
  kind: SessionKind;
  name: string;
  email: string;
  role: string;
  vendorId: string | null;
  // Expiry, unix seconds.
  exp: number;
}

export const SESSION_COOKIE = "etimaad_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

// Production needs SESSION_SECRET. Development falls back to the dev secret.
export function getSessionSecret(): string | null {
  // Trimmed: values pasted into a hosting dashboard often carry a hidden newline.
  const fromEnv = (process.env.SESSION_SECRET ?? "").trim().replace(/^["']|["']$/g, "");
  if (fromEnv && fromEnv.length >= MIN_SECRET_LENGTH) return fromEnv;
  if (process.env.NODE_ENV === "production") return null;
  return credentials.sessionSecret;
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

function isPayload(value: unknown): value is SessionPayload {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sub === "string" &&
    (v.kind === "vendor" || v.kind === "admin") &&
    typeof v.name === "string" &&
    typeof v.email === "string" &&
    typeof v.role === "string" &&
    (v.vendorId === null || typeof v.vendorId === "string") &&
    typeof v.exp === "number"
  );
}

// Returns the payload only if the signature is valid and the session has not expired.
export async function verifySession(token: string, secret: string, now: Date): Promise<SessionPayload | null> {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const signatureBytes = fromBase64Url(signature);
  const bodyBytes = fromBase64Url(body);
  if (!signatureBytes || !bodyBytes) return null;

  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), signatureBytes, encoder.encode(body));
  if (!valid) return null;

  try {
    const payload: unknown = JSON.parse(decoder.decode(bodyBytes));
    if (!isPayload(payload) || payload.exp <= now.getTime() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function homeFor(kind: SessionKind): string {
  return kind === "admin" ? "/admin" : "/vendor";
}
