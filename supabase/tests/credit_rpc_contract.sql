-- Integration tests for the atomic credit-charging RPCs: request_send,
-- request_copy, request_find_leads (20260707120200/...120400). Run after
-- migrations in an isolated/local Supabase database. The transaction is
-- always rolled back.
--
-- The prices come from the schema, not from this file. They used to be seeded
-- here, which made "exact-debit correctness" circular: the test asserted the
-- numbers it had just written. 20260817230000 seeds them as reference data,
-- and replay_contract.sql asserts they are present, so this file can read the
-- real ones.
--
-- Fixture balance resets run as the connecting (privileged) role, not as
-- `authenticated`: profiles_prevent_sensitive_update (20260707120000) rejects
-- any credits_balance write whose current_user is 'authenticated'/'anon', by
-- design — the same rule a real client hitting this table directly would hit.
-- RESET ROLE returns to that privileged role between RPC calls.
begin;

-- Fixture user. handle_new_user() (trigger on_auth_user_created) creates the
-- matching public.profiles row automatically.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '99999999-9999-4999-8999-999999999901',
  'authenticated', 'authenticated',
  'rpc-integration-test@prospectus.invalid',
  'test-fixture-not-a-real-hash',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(),
  '', '', '', ''
);

-- Fixture leads: two per RPC under test, so a "still eligible" lead is
-- always available for the insufficient-credit case without colliding with
-- the one already claimed by the happy-path case.
insert into public.leads (id, user_id, name, status) values
  ('99999999-9999-4999-8999-9999999a0001', '99999999-9999-4999-8999-999999999901', 'Send fixture 1', 'NEW'),
  ('99999999-9999-4999-8999-9999999a0002', '99999999-9999-4999-8999-999999999901', 'Send fixture 2', 'NEW'),
  ('99999999-9999-4999-8999-9999999b0001', '99999999-9999-4999-8999-999999999901', 'Copy fixture 1', 'NEW'),
  ('99999999-9999-4999-8999-9999999b0002', '99999999-9999-4999-8999-999999999901', 'Copy fixture 2', 'NEW');

-- ============================================================================
-- request_send
-- ============================================================================

-- Insufficient credits FIRST, purely for a consistent file layout with the
-- other two RPCs below (request_send has no in-progress lock, so order does
-- not matter for it specifically).
update public.profiles set credits_balance = 0
where id = '99999999-9999-4999-8999-999999999901';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"99999999-9999-4999-8999-999999999901"}';

do $$
declare
  _status text;
begin
  begin
    perform public.request_send(
      array['99999999-9999-4999-8999-9999999a0002'::uuid],
      '99999999-9999-4999-8999-9999999c0002'::uuid
    );
    raise exception 'request_send: expected INSUFFICIENT_CREDITS to be raised';
  exception
    when others then
      if sqlerrm <> 'INSUFFICIENT_CREDITS' then
        raise;
      end if;
  end;

  select status into _status from public.leads
  where id = '99999999-9999-4999-8999-9999999a0002';
  if _status <> 'NEW' then
    raise exception 'request_send insufficient-credit: lead must stay NEW, got %', _status;
  end if;

  if exists (
    select 1 from public.send_requests where id = '99999999-9999-4999-8999-9999999c0002'
  ) then
    raise exception 'request_send insufficient-credit: idempotency slot must be rolled back';
  end if;
end;
$$;

reset role;
update public.profiles set credits_balance = 10
where id = '99999999-9999-4999-8999-999999999901';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"99999999-9999-4999-8999-999999999901"}';

do $$
declare
  _result jsonb;
  _balance integer;
  _status text;
begin
  -- Happy path: exact debit for one SEND_MESSAGE charge.
  _result := public.request_send(
    array['99999999-9999-4999-8999-9999999a0001'::uuid],
    '99999999-9999-4999-8999-9999999c0001'::uuid
  );
  if not (_result->>'success')::boolean
    or (_result->>'charged')::int <> 1
    or (_result->>'cost')::int <> 1 then
    raise exception 'request_send happy path: unexpected result %', _result;
  end if;

  select credits_balance into _balance from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';
  if _balance <> 9 then
    raise exception 'request_send happy path: expected balance 9, got %', _balance;
  end if;

  select status into _status from public.leads
  where id = '99999999-9999-4999-8999-9999999a0001';
  if _status <> 'SEND_PENDING' then
    raise exception 'request_send happy path: expected lead status SEND_PENDING, got %', _status;
  end if;

  -- Idempotency: replaying the same request_id must not charge again.
  _result := public.request_send(
    array['99999999-9999-4999-8999-9999999a0001'::uuid],
    '99999999-9999-4999-8999-9999999c0001'::uuid
  );
  if not (_result->>'idempotent')::boolean then
    raise exception 'request_send replay: expected idempotent skip, got %', _result;
  end if;

  select credits_balance into _balance from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';
  if _balance <> 9 then
    raise exception 'request_send replay: balance must stay 9, got %', _balance;
  end if;
