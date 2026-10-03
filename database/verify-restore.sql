-- Only executed against the generated temporary restore database.
DO $$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'users', 'oauth_identities', 'auth_tokens', 'sessions', 'hands',
    'session_stats', 'auth_rate_limits', 'schema_migrations'
  ] LOOP
    IF to_regclass('public.' || required_table) IS NULL THEN
      RAISE EXCEPTION 'Required restored table is missing: %', required_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations) THEN
    RAISE EXCEPTION 'Restored migration history is empty';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE checksum !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Restored migration history has an invalid checksum';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND NOT c.convalidated
  ) THEN
    RAISE EXCEPTION 'Restored schema has an unvalidated constraint';
  END IF;
  IF (SELECT last_value FROM public.hands_id_seq) < COALESCE((SELECT max(id) FROM public.hands), 0) THEN
    RAISE EXCEPTION 'Restored hand-ID sequence is behind existing data';
  END IF;
END;
$$;

SELECT
  (SELECT count(*) FROM public.users) AS users,
  (SELECT count(*) FROM public.sessions) AS sessions,
  (SELECT count(*) FROM public.hands) AS hands,
  (SELECT count(*) FROM public.session_stats) AS session_stats,
  (SELECT count(*) FROM public.schema_migrations) AS migrations;
