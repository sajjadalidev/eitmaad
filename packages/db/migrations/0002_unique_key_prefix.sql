DROP INDEX "api_keys_prefix_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_prefix_uq" ON "api_keys" USING btree ("key_prefix");