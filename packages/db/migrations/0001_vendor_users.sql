CREATE TYPE "public"."vendor_user_role" AS ENUM('OWNER', 'STAFF');--> statement-breakpoint
CREATE TABLE "vendor_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"auth_user_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "vendor_user_role" DEFAULT 'STAFF' NOT NULL,
	"status" "admin_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "vendor_users_vendor_email_uq" UNIQUE("vendor_id","email")
);
--> statement-breakpoint
ALTER TABLE "vendor_users" ADD CONSTRAINT "vendor_users_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;