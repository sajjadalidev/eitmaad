ALTER TYPE "public"."application_status" ADD VALUE 'DOCUMENTS_REQUESTED' BEFORE 'APPROVED';--> statement-breakpoint
ALTER TABLE "vendor_applications" ADD COLUMN "requested_documents" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_applications" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;