// Encrypts API signing secrets before they are stored in API_KEYS.signing_secret_ref.
// Format: enc:v1:<iv>:<ciphertext>:<tag> with AES-256-GCM. The key comes from SIGNING_SECRET_KEY.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const MIN_KEY_LENGTH = 32;

function keyFrom(material: string): Buffer {
  if (material.length < MIN_KEY_LENGTH) throw new Error(`Encryption key must be at least ${MIN_KEY_LENGTH} characters`);
  return createHash("sha256").update(material, "utf8").digest();
}

export function sealSecret(plain: string, keyMaterial: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyMaterial), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${encrypted.toString("base64url")}:${tag.toString("base64url")}`;
}

// Returns null for an unknown format, a wrong key or tampered data.
export function openSecret(ref: string, keyMaterial: string): string | null {
  if (!ref.startsWith(PREFIX)) return null;
  const [iv, data, tag, extra] = ref.slice(PREFIX.length).split(":");
  if (!iv || !data || !tag || extra !== undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyMaterial), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
