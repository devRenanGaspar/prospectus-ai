-- Asserts that a database built from supabase/migrations/ alone is actually
-- usable. Run after migrations in an isolated/local Supabase database. The
-- transaction is always rolled back.
--
-- This exists because "the migrations applied cleanly" and "the environment
-- reproduces production" are different claims, and only the first was ever
-- checked. A fresh replay had exactly one credit_costs row, so every paid
-- action in the product -- request_send, request_copy, request_find_leads --
-- died on ACTION_NOT_FOUND, and the CI stayed green because the only SQL gate
-- seeded those prices itself before asserting them.
--
-- Keep these assertions keyed on *identity* (which action names, which plans)
-- rather than only counts: a count still passes when a migration swaps one row
-- for another.
begin;

do $$
declare
  _missing text;
  _n integer;
begin
  -- Every action the charge RPCs look up must have a price. Without this a
  -- fresh database cannot spend a single credit.
  select string_agg(a, ', ') into _missing
  from unnest(array['FIND_LEAD', 'GENERATE_COPY', 'SEND_MESSAGE',
                    'FIND_LEAD_REFUND', 'AI_CONVERSATION_TURN']) as a
  where not exists (
    select 1 from public.credit_costs c where c.action_name = a
  );
  if _missing is not null then
    raise exception 'credit_costs is missing seeded action(s): %', _missing;
  end if;

  -- The three the RPCs read must also be priced above zero, or the charge is
  -- silently free rather than merely broken.
  select count(*) into _n
  from public.credit_costs
  where action_name in ('FIND_LEAD', 'GENERATE_COPY', 'SEND_MESSAGE')
    and cost > 0;
  if _n <> 3 then
    raise exception 'FIND_LEAD/GENERATE_COPY/SEND_MESSAGE must all be priced > 0, got % of 3', _n;
  end if;

  -- Billing needs the catalogue. profiles.plan_id points at these ids, so the
  -- identity matters, not just the row count.
  select string_agg(p, ', ') into _missing
  from unnest(array['Trial', 'Básico', 'Avançado', 'Premium']) as p
  where not exists (
    select 1 from public.plans pl where pl.name = p and pl.is_active
  );
  if _missing is not null then
    raise exception 'plans is missing seeded plan(s): %', _missing;
  end if;

  if not exists (
    select 1 from public.plans
    where id = '35bb2a71-6fe1-459e-85a7-541fd8898051' and name = 'Trial'
  ) then
    raise exception 'the Trial plan must keep its fixed id: profiles.plan_id references it across environments';
  end if;

  -- The niche catalogue the lead search offers. 20260317211908 seeds three
  -- names that production replaced long ago; the seed migration removes them,
  -- so a replay must not resurrect them.
  select count(*) into _n from public.niche_options where is_active;
  if _n <> 16 then
    raise exception 'expected 16 active niche_options, got %', _n;
  end if;

  if exists (
    select 1 from public.niche_options
    where name in ('Médicos', 'Salão de Beleza', 'Advogados')
  ) then
    raise exception 'the superseded legacy niches are back in the catalogue';
  end if;

  if not exists (
    select 1 from public.niche_options where name = 'Indústria/Fábrica' and is_active
  ) then
    raise exception 'the Indústria/Fábrica niche is missing from the catalogue';
  end if;

  -- app_settings is a single-row table the maintenance mode reads.
  select count(*) into _n from public.app_settings;
  if _n <> 1 then
    raise exception 'app_settings must have exactly one row, got %', _n;
  end if;
end;
$$;

rollback;