end;
$$;

-- ============================================================================
-- request_copy
-- ============================================================================

-- Insufficient credits FIRST: request_copy's COPY_IN_PROGRESS lock blocks any
-- other request_id while a 'processing' row is < 15 minutes old, and the
-- happy-path call below leaves its own row in 'processing' (only the n8n
-- callback ever completes it), so this must run first.
reset role;
update public.profiles set credits_balance = 0
where id = '99999999-9999-4999-8999-999999999901';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"99999999-9999-4999-8999-999999999901"}';

do $$
declare
  _status text;
begin
  begin
    perform public.request_copy(
      array['99999999-9999-4999-8999-9999999b0002'::uuid],
      '99999999-9999-4999-8999-9999999c0004'::uuid
    );
    raise exception 'request_copy: expected INSUFFICIENT_CREDITS to be raised';
  exception
    when others then
      if sqlerrm <> 'INSUFFICIENT_CREDITS' then
        raise;
      end if;
  end;

  select status into _status from public.leads
  where id = '99999999-9999-4999-8999-9999999b0002';
  if _status <> 'NEW' then
    raise exception 'request_copy insufficient-credit: lead must stay NEW, got %', _status;
  end if;

  if exists (
    select 1 from public.copy_requests where id = '99999999-9999-4999-8999-9999999c0004'
  ) then
    raise exception 'request_copy insufficient-credit: idempotency slot must be rolled back';
  end if;
end;
$$;

reset role;
update public.profiles set credits_balance = 10
where id = '99999999-9999-4999-8999-999999999901';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"99999999-9999-4999-8999-999999999901"}';

do $$
declare
  _result jsonb;
  _balance integer;
  _status text;
begin
  -- Happy path: exact debit for one GENERATE_COPY charge.
  _result := public.request_copy(
    array['99999999-9999-4999-8999-9999999b0001'::uuid],
    '99999999-9999-4999-8999-9999999c0003'::uuid
  );
  if not (_result->>'success')::boolean
    or (_result->>'charged')::int <> 1
    or (_result->>'cost')::int <> 3 then
    raise exception 'request_copy happy path: unexpected result %', _result;
  end if;

  select credits_balance into _balance from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';
  if _balance <> 7 then
    raise exception 'request_copy happy path: expected balance 7, got %', _balance;
  end if;

  select status into _status from public.leads
  where id = '99999999-9999-4999-8999-9999999b0001';
  if _status <> 'COPY_PENDING' then
    raise exception 'request_copy happy path: expected lead status COPY_PENDING, got %', _status;
  end if;

  -- Idempotency: replaying the same request_id must not charge again.
  _result := public.request_copy(
    array['99999999-9999-4999-8999-9999999b0001'::uuid],
    '99999999-9999-4999-8999-9999999c0003'::uuid
  );
  if not (_result->>'idempotent')::boolean then
    raise exception 'request_copy replay: expected idempotent skip, got %', _result;
  end if;

  select credits_balance into _balance from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';
  if _balance <> 7 then
    raise exception 'request_copy replay: balance must stay 7, got %', _balance;
  end if;
end;
$$;

-- ============================================================================
-- request_find_leads
-- ============================================================================

-- Insufficient credits FIRST: request_find_leads's SEARCH_IN_PROGRESS lock
-- blocks any other request_id while a 'pending'/'processing' row is < 30
-- minutes old, and the happy-path call below leaves its row 'pending'
-- indefinitely (only n8n transitions it), so this must run first.
reset role;
update public.profiles set credits_balance = 0
where id = '99999999-9999-4999-8999-999999999901';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"99999999-9999-4999-8999-999999999901"}';

do $$
begin
  begin
    perform public.request_find_leads(
      3, 0, '99999999-9999-4999-8999-9999999c0006'::uuid
    );
    raise exception 'request_find_leads: expected INSUFFICIENT_CREDITS to be raised';
  exception
    when others then
      if sqlerrm <> 'INSUFFICIENT_CREDITS' then
        raise;
      end if;
  end;

  if exists (
    select 1 from public.lead_searches where id = '99999999-9999-4999-8999-9999999c0006'
  ) then
    raise exception 'request_find_leads insufficient-credit: idempotency slot must be rolled back';
  end if;
