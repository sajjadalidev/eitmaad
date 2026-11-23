-- Hand-written. Supabase exposes the public schema through its Data API (anon and authenticated roles).
-- Etimaad reads and writes only through its own server connection, so the Data API must see nothing.
-- 1) Row level security on every table, with no policies: API roles get no rows.
-- 2) Revoke API role grants, now and for future objects.
-- Both steps are safe on plain Postgres: the role step is skipped when the roles do not exist.

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
  END IF;
END $$;
--> statement-breakpoint
-- New monthly partitions also get row level security.
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
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', partition_name);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ensure_monthly_partition(text, date) FROM PUBLIC;
