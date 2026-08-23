-- Contract test for admin_update_user_profile: run after migrations in an
-- isolated/local Supabase database. Rolled back at the end.
--
-- Two properties this asserts, both of which a client-side test cannot see
-- because they live in the database:
--   1. Clearing a user's plan (`_clear_plan => true`) actually clears it.
--      The function used to coalesce _plan_id back onto the existing column
--      whenever the caller sent NULL, so the admin UI's "Nenhum (Trial)"
--      option produced a success toast and changed nothing.
--   2. Exactly one signature of this function exists, and `authenticated`
--      can call it while `anon` cannot -- a DROP + CREATE that forgets the
--      grant leaves the function uncallable by the admin panel itself,
--      because ALTER DEFAULT PRIVILEGES (20260805155213) revokes EXECUTE
--      from every function `postgres` creates from here on.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999a01',
   'authenticated', 'authenticated', 'admin-rpc-test-admin@prospectus.invalid',
   'test-fixture-not-a-real-hash', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999a02',
   'authenticated', 'authenticated', 'admin-rpc-test-target@prospectus.invalid',
   'test-fixture-not-a-real-hash', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), '', '', '', '');

-- profiles_prevent_role_escalation requires is_admin(auth.uid()); the
-- fixture setup here runs before any admin exists to satisfy it, so the
-- trigger is off for this one statement and back on immediately after,
-- inside this transaction only (rolled back at the end of the file).
alter table public.profiles disable trigger profiles_prevent_role_escalation;
update public.profiles set role = 'ADMIN'
where id = '99999999-9999-4999-8999-999999999a01';
alter table public.profiles enable trigger profiles_prevent_role_escalation;

update public.profiles set plan_id = '35bb2a71-6fe1-459e-85a7-541fd8898051'
where id = '99999999-9999-4999-8999-999999999a02';

-- ============================================================================
-- Exactly one signature, correct grants
-- ============================================================================
do $$
declare
  _sig_count int;
begin
  select count(*) into _sig_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_update_user_profile';

  if _sig_count <> 1 then
    raise exception 'expected exactly 1 admin_update_user_profile signature, found %', _sig_count;
  end if;
end;
$$;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.admin_update_user_profile(uuid,text,integer,uuid,text,text,text,boolean)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must be able to call admin_update_user_profile';
  end if;

  if has_function_privilege(
    'anon',
    'public.admin_update_user_profile(uuid,text,integer,uuid,text,text,text,boolean)',
    'EXECUTE'
  ) then
    raise exception 'anon must not be able to call admin_update_user_profile';
  end if;
end;
$$;

-- ============================================================================
-- Clearing the plan actually clears it
-- ============================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"99999999-9999-4999-8999-999999999a01"}';

select public.admin_update_user_profile(
  _id => '99999999-9999-4999-8999-999999999a02'::uuid,
  _clear_plan => true
);

reset role;
reset "request.jwt.claims";

do $$
declare
  _plan_id uuid;
begin
  select plan_id into _plan_id from public.profiles
  where id = '99999999-9999-4999-8999-999999999a02';

  if _plan_id is not null then
    raise exception '_clear_plan => true must clear plan_id, still %', _plan_id;
  end if;
end;
$$;

-- ============================================================================
-- Omitting _plan_id (no _clear_plan) leaves an existing plan untouched --
-- the "not provided" branch this migration had to keep working.
-- ============================================================================
update public.profiles set plan_id = '25ec766f-7459-438d-af9b-712b237701e6'
where id = '99999999-9999-4999-8999-999999999a02';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"99999999-9999-4999-8999-999999999a01"}';

select public.admin_update_user_profile(
  _id => '99999999-9999-4999-8999-999999999a02'::uuid,
  _full_name => 'Untouched Plan Check'
);

reset role;
reset "request.jwt.claims";

do $$
declare
  _plan_id uuid;
begin
  select plan_id into _plan_id from public.profiles
  where id = '99999999-9999-4999-8999-999999999a02';

  if _plan_id is distinct from '25ec766f-7459-438d-af9b-712b237701e6'::uuid then
    raise exception 'omitting _clear_plan must leave plan_id untouched, got %', _plan_id;
  end if;
end;
$$;

rollback;
