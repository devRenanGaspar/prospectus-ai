-- Restrict SECURITY DEFINER helpers that are not public API endpoints.
-- Trigger and event-trigger functions execute through their bindings and do not
-- need EXECUTE privileges for Data API roles.
REVOKE EXECUTE ON FUNCTION public.log_whatsapp_state_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_refund_on_search_finalized()
  FROM PUBLIC, anon, authenticated, service_role;

-- The frontend now uses request_find_leads/request_copy/request_send. These
-- legacy debit helpers remain available only to trusted server-side workers.
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, text, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credits_bulk(uuid, text, integer, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credits_bulk(uuid, text, integer, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, text, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, text, uuid, jsonb, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits_bulk(uuid, text, integer, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits_bulk(uuid, text, integer, uuid, jsonb, text)
  TO service_role;

-- Make least privilege the default for functions created by future migrations.
-- Public RPCs must be granted explicitly after their access checks are reviewed.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
