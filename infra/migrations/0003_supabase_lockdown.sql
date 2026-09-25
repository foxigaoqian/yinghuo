-- Supabase-specific hardening for a NEW installation after 0001 + 0002.
-- This intentionally blocks direct Data API access. The H5 must call the Yinghuo API;
-- the API authenticates users and scopes every query. Review existing grants/data before
-- applying to any project that already has tables or clients depending on the Data API.
BEGIN;

DO $$
DECLARE
  table_name text;
  app_tables text[] := ARRAY[
    'app_users', 'identities', 'auth_challenges', 'sessions', 'profiles',
    'profile_members', 'profile_preferences', 'invitations', 'consents',
    'storage_scopes', 'upload_sessions', 'assets', 'asset_refs', 'memories',
    'memory_versions', 'memory_chunks', 'conversations', 'messages',
    'generation_runs', 'stream_events', 'products', 'product_versions', 'quotes',
    'orders', 'order_items', 'payments', 'payment_events', 'entitlement_grants',
    'entitlement_ledger', 'refund_requests', 'tasks', 'task_attempts', 'works',
    'outbox_events', 'idempotency_records', 'oauth_states', 'memory_candidates',
    'media_preflights', 'payment_accounts', 'payment_attempts', 'payment_disputes',
    'reconciliation_runs', 'reconciliation_items', 'export_requests',
    'deletion_requests', 'deletion_steps', 'deletion_tombstones', 'notifications',
    'support_tickets', 'support_replies', 'admin_accounts', 'admin_scopes',
    'admin_sessions', 'audit_events', 'release_approvals', 'compensation_records',
    'legal_documents', 'content_entries'
  ];
BEGIN
  FOREACH table_name IN ARRAY app_tables LOOP
    IF to_regclass('public.' || quote_ident(table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
      END IF;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'private-memories',
      'private-memories',
      false,
      104857600,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'video/mp4']
    )
    ON CONFLICT (id) DO UPDATE
      SET public = false,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END;
$$;

COMMIT;
