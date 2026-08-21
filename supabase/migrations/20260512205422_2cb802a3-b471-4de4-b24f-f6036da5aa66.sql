-- Helpers for server-side role checks
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND role <> 'BLOCKED'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.is_active_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;

-- Harden existing SECURITY DEFINER functions against anonymous execution
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_user_profile(uuid,text,integer,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid,text,integer,uuid,text,text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.deduct_credits(uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits(uuid,text,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits_bulk(uuid,text,integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits_bulk(uuid,text,integer,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid,text,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits_bulk(uuid,text,integer,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits_bulk(uuid,text,integer,uuid,jsonb,text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_lead_pool_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_pool_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.cleanup_lead_comments_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_role_self_escalation() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.enqueue_email(text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text,text,bigint,jsonb) TO service_role;

-- Validate admin profile updates more strictly
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  _id uuid,
  _role text DEFAULT NULL,
  _credits_balance integer DEFAULT NULL,
  _plan_id uuid DEFAULT NULL,
  _full_name text DEFAULT NULL,
  _email text DEFAULT NULL,
  _sdr_phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  IF _role IS NOT NULL AND _role NOT IN ('USER', 'ADMIN', 'BLOCKED') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF _credits_balance IS NOT NULL AND _credits_balance < 0 THEN
    RAISE EXCEPTION 'Invalid credits balance';
  END IF;

  UPDATE public.profiles SET
    role             = COALESCE(_role, role),
    credits_balance  = COALESCE(_credits_balance, credits_balance),
    plan_id          = CASE WHEN _plan_id IS NOT NULL THEN _plan_id ELSE plan_id END,
    full_name        = COALESCE(_full_name, full_name),
    email            = COALESCE(_email, email),
    sdr_phone        = COALESCE(_sdr_phone, sdr_phone)
  WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.admin_update_user_profile(uuid,text,integer,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid,text,integer,uuid,text,text,text) TO authenticated;

-- Ensure non-admins cannot call the lead pool summary RPC directly
CREATE OR REPLACE FUNCTION public.get_lead_pool_summary()
RETURNS TABLE(category text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(category_name, 'Sem categoria') AS category, count(*) AS count
  FROM public.leads
  WHERE user_id IS NULL
    AND public.is_admin(auth.uid())
  GROUP BY category_name
  ORDER BY count DESC;
$$;

REVOKE ALL ON FUNCTION public.get_lead_pool_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_pool_summary() TO authenticated;

-- Block credit-consuming RPCs for blocked accounts
CREATE OR REPLACE FUNCTION public.deduct_credits(_user_id uuid, _action_name text, _lead_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb, _phone text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cost integer;
  _balance integer;
  _new_balance integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT public.is_active_user(_user_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT cost INTO _cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND');
  END IF;

  SELECT credits_balance INTO _balance
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF _balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF _balance < _cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDITS', 'balance', _balance, 'cost', _cost);
  END IF;

  _new_balance := _balance - _cost;

  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;

  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata, phone)
  VALUES (_user_id, _action_name, _cost, _lead_id, _metadata, _phone);

  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _cost);
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credits(_user_id uuid, _action_name text, _lead_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cost integer;
  _balance integer;
  _new_balance integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT public.is_active_user(_user_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT cost INTO _cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND');
  END IF;

  SELECT credits_balance INTO _balance
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF _balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF _balance < _cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDITS', 'balance', _balance, 'cost', _cost);
  END IF;

  _new_balance := _balance - _cost;

  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;

  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
  VALUES (_user_id, _action_name, _cost, _lead_id, _metadata);

  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _cost);
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credits_bulk(_user_id uuid, _action_name text, _quantity integer, _lead_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb, _phone text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _unit_cost integer;
  _total_cost integer;
  _balance integer;
  _new_balance integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT public.is_active_user(_user_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF _quantity < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY');
  END IF;

  SELECT cost INTO _unit_cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _unit_cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND');
  END IF;

  _total_cost := _unit_cost * _quantity;

  SELECT credits_balance INTO _balance
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF _balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF _balance < _total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDITS', 'balance', _balance, 'cost', _total_cost);
  END IF;

  _new_balance := _balance - _total_cost;

  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;

  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata, phone)
  VALUES (_user_id, _action_name, _total_cost, _lead_id, _metadata || jsonb_build_object('quantity', _quantity, 'unit_cost', _unit_cost), _phone);

  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _total_cost, 'unit_cost', _unit_cost, 'quantity', _quantity);
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credits_bulk(_user_id uuid, _action_name text, _quantity integer, _lead_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _unit_cost integer;
  _total_cost integer;
  _balance integer;
  _new_balance integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT public.is_active_user(_user_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF _quantity < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY');
  END IF;

  SELECT cost INTO _unit_cost FROM public.credit_costs WHERE action_name = _action_name;
  IF _unit_cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_FOUND');
  END IF;

  _total_cost := _unit_cost * _quantity;

  SELECT credits_balance INTO _balance
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF _balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF _balance < _total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDITS', 'balance', _balance, 'cost', _total_cost);
  END IF;

  _new_balance := _balance - _total_cost;

  UPDATE public.profiles SET credits_balance = _new_balance WHERE id = _user_id;

  INSERT INTO public.usage_logs (user_id, action_name, cost, lead_id, metadata)
  VALUES (_user_id, _action_name, _total_cost, _lead_id, _metadata || jsonb_build_object('quantity', _quantity, 'unit_cost', _unit_cost));

  RETURN jsonb_build_object('success', true, 'new_balance', _new_balance, 'cost', _total_cost, 'unit_cost', _unit_cost, 'quantity', _quantity);
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_credits(uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits(uuid,text,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits_bulk(uuid,text,integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_credits_bulk(uuid,text,integer,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid,text,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits_bulk(uuid,text,integer,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits_bulk(uuid,text,integer,uuid,jsonb,text) TO authenticated;

-- Restrict regular app RLS policies to active (non-BLOCKED) users
DROP POLICY IF EXISTS "Users manage own dismissals" ON public.announcement_dismissals;
CREATE POLICY "Users manage own dismissals"
ON public.announcement_dismissals
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read announcements" ON public.announcements;
CREATE POLICY "Authenticated users can read announcements"
ON public.announcements
FOR SELECT
TO authenticated
USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read app_settings" ON public.app_settings;
CREATE POLICY "Authenticated users can read app_settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users access own copy_requests" ON public.copy_requests;
CREATE POLICY "Users access own copy_requests"
ON public.copy_requests
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read costs" ON public.credit_costs;
CREATE POLICY "Authenticated users can read costs"
ON public.credit_costs
FOR SELECT
TO authenticated
USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read active credit packages" ON public.credit_packages;
CREATE POLICY "Authenticated users can read active credit packages"
ON public.credit_packages
FOR SELECT
TO authenticated
USING (is_active = true AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users CRUD own lead comments" ON public.lead_comments;
CREATE POLICY "Users CRUD own lead comments"
ON public.lead_comments
FOR ALL
TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND lead_id IN (SELECT leads.id FROM public.leads WHERE leads.user_id = auth.uid())
)
WITH CHECK (
  public.is_active_user(auth.uid())
  AND lead_id IN (SELECT leads.id FROM public.leads WHERE leads.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users access own searches" ON public.lead_searches;
CREATE POLICY "Users access own searches"
ON public.lead_searches
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users access own leads" ON public.leads;
CREATE POLICY "Users access own leads"
ON public.leads
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users access own messages" ON public.messages;
CREATE POLICY "Users access own messages"
ON public.messages
FOR ALL
TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND lead_id IN (SELECT leads.id FROM public.leads WHERE leads.user_id = auth.uid())
)
WITH CHECK (
  public.is_active_user(auth.uid())
  AND lead_id IN (SELECT leads.id FROM public.leads WHERE leads.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users access own webhooks" ON public.n8n_webhooks;
CREATE POLICY "Users access own webhooks"
ON public.n8n_webhooks
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Anyone can read active niches" ON public.niche_options;
CREATE POLICY "Anyone can read active niches"
ON public.niche_options
FOR SELECT
TO authenticated
USING (is_active = true AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read plans" ON public.plans;
CREATE POLICY "Authenticated users can read plans"
ON public.plans
FOR SELECT
TO authenticated
USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id AND public.is_active_user(auth.uid()))
WITH CHECK (auth.uid() = id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users access own send_requests" ON public.send_requests;
CREATE POLICY "Users access own send_requests"
ON public.send_requests
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users access own subscriptions" ON public.subscriptions;
CREATE POLICY "Users access own subscriptions"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users access own usage" ON public.usage_logs;
CREATE POLICY "Users access own usage"
ON public.usage_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()));

-- Tighten realtime channel authorization and remove app_settings row broadcasts
DROP POLICY IF EXISTS "Users subscribe to own lead topics" ON realtime.messages;
CREATE POLICY "Users subscribe to own lead topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND realtime.topic() LIKE 'messages-%'
  AND EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id::text = substring(realtime.topic() from 10)
      AND l.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users subscribe to own leads topic" ON realtime.messages;
CREATE POLICY "Users subscribe to own leads topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND realtime.topic() LIKE 'leads-%'
  AND substring(realtime.topic() from 7) = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Authenticated can subscribe to maintenance" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to maintenance"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND realtime.topic() = 'app-settings-maintenance'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.app_settings;
  END IF;
END $$;