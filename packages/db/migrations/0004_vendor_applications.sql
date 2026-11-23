CREATE TYPE "public"."application_status" AS ENUM('NEW', 'REVIEWING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."business_type" AS ENUM('PVT_LTD', 'PARTNERSHIP', 'SOLE_PROPRIETOR');--> statement-breakpoint
CREATE TABLE "vendor_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"category" "vendor_category" NOT NULL,
	"business_type" "business_type" NOT NULL,
	"platform" "source_platform" NOT NULL,
	"store_url" text,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"ip_hash" text,
	"status" "application_status" DEFAULT 'NEW' NOT NULL,
	"reviewer_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "vendor_applications_email_idx" ON "vendor_applications" USING btree ("contact_email","created_at");--> statement-breakpoint
CREATE INDEX "vendor_applications_ip_idx" ON "vendor_applications" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "vendor_applications_status_idx" ON "vendor_applications" USING btree ("status","created_at");--> statement-breakpoint
-- Hand-written: same lock-down as migration 0003 for this new table.
ALTER TABLE "vendor_applications" ENABLE ROW LEVEL SECURITY;
