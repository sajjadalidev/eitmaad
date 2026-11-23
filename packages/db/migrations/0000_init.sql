CREATE TYPE "public"."actor_type" AS ENUM('ADMIN', 'SYSTEM', 'VENDOR');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('SUPPORT', 'ANALYST', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."admin_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."api_key_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."archived_reason" AS ENUM('NOT_MY_NUMBER_UPHELD', 'ERASURE');--> statement-breakpoint
CREATE TYPE "public"."batch_source_type" AS ENUM('SCHEDULED_JOB', 'WEBHOOK_BATCH', 'MANUAL_UPLOAD');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."cancellation_stage" AS ENUM('PRE_CONFIRMATION', 'PRE_DISPATCH', 'POST_DISPATCH');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('ACTIVE', 'UNDER_REVIEW', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."dispute_category" AS ENUM('NOT_MY_ORDER', 'WRONG_FAULT', 'NOT_MY_NUMBER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."dispute_raised_via" AS ENUM('SUPPORT', 'VENDOR');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('OPEN', 'AWAITING_VENDOR', 'RESOLVED_UPHELD', 'RESOLVED_REJECTED');--> statement-breakpoint
CREATE TYPE "public"."dispute_verification" AS ENUM('SMS_OTP');--> statement-breakpoint
CREATE TYPE "public"."event_result" AS ENUM('ACCEPTED', 'DUPLICATE', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."fault_class" AS ENUM('NONE', 'USER', 'VENDOR', 'LOGISTICS', 'NEUTRAL', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."identifier_type" AS ENUM('PHONE_HASH');--> statement-breakpoint
CREATE TYPE "public"."ingestion_mode" AS ENUM('WEBHOOK', 'BATCH', 'HYBRID');--> statement-breakpoint
CREATE TYPE "public"."installation_status" AS ENUM('ACTIVE', 'UNINSTALLED');--> statement-breakpoint
CREATE TYPE "public"."kyc_level" AS ENUM('FULL', 'LIGHT');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PLACED', 'DISPATCHED', 'DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED_DELIVERY', 'RETURNED_POST_DELIVERY', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('COD', 'PREPAID', 'PARTIAL_ADVANCE');--> statement-breakpoint
CREATE TYPE "public"."recommended_action" AS ENUM('ALLOW_COD', 'REQUIRE_CONFIRMATION_CALL', 'REQUIRE_PARTIAL_ADVANCE', 'PREPAID_ONLY');--> statement-breakpoint
CREATE TYPE "public"."risk_check_mode" AS ENUM('PRE_CHECKOUT', 'POST_ORDER');--> statement-breakpoint
CREATE TYPE "public"."risk_tier" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT_DATA');--> statement-breakpoint
CREATE TYPE "public"."scoring_excluded_reason" AS ENUM('DISPUTE_UPHELD');--> statement-breakpoint
CREATE TYPE "public"."signal_type" AS ENUM('EMAIL_HASH', 'ADDRESS_HASH', 'DEVICE_HASH');--> statement-breakpoint
CREATE TYPE "public"."source_platform" AS ENUM('API', 'WOOCOMMERCE', 'SHOPIFY');--> statement-breakpoint
CREATE TYPE "public"."store_platform" AS ENUM('WOOCOMMERCE', 'SHOPIFY');--> statement-breakpoint
CREATE TYPE "public"."vendor_category" AS ENUM('food', 'ecommerce', 'retail');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('PENDING_VERIFICATION', 'PROBATION', 'ACTIVE', 'RESTRICTED', 'TERMINATED');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"name" text NOT NULL,
	"work_email" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"status" "admin_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "admin_users_work_email_unique" UNIQUE("work_email")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"signing_secret_ref" text NOT NULL,
	"status" "api_key_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"identifier_type" "identifier_type" DEFAULT 'PHONE_HASH' NOT NULL,
	"value_hash" text NOT NULL,
	"key_version" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"signal_type" "signal_type" NOT NULL,
	"value_hash" text NOT NULL,
	"key_version" smallint NOT NULL,
	"vendor_id" uuid NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_trust_profiles" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"total_network_orders" integer DEFAULT 0 NOT NULL,
	"scoreable_orders" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_user_fault" integer DEFAULT 0 NOT NULL,
	"distinct_vendor_count" integer DEFAULT 0 NOT NULL,
	"negative_vendor_count" integer DEFAULT 0 NOT NULL,
	"positive_evidence" numeric(10, 4) NOT NULL,
	"negative_evidence" numeric(10, 4) NOT NULL,
	"cumulative_score" numeric(5, 2) NOT NULL,
	"risk_tier" "risk_tier" NOT NULL,
	"has_recent_user_fault" boolean DEFAULT false NOT NULL,
	"has_open_dispute" boolean DEFAULT false NOT NULL,
	"score_version" integer NOT NULL,
	"score_breakdown" jsonb NOT NULL,
	"last_order_at" timestamp with time zone,
	"last_calculated_at" timestamp with time zone NOT NULL,
	"next_decay_recalc_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "customer_status" DEFAULT 'ACTIVE' NOT NULL,
	"epoch" integer DEFAULT 1 NOT NULL,
	"archived_reason" "archived_reason",
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_sharing_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"agreement_version" text NOT NULL,
	"signed_by_name" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"document_checksum" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid,
	"raised_via" "dispute_raised_via" NOT NULL,
	"customer_verified_via" "dispute_verification",
	"category" "dispute_category" NOT NULL,
	"status" "dispute_status" DEFAULT 'OPEN' NOT NULL,
	"vendor_response_due_at" timestamp with time zone,
	"vendor_evidence" jsonb,
	"resolution_note" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"order_event_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"payload_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"source_type" "batch_source_type" NOT NULL,
	"is_backfill" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"status" "batch_status" DEFAULT 'PENDING' NOT NULL,
	"file_checksum" text,
	"total_records" integer DEFAULT 0 NOT NULL,
	"accepted_records" integer DEFAULT 0 NOT NULL,
	"duplicate_records" integer DEFAULT 0 NOT NULL,
	"rejected_records" integer DEFAULT 0 NOT NULL,
	"error_report_ref" text,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lookup_audit_log" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"api_key_id" uuid,
	"customer_id" uuid,
	"phone_hash" text NOT NULL,
	"checkout_ref" text,
	"order_value_pkr" numeric(12, 2),
	"returned_tier" "risk_tier" NOT NULL,
	"returned_action" "recommended_action" NOT NULL,
	"mode" "risk_check_mode" NOT NULL,
	"source_platform" "source_platform" DEFAULT 'API' NOT NULL,
	"latency_ms" integer,
	CONSTRAINT "lookup_audit_log_pk" PRIMARY KEY("id","created_at")
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_id" uuid,
	"vendor_id" uuid NOT NULL,
	"batch_id" uuid,
	"external_order_ref" text NOT NULL,
	"event_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"status" "order_status",
	"reason_code" text,
	"is_correction" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone,
	"result" "event_result" NOT NULL,
	"reject_code" text,
	CONSTRAINT "order_events_pk" PRIMARY KEY("id","received_at")
) PARTITION BY RANGE ("received_at");
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"external_order_ref" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"checkout_ref" text,
	"source_platform" "source_platform" DEFAULT 'API' NOT NULL,
	"store_installation_id" uuid,
	"payment_method" "payment_method" NOT NULL,
	"order_value_pkr" numeric(12, 2) NOT NULL,
	"status" "order_status" NOT NULL,
	"reason_code" text,
	"derived_fault" "fault_class" NOT NULL,
	"vendor_claimed_fault" "fault_class",
	"cancellation_stage" "cancellation_stage",
	"delivery_attempts" smallint,
	"consent_notice_version" text NOT NULL,
	"is_backfill" boolean DEFAULT false NOT NULL,
	"is_disputed" boolean DEFAULT false NOT NULL,
	"scoring_excluded_reason" "scoring_excluded_reason",
	"occurred_at" timestamp with time zone NOT NULL,
	"last_terminal_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_vendor_ref_uq" UNIQUE("vendor_id","external_order_ref")
);
--> statement-breakpoint
CREATE TABLE "reason_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"valid_statuses" "order_status"[] NOT NULL,
	"derived_fault" "fault_class" NOT NULL,
	"severity_weight" numeric(4, 2) NOT NULL,
	"min_delivery_attempts" smallint,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_model_versions" (
	"version" integer PRIMARY KEY NOT NULL,
	"params" jsonb NOT NULL,
	"notes" text,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "store_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"platform" "store_platform" NOT NULL,
	"shop_domain" text NOT NULL,
	"access_token_encrypted" text,
	"api_key_id" uuid,
	"status_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk_mode" "risk_check_mode" DEFAULT 'POST_ORDER' NOT NULL,
	"consent_notice_version" text,
	"plugin_version" text,
	"status" "installation_status" DEFAULT 'ACTIVE' NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uninstalled_at" timestamp with time zone,
	"last_reconciled_at" timestamp with time zone,
	CONSTRAINT "store_installations_platform_domain_uq" UNIQUE("platform","shop_domain")
);
--> statement-breakpoint
CREATE TABLE "vendor_customer_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"partially_delivered" integer DEFAULT 0 NOT NULL,
	"user_fault" integer DEFAULT 0 NOT NULL,
	"vendor_fault" integer DEFAULT 0 NOT NULL,
	"logistics_fault" integer DEFAULT 0 NOT NULL,
	"neutral" integer DEFAULT 0 NOT NULL,
	"unknown" integer DEFAULT 0 NOT NULL,
	"success_rate" numeric(5, 2) NOT NULL,
	"score_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_customer_scores_uq" UNIQUE("customer_id","vendor_id")
);
--> statement-breakpoint
CREATE TABLE "vendor_metrics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"failed_orders" integer NOT NULL,
	"user_fault_share" numeric(5, 4),
	"category_baseline" numeric(5, 4),
	"bias_factor" numeric(3, 2) NOT NULL,
	"trust_weight" numeric(3, 2) NOT NULL,
	"dispute_upheld_rate" numeric(5, 4),
	"lookup_to_report_ratio" numeric(8, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_metrics_period_uq" UNIQUE("vendor_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"category" "vendor_category" NOT NULL,
	"status" "vendor_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"kyc_level" "kyc_level",
	"kyc_reference" text,
	"kyc_verified_at" timestamp with time zone,
	"kyc_reviewer_note" text,
	"owner_cnic_hash" text,
	"kyc_document_checksums" jsonb,
	"trust_weight" numeric(3, 2) DEFAULT 0.5 NOT NULL,
	"fault_claim_bias" numeric(3, 2) DEFAULT 1 NOT NULL,
	"bias_computed_at" timestamp with time zone,
	"ingestion_mode" "ingestion_mode" DEFAULT 'WEBHOOK' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"probation_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_owner_cnic_hash_unique" UNIQUE("owner_cnic_hash")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_identifiers" ADD CONSTRAINT "customer_identifiers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_signals" ADD CONSTRAINT "customer_signals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_signals" ADD CONSTRAINT "customer_signals_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_trust_profiles" ADD CONSTRAINT "customer_trust_profiles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_trust_profiles" ADD CONSTRAINT "customer_trust_profiles_score_version_score_model_versions_version_fk" FOREIGN KEY ("score_version") REFERENCES "public"."score_model_versions"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sharing_agreements" ADD CONSTRAINT "data_sharing_agreements_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_admin_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_approved_by_admin_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookup_audit_log" ADD CONSTRAINT "lookup_audit_log_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookup_audit_log" ADD CONSTRAINT "lookup_audit_log_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_batch_id_ingestion_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ingestion_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_installation_id_store_installations_id_fk" FOREIGN KEY ("store_installation_id") REFERENCES "public"."store_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_reason_code_reason_codes_code_fk" FOREIGN KEY ("reason_code") REFERENCES "public"."reason_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_installations" ADD CONSTRAINT "store_installations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_installations" ADD CONSTRAINT "store_installations_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_customer_scores" ADD CONSTRAINT "vendor_customer_scores_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_customer_scores" ADD CONSTRAINT "vendor_customer_scores_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_customer_scores" ADD CONSTRAINT "vendor_customer_scores_score_version_score_model_versions_version_fk" FOREIGN KEY ("score_version") REFERENCES "public"."score_model_versions"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_metrics_snapshots" ADD CONSTRAINT "vendor_metrics_snapshots_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "api_keys_vendor_idx" ON "api_keys" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identifiers_active_uq" ON "customer_identifiers" USING btree ("identifier_type","value_hash","key_version") WHERE "customer_identifiers"."is_active";--> statement-breakpoint
CREATE INDEX "customer_identifiers_customer_idx" ON "customer_identifiers" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_signals_value_idx" ON "customer_signals" USING btree ("signal_type","value_hash");--> statement-breakpoint
CREATE INDEX "customer_signals_customer_idx" ON "customer_signals" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "trust_profiles_next_recalc_idx" ON "customer_trust_profiles" USING btree ("next_decay_recalc_at");--> statement-breakpoint
CREATE INDEX "disputes_customer_time_idx" ON "disputes" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_one_open_per_order_uq" ON "disputes" USING btree ("order_id") WHERE "disputes"."status" in ('OPEN', 'AWAITING_VENDOR');--> statement-breakpoint
CREATE INDEX "ingestion_batches_vendor_idx" ON "ingestion_batches" USING btree ("vendor_id","created_at");--> statement-breakpoint
CREATE INDEX "lookup_audit_vendor_time_idx" ON "lookup_audit_log" USING btree ("vendor_id","created_at");--> statement-breakpoint
CREATE INDEX "lookup_audit_checkout_idx" ON "lookup_audit_log" USING btree ("vendor_id","checkout_ref");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_batch_idx" ON "order_events" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "orders_customer_time_idx" ON "orders" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "orders_vendor_time_idx" ON "orders" USING btree ("vendor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "orders_checkout_ref_idx" ON "orders" USING btree ("vendor_id","checkout_ref");
--> statement-breakpoint
-- Hand-written: monthly partitions for order_events and lookup_audit_log (blueprint sections 8.1, 12).
-- A scheduled job will call this ahead of each month and drop partitions older than retention.
CREATE OR REPLACE FUNCTION ensure_monthly_partition(parent text, month_start date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  start_date date := date_trunc('month', month_start)::date;
  end_date date := (date_trunc('month', month_start) + interval '1 month')::date;
  partition_name text := format('%s_%s', parent, to_char(start_date, 'YYYY_MM'));
BEGIN
  IF parent NOT IN ('order_events', 'lookup_audit_log') THEN
    RAISE EXCEPTION 'ensure_monthly_partition: unsupported table %', parent;
  END IF;
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    parent,
    start_date::text || ' 00:00:00+00',
    end_date::text || ' 00:00:00+00'
  );
END;
$$;
--> statement-breakpoint
SELECT ensure_monthly_partition('order_events', (now() + (n || ' month')::interval)::date)
FROM generate_series(0, 2) AS n;
--> statement-breakpoint
SELECT ensure_monthly_partition('lookup_audit_log', (now() + (n || ' month')::interval)::date)
FROM generate_series(0, 2) AS n;