import { authenticate } from "@/server/auth";
import { getRuntime } from "@/server/config";
import { handleApi, parseJsonBody } from "@/server/http";
import { ingestEvents } from "@/server/ingest";

// POST /v1/order-events (blueprint section 9.2). Signed write request.
export async function POST(request: Request) {
  return handleApi(async () => {
    const rawBody = await request.text();
    const runtime = getRuntime();
    const now = new Date();
    const { vendor } = await authenticate({
      headers: request.headers,
      rawBody,
      now,
      store: runtime.store,
      scope: "events:write",
      requireSignature: true,
    });
    const result = await ingestEvents({ ...runtime, now }, vendor, parseJsonBody(rawBody));
    return Response.json(result.body, { status: result.status });
  });
}