end;
$$;

reset role;
update public.profiles set credits_balance = 10
where id = '99999999-9999-4999-8999-999999999901';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"99999999-9999-4999-8999-999999999901"}';

do $$
declare
  _result jsonb;
  _balance integer;
begin
  -- Happy path: exact debit for FIND_LEAD unit cost * quantity.
  _result := public.request_find_leads(
    3, 0, '99999999-9999-4999-8999-9999999c0005'::uuid
  );
  if not (_result->>'success')::boolean
    or (_result->>'charged')::int <> 3
    or (_result->>'cost')::int <> 3 then
    raise exception 'request_find_leads happy path: unexpected result %', _result;
  end if;

  select credits_balance into _balance from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';
  if _balance <> 7 then
    raise exception 'request_find_leads happy path: expected balance 7, got %', _balance;
  end if;

  -- Idempotency: replaying the same request_id must not charge again.
  _result := public.request_find_leads(
    3, 0, '99999999-9999-4999-8999-9999999c0005'::uuid
  );
  if not (_result->>'idempotent')::boolean then
    raise exception 'request_find_leads replay: expected idempotent skip, got %', _result;
  end if;

  select credits_balance into _balance from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';
  if _balance <> 7 then
    raise exception 'request_find_leads replay: balance must stay 7, got %', _balance;
  end if;
end;
$$;

reset role;

-- ============================================================================
-- Refunds: fail_copy_request and refund_unused_search_credits
-- ============================================================================
-- A refund must return the price ACTUALLY CHARGED times the UNDELIVERED
-- fraction. Both functions previously had half of that: fail_copy_request
-- refunded the full charge while restoring only the still-pending leads (so a
-- user could take the whole refund and keep the delivered copy), and
-- refund_unused_search_credits read credit_costs at refund time (so a price
-- change between charge and refund minted or destroyed credits).

insert into public.leads (id, user_id, name, status) values
  ('99999999-9999-4999-8999-9999999d0001', '99999999-9999-4999-8999-999999999901', 'Refund fixture 1', 'COPY_PENDING'),
  ('99999999-9999-4999-8999-9999999d0002', '99999999-9999-4999-8999-999999999901', 'Refund fixture 2', 'COPY_PENDING'),
  ('99999999-9999-4999-8999-9999999d0003', '99999999-9999-4999-8999-999999999901', 'Refund fixture 3', 'COPY_PENDING');

insert into public.copy_requests (id, user_id, lead_ids, status) values
  ('99999999-9999-4999-8999-9999999c0010', '99999999-9999-4999-8999-999999999901',
   array['99999999-9999-4999-8999-9999999d0001'::uuid,
         '99999999-9999-4999-8999-9999999d0002'::uuid,
         '99999999-9999-4999-8999-9999999d0003'::uuid], 'processing');

insert into public.usage_logs (user_id, action_name, cost, lead_id, metadata) values
  ('99999999-9999-4999-8999-999999999901', 'GENERATE_COPY', 9, null,
   jsonb_build_object('copy_request_id', '99999999-9999-4999-8999-9999999c0010',
                      'quantity', 3, 'unit_cost', 3));

-- n8n delivered two of the three before the failure
update public.leads set status = 'COPY_READY'
where id in ('99999999-9999-4999-8999-9999999d0001', '99999999-9999-4999-8999-9999999d0002');

update public.profiles set credits_balance = 0
where id = '99999999-9999-4999-8999-999999999901';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"99999999-9999-4999-8999-999999999901"}';

do $$
declare
  _result jsonb;
  _balance integer;
begin
  -- Proportional refund: 1 undelivered lead x unit_cost 3, NOT the full 9.
  _result := public.fail_copy_request('99999999-9999-4999-8999-9999999c0010'::uuid);
  if (_result->>'refunded')::int <> 3 or (_result->>'leads_restored')::int <> 1 then
    raise exception 'fail_copy_request: expected refunded=3 leads_restored=1, got %', _result;
  end if;

  select credits_balance into _balance from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';
  if _balance <> 3 then
    raise exception 'fail_copy_request: expected balance 3, got %', _balance;
  end if;

  -- Replay must not refund twice.
  _result := public.fail_copy_request('99999999-9999-4999-8999-9999999c0010'::uuid);
  if not (_result->>'skipped')::boolean then
    raise exception 'fail_copy_request replay: expected skip, got %', _result;
  end if;

  select credits_balance into _balance from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';
  if _balance <> 3 then
    raise exception 'fail_copy_request replay: balance must stay 3, got %', _balance;
  end if;
