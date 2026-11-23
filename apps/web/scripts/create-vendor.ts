// Creates one vendor and its first API key in the database in DATABASE_MIGRATION_URL.
// This writes to a real database. Run it only with explicit approval:
//   DATABASE_MIGRATION_URL=... SIGNING_SECRET_KEY=... pnpm create-vendor --name "Test Store" --test --yes
// SIGNING_SECRET_KEY must be the same value as in Vercel, or signed requests will fail.
// The API key and signing secret are written to apps/web/.secrets/ (ignored by git), never printed.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@etimaad/db";
import { createVendorWithKey } from "../src/server/vendor-admin";

const args = process.argv.slice(2);
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!args.includes("--yes")) {
  console.error("Refusing to run without --yes. This writes to a real database.");
  process.exit(1);
}

const name = argValue("--name");
const isTest = args.includes("--test");
const url = process.env.DATABASE_MIGRATION_URL;
const signingKey = process.env.SIGNING_SECRET_KEY ?? "";

if (!name) {
  console.error('Missing --name "Store name".');
  process.exit(1);
}
if (!url) {
  console.error("DATABASE_MIGRATION_URL is not set.");
  process.exit(1);
}
if (signingKey.length < 32) {
  console.error("SIGNING_SECRET_KEY is missing or shorter than 32 characters.");
  process.exit(1);
}

const db = createDb(url);

try {
  const created = await createVendorWithKey(
    db,
    {
      legalName: isTest ? `${name} (TEST)` : name,
      displayName: name,
      category: "ecommerce",
      status: "ACTIVE",
      trustWeight: 1,
      kycReference: isTest ? "TEST-VENDOR-NOT-KYC" : "PENDING-KYC",
    },
    signingKey,
  );

  const secretsDir = join(dirname(fileURLToPath(import.meta.url)), "..", ".secrets");
  mkdirSync(secretsDir, { recursive: true });
  const file = join(secretsDir, `vendor-${created.keyPrefix}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        note: "Keep private. Shown only once. Do not commit or share.",
        vendorId: created.vendorId,
        displayName: name,
        apiKey: created.apiKey,
        signingSecret: created.signingSecret,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  console.log(`Vendor created: ${created.vendorId}`);
  console.log(`API key prefix: ${created.keyPrefix}`);
  console.log(`Key and signing secret saved to: ${file}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Create vendor failed:", message.replace(/postgres(ql)?:\/\/\S+/g, "[url]"));
  process.exitCode = 1;
} finally {
  await db.$client.end({ timeout: 5 });
}
