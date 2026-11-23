import { SCORE_MODEL_VERSION } from "@etimaad/core";
import { configSummary } from "@/server/config";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", modelVersion: SCORE_MODEL_VERSION, config: configSummary() });
}
