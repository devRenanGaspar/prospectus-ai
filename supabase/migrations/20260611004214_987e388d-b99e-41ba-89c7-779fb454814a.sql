REVOKE EXECUTE ON FUNCTION public.assign_lead_to_user(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_lead_to_user(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_lead_to_user(uuid, uuid) TO service_role;
