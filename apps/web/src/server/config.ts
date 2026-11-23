// Picks the store and secrets for the API.

import { DEV_PEPPER, createDevStore } from "./dev-store";
import { ApiError } from "./http";
import type { InMemoryStore } from "./memory-store";
import type { EtimaadStore } from "./store";

export interface ApiRuntime {
  store: EtimaadStore;
  pepper: string;
  keyVersion: number;
}

// Survives hot reloads in development.
const globalForDev = globalThis as unknown as { etimaadDevStore?: InMemoryStore };

export function getRuntime(): ApiRuntime {
  if (process.env.DATABASE_URL) {
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "The database store is not built yet.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "No database is configured.");
  }
  globalForDev.etimaadDevStore ??= createDevStore();
  return {
    store: globalForDev.etimaadDevStore,
    pepper: process.env.PHONE_PEPPER_V1 || DEV_PEPPER,
    keyVersion: Number(process.env.PHONE_PEPPER_ACTIVE_VERSION || 1),
  };
}
