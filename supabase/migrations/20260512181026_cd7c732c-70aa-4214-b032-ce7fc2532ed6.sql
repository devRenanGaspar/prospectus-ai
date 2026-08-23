
-- a) search_path
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- b) Revogar EXECUTE de funções internas
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_lead_comments_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- c) Revogar de anon nas RPCs públicas (mantém authenticated)
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_credits_bulk(uuid, text, integer, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_credits_bulk(uuid, text, integer, uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_lead_pool_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
