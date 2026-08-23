-- Baseline schema/table/sequence privileges for the Data API roles (anon,
-- authenticated, service_role). Supabase's platform provisions these
-- automatically when a project is created, entirely outside migration
-- history -- discovered the same way as 20260805155212 (rls_auto_enable): a
-- fresh `supabase start` replay left `authenticated` with no SELECT on
-- public.leads ("permission denied for table leads"), because nothing in
-- this repo's migrations had ever needed to state a baseline that hosted
-- Supabase has always provided implicitly since project creation.
--
-- Verified directly against production's pg_default_acl / has_schema_privilege
-- before writing this: reproduces exactly what role postgres (the role
-- migrations run as) already has there today, for tables and sequences.
-- Functions are deliberately left alone -- 20260805155213 already
-- establishes the correct, narrower function default later in this history.
--
-- Timestamped one second before the very first migration: ALTER DEFAULT
-- PRIVILEGES only affects objects created after it runs, so it must precede
-- every CREATE TABLE in this repo to apply to all of them on a fresh replay.
-- Applying to production is a verified no-op: it only affects tables created
-- in the future by role postgres, and postgres's default ACL there already
-- grants exactly this.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role, postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role, postgres;
