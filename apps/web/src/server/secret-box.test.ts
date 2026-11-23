import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secret-box";

const KEY = "test-signing-key-0123456789-abcdefghij";

describe("secret box", () => {
  it("round-trips a secret and never stores it in plain text", () => {
    const sealed = sealSecret("my-signing-secret", KEY);
    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain("my-signing-secret");
    expect(openSecret(sealed, KEY)).toBe("my-signing-secret");
  });

  it("uses a new random IV each time", () => {
    expect(sealSecret("same", KEY)).not.toBe(sealSecret("same", KEY));
  });

  it("returns null for a wrong key, tampered data or another format", () => {
    const sealed = sealSecret("secret", KEY);
    const parts = sealed.split(":");
    const data = parts[3] ?? "";
    // Change the first character of the ciphertext.
    parts[3] = (data[0] === "A" ? "B" : "A") + data.slice(1);
    expect(openSecret(sealed, `${KEY}x`)).toBeNull();
    expect(openSecret(parts.join(":"), KEY)).toBeNull();
    expect(openSecret("dev/abc", KEY)).toBeNull();
  });

  it("refuses a short key", () => {
    expect(() => sealSecret("secret", "short")).toThrow();
  });
});
