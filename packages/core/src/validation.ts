// Ingestion checks that need no database (blueprint sections 2, 3.5, 4.5).

import { err, ok, type Result } from "./result";

const DAY_MS = 86_400_000;

export const INGESTION_RULES = {
  maxPastDays: 30,
  maxBackfillPastDays: 365,
  maxFutureMinutes: 10,
} as const;

export function checkOccurredAtWindow(
  occurredAt: Date,
  now: Date,
  isBackfill: boolean,
): Result<void, "OCCURRED_AT_OUT_OF_WINDOW"> {
  const pastDays = isBackfill ? INGESTION_RULES.maxBackfillPastDays : INGESTION_RULES.maxPastDays;
  const earliest = now.getTime() - pastDays * DAY_MS;
  const latest = now.getTime() + INGESTION_RULES.maxFutureMinutes * 60_000;
  const t = occurredAt.getTime();
  return t >= earliest && t <= latest ? ok(undefined) : err("OCCURRED_AT_OUT_OF_WINDOW");
}

export function checkConsentNotice(version: string | null | undefined): Result<void, "CONSENT_NOTICE_MISSING"> {
  return typeof version === "string" && version.trim().length > 0 ? ok(undefined) : err("CONSENT_NOTICE_MISSING");
}

// Finds a Pakistani mobile number written with a prefix (0, 92, +92, 0092).
const PK_MOBILE_IN_TEXT = /(?<!\d)(?:\+92|0092|92|0)3\d{9}(?!\d)/;

export function checkOrderRefHasNoPii(externalOrderRef: string): Result<void, "PII_IN_REFERENCE"> {
  const compact = externalOrderRef.replace(/[\s\-]/g, "");
  return PK_MOBILE_IN_TEXT.test(compact) ? err("PII_IN_REFERENCE") : ok(undefined);
}

export const METADATA_CHANNELS = ["app", "web", "whatsapp", "phone"] as const;

export interface OrderMetadata {
  city?: string;
  delivery_zone?: string;
  channel?: (typeof METADATA_CHANNELS)[number];
  item_count?: number;
  delivery_attempt_times?: string[];
}

export interface SanitizedMetadata {
  metadata: OrderMetadata;
  droppedKeys: string[];
}

function shortText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 100;
}

// Keeps only whitelisted keys with valid values. Everything else is dropped.
export function sanitizeMetadata(input: Record<string, unknown> | null | undefined): SanitizedMetadata {
  const metadata: OrderMetadata = {};
  const droppedKeys: string[] = [];
  if (!input) return { metadata, droppedKeys };

  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case "city":
      case "delivery_zone":
        if (shortText(value)) metadata[key] = value.trim();
        else droppedKeys.push(key);
        break;
      case "channel":
        if (typeof value === "string" && (METADATA_CHANNELS as readonly string[]).includes(value)) {
          metadata.channel = value as OrderMetadata["channel"];
        } else droppedKeys.push(key);
        break;
      case "item_count":
        if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000) {
          metadata.item_count = value;
        } else droppedKeys.push(key);
        break;
      case "delivery_attempt_times":
        if (
          Array.isArray(value) &&
          value.length <= 10 &&
          value.every((v) => typeof v === "string" && !Number.isNaN(Date.parse(v)))
        ) {
          metadata.delivery_attempt_times = value as string[];
        } else droppedKeys.push(key);
        break;
      default:
        droppedKeys.push(key);
    }
  }
  return { metadata, droppedKeys };
}
