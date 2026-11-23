import { afterEach, describe, expect, it } from "vitest";
import { envValue, fingerprint } from "./env";

afterEach(() => {
  delete process.env.ETIMAAD_TEST_VALUE;
});

describe("envValue", () => {
  it("removes spaces, newlines and quotes around the value", () => {
    process.env.ETIMAAD_TEST_VALUE = '  "abc123"\n';
    expect(envValue("ETIMAAD_TEST_VALUE")).toBe("abc123");
  });

  it("returns an empty string when the value is missing", () => {
    expect(envValue("ETIMAAD_TEST_VALUE")).toBe("");
  });
});

describe("fingerprint", () => {
  it("is short, stable and does not contain the secret", () => {
    const secret = "some-long-secret-value-0123456789abcdef";
    expect(fingerprint(secret)).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprint(secret)).toBe(fingerprint(secret));
    expect(fingerprint(`${secret}x`)).not.toBe(fingerprint(secret));
    expect(fingerprint("")).toBeNull();
  });
});
