import { authenticate } from "@/server/auth";
import { getRuntime } from "@/server/config";
import { handleApi, parseJsonBody } from "@/server/http";
import { riskCheck } from "@/server/risk";

// POST /v1/risk/check (blueprint section 9.3). Read request: API key, no signature.
export async function POST(request: Request) {
  const startedAt = Date.now();
  return handleApi(async () => {
    const rawBody = await request.text();
    const runtime = getRuntime();
    const now = new Date();
    const { apiKey, vendor } = await authenticate({
      headers: request.headers,
      rawBody,
      now,
      store: runtime.store,
      scope: "risk:read",
      requireSignature: false,
    });
    const result = await riskCheck({ ...runtime, now }, vendor, apiKey.id, parseJsonBody(rawBody), startedAt);
    return Response.json(result);
  });
}
