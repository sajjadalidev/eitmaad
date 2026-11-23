import { describe, expect, it } from "vitest";
import { authenticate } from "./auth";
import { ApiError } from "./http";
import { NOW, keyFor, makeStore, signedHeaders } from "./test-helpers";

const body = '{"events":[]}';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return error instanceof ApiError ? `${error.status} ${error.code}` : "UNEXPECTED";
  }
}

describe("authenticate", () => {
  it("accepts a valid signed request", async () => {
    const store = makeStore();
    const result = await authenticate({
      headers: signedHeaders("a", body),
      rawBody: body,
      now: NOW,
      store,
      scope: "events:write",
      requireSignature: true,
    });
    expect(result.vendor.id).toBe("vendor-a");
  });

  it("rejects missing, malformed and wrong keys", async () => {
    const store = makeStore();
    const run = (key: string | null) =>
      codeOf(
        authenticate({
          headers: new Headers(key ? { "x-api-key": key } : {}),
          rawBody: body,
          now: NOW,
          store,
          scope: "risk:read",
          requireSignature: false,
        }),
      );
    expect(await run(null)).toBe("401 INVALID_KEY");
    expect(await run("not-a-key")).toBe("401 INVALID_KEY");
    expect(await run(keyFor("a").replace("Secret", "Secreu"))).toBe("401 INVALID_KEY");
  });

  it("rejects revoked keys", async () => {
    const store = makeStore();
    const key = store.apiKeys.get("testaaaa");
    if (key) key.status = "REVOKED";
    const result = await codeOf(
      authenticate({
        headers: new Headers({ "x-api-key": keyFor("a") }),
        rawBody: body,
        now: NOW,
        store,
        scope: "risk:read",
        requireSignature: false,
      }),
    );
    expect(result).toBe("401 INVALID_KEY");
  });

  it("checks scope and vendor status", async () => {
    const store = makeStore({ d: "PENDING_VERIFICATION" });
    const key = store.apiKeys.get("testaaaa");
    if (key) key.scopes = ["risk:read"];
    const scoped = await codeOf(
      authenticate({ headers: signedHeaders("a", body), rawBody: body, now: NOW, store, scope: "events:write", requireSignature: true }),
    );
    const pending = await codeOf(
      authenticate({ headers: signedHeaders("d", body), rawBody: body, now: NOW, store, scope: "events:write", requireSignature: true }),
    );
    expect(scoped).toBe("403 SCOPE_DENIED");
    expect(pending).toBe("403 VENDOR_NOT_ACTIVE");
  });

  it("rejects a bad signature, a changed body and an old timestamp", async () => {
    const store = makeStore();
    const base = { now: NOW, store, scope: "events:write" as const, requireSignature: true };
    const wrongSig = signedHeaders("a", body);
    wrongSig.set("x-signature", "00".repeat(32));
    const old = signedHeaders("a", body, new Date(NOW.getTime() - 301_000));

    expect(await codeOf(authenticate({ ...base, headers: wrongSig, rawBody: body }))).toBe("401 BAD_SIGNATURE");
    expect(await codeOf(authenticate({ ...base, headers: signedHeaders("a", body), rawBody: `${body} ` }))).toBe(
      "401 BAD_SIGNATURE",
    );
    expect(await codeOf(authenticate({ ...base, headers: old, rawBody: body }))).toBe("401 TIMESTAMP_SKEW");
  });
});
