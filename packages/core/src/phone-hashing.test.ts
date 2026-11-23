import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  hashCnic,
  hashPhone,
  idempotencyKey,
  normalizeCnic,
  payloadHash,
} from "./hashing";
import { normalizePkMobile } from "./phone";

const PEPPER = "test-pepper-0123456789-abcdefghijklmnop";

describe("normalizePkMobile", () => {
  it("accepts all supported formats", () => {
    for (const input of ["03001234567", "3001234567", "923001234567", "+923001234567", "00923001234567", "0300-123 4567"]) {
      expect(normalizePkMobile(input)).toEqual({ ok: true, value: "+923001234567" });
    }
  });

  it("rejects landlines, foreign numbers and junk", () => {
    for (const input of ["04235123456", "+14155552671", "12345", "abc", ""]) {
      expect(normalizePkMobile(input)).toEqual({ ok: false, code: "INVALID_PHONE" });
    }
  });
});

describe("hashing", () => {
  it("phone hash is stable and depends on the pepper", () => {
    const a = hashPhone("+923001234567", PEPPER);
    expect(a).toBe(hashPhone("+923001234567", PEPPER));
    expect(a).not.toBe(hashPhone("+923001234567", `${PEPPER}x`));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a short pepper", () => {
    expect(() => hashPhone("+923001234567", "short")).toThrow();
  });

  it("normalises and hashes CNIC", () => {
    expect(normalizeCnic("35202-1234567-1")).toEqual({ ok: true, value: "3520212345671" });
    expect(normalizeCnic("1234")).toEqual({ ok: false, code: "INVALID_CNIC" });
    expect(hashCnic("3520212345671", PEPPER)).not.toBe(hashPhone("3520212345671", PEPPER));
  });

  it("canonical JSON ignores key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(payloadHash({ x: 1, y: undefined })).toBe(payloadHash({ x: 1 }));
  });

  it("idempotency key cannot collide through delimiters", () => {
    expect(idempotencyKey("v1", "a|b", "c")).not.toBe(idempotencyKey("v1", "a", "b|c"));
    expect(idempotencyKey("v1", "ORD-1", "evt-1")).toBe(idempotencyKey("v1", "ORD-1", "evt-1"));
  });
});
