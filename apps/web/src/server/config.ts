// Picks the store and secrets for the API.
//
// Production: Postgres store. Needs DATABASE_URL, PHONE_PEPPER_V1 and SIGNING_SECRET_KEY.
// Development: in-memory dev store by default, so local runs never write to a real database.
//   Set ETIMAAD_STORE=postgres to use DATABASE_URL locally on purpose.

import { createDb } from "@etimaad/db";
import { DEV_PEPPER, createDevStore } from "./dev-store";
import { envValue, fingerprint } from "./env";
import { ApiError } from "./http";
import type { InMemoryStore } from "./memory-store";
import { PostgresStore } from "./postgres-store";
import type { EtimaadStore } from "./store";

export interface ApiRuntime {
  store: EtimaadStore;
  pepper: string;
  keyVersion: number;
}

const MIN_SECRET_LENGTH = 32;

// Survives hot reloads in development and warm starts on Vercel.
const globalCache = globalThis as unknown as {
  etimaadDevStore?: InMemoryStore;
  etimaadPostgresStore?: PostgresStore;
};

function unavailable(message: string): never {
  throw new ApiError(503, "SERVICE_UNAVAILABLE", message);
}

function usePostgres(): boolean {
  return process.env.NODE_ENV === "production" || process.env.ETIMAAD_STORE === "postgres";
}

function postgresRuntime(): ApiRuntime {
  const url = envValue("DATABASE_URL");
  const pepper = envValue("PHONE_PEPPER_V1");
  if (!url) unavailable("Database is not configured.");
  if (pepper.length < MIN_SECRET_LENGTH) unavailable("Phone pepper is not configured.");

  const signingKey = envValue("SIGNING_SECRET_KEY");
  globalCache.etimaadPostgresStore ??= new PostgresStore(createDb(url), {
    signingKey: signingKey.length >= MIN_SECRET_LENGTH ? signingKey : null,
  });
  return {
    store: globalCache.etimaadPostgresStore,
    pepper,
    keyVersion: Number(process.env.PHONE_PEPPER_ACTIVE_VERSION || 1),
  };
}

export function getRuntime(): ApiRuntime {
  if (usePostgres()) return postgresRuntime();

  globalCache.etimaadDevStore ??= createDevStore();
  return {
    store: globalCache.etimaadDevStore,
    pepper: envValue("PHONE_PEPPER_V1") || DEV_PEPPER,
    keyVersion: Number(process.env.PHONE_PEPPER_ACTIVE_VERSION || 1),
  };
}

// Safe summary of the setup for /v1/health. Shows only whether values are set,
// plus a one-way fingerprint of the signing key so two copies can be compared.
export function configSummary() {
  const signingKey = envValue("SIGNING_SECRET_KEY");
  return {
    store: usePostgres() ? "postgres" : "memory",
    database: envValue("DATABASE_URL") !== "",
    phonePepper: envValue("PHONE_PEPPER_V1").length >= MIN_SECRET_LENGTH,
    signingKey: signingKey.length >= MIN_SECRET_LENGTH,
    signingKeyFingerprint: signingKey.length >= MIN_SECRET_LENGTH ? fingerprint(signingKey) : null,
    supabaseAuth: envValue("SUPABASE_URL") !== "" && envValue("SUPABASE_PUBLISHABLE_KEY") !== "",
    sessionSecret: envValue("SESSION_SECRET").length >= MIN_SECRET_LENGTH,
  };
}
