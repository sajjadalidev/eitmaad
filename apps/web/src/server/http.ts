// Error type and JSON helpers for the public API (blueprint section 9.6).

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function errorResponse(error: ApiError): Response {
  return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
}

// Runs a handler and turns any error into a JSON response. Request bodies are never logged.
export async function handleApi(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    console.error("Unhandled API error:", error instanceof Error ? error.message : "unknown");
    return errorResponse(new ApiError(500, "INTERNAL_ERROR", "Something went wrong."));
  }
}

export function parseJsonBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Body must be valid JSON.");
  }
}
