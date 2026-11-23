import { SCORE_MODEL_VERSION } from "@etimaad/core";

export function GET() {
  return Response.json({ status: "ok", modelVersion: SCORE_MODEL_VERSION });
}