end;
$$;

reset role;

-- Delivery must be refused after the refund, for the n8n/service-role path.
-- The end user is deliberately unaffected: COPY_READY is a Kanban column and
-- dragging a card there costs nothing.
do $$
begin
  begin
    update public.leads set status = 'COPY_READY'
    where id = '99999999-9999-4999-8999-9999999d0003';
    raise exception 'delivery after refund should have been rejected';
  exception
    when others then
      if sqlerrm <> 'COPY_REQUEST_ALREADY_REFUNDED' then
        raise;
      end if;
  end;
end;
$$;

-- refund_unused_search_credits must use the charged price, not today's price.
insert into public.lead_searches (id, user_id, quantity_requested, limit_per_niche, status, leads_found)
values ('99999999-9999-4999-8999-9999999e0001', '99999999-9999-4999-8999-999999999901', 10, 0, 'pending', 0);

insert into public.usage_logs (user_id, action_name, cost, lead_id, metadata) values
  ('99999999-9999-4999-8999-999999999901', 'FIND_LEAD', 10, null,
   jsonb_build_object('search_id', '99999999-9999-4999-8999-9999999e0001',
                      'quantity', 10, 'unit_cost', 1));

update public.profiles set credits_balance = 0
where id = '99999999-9999-4999-8999-999999999901';

-- Price triples between charge and refund.
update public.credit_costs set cost = 3 where action_name = 'FIND_LEAD';

-- Finalising the search fires trg_refund_on_search_finalized.
update public.lead_searches set status = 'failed'
where id = '99999999-9999-4999-8999-9999999e0001';

do $$
declare
  _balance integer;
  _logged_unit integer;
begin
  select credits_balance into _balance from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';
  if _balance <> 10 then
    raise exception 'refund_unused_search_credits: expected 10 (charged at 1); reading credit_costs at refund time would give 30. Got %', _balance;
  end if;

  select (metadata->>'unit_cost')::int into _logged_unit
  from public.usage_logs
  where action_name = 'FIND_LEAD_REFUND'
    and metadata->>'search_id' = '99999999-9999-4999-8999-9999999e0001';
  if _logged_unit <> 1 then
    raise exception 'refund log should record the charged unit_cost 1, got %', _logged_unit;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- deduct_credits: the guard must agree with the grant.
--
-- These functions are EXECUTE-granted to service_role only, and revoked from
-- anon and authenticated. They used to open with
-- `IF auth.uid() IS DISTINCT FROM _user_id THEN RAISE`, which a service-role
-- caller can never satisfy because it has no JWT and auth.uid() is NULL. The
-- one role allowed to call them was the one role guaranteed to be rejected:
-- 24 of 24 production calls failed over four days and nothing noticed, because
-- the n8n workflow swallowed the error.
--
-- Both directions are asserted. Only checking that service_role succeeds would
-- pass for a function with no guard at all.
-- ---------------------------------------------------------------------------

update public.credit_costs set cost = 1 where action_name = 'FIND_LEAD';
update public.profiles set credits_balance = 50
where id = '99999999-9999-4999-8999-999999999901';

do $$
declare
  _result jsonb;
  _balance integer;
  _error text := 'NONE';
begin
  -- A service-role caller (no JWT, so auth.uid() is NULL) must be able to
  -- charge on a user's behalf. This is how n8n bills the SDR agent's replies.
  _result := public.deduct_credits(
    '99999999-9999-4999-8999-999999999901'::uuid,
    'FIND_LEAD', null::uuid, '{}'::jsonb, null::text
  );
  if (_result->>'success')::boolean is not true then
    raise exception 'deduct_credits must succeed for a service-role caller, got %', _result;
  end if;

  select credits_balance into _balance from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';
  if _balance <> 49 then
    raise exception 'deduct_credits should have debited 1 from 50, balance is %', _balance;
  end if;

  -- And a caller who *does* carry a JWT still may not debit somebody else.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"99999999-9999-4999-8999-9999999999ff","role":"authenticated"}',
    true
  );
  begin
    perform public.deduct_credits(
      '99999999-9999-4999-8999-999999999901'::uuid,
      'FIND_LEAD', null::uuid, '{}'::jsonb, null::text
    );
  exception when others then
    _error := SQLERRM;
  end;
  perform set_config('request.jwt.claims', '', true);

  if _error <> 'Permission denied' then
    raise exception 'deduct_credits must refuse a JWT belonging to another user, got %', _error;
  end if;
end;
$$;

rollback;
