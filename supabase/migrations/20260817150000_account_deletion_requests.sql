-- ============================================================================
-- Account deletion requests.
--
-- Settings.tsx has a "Solicitar exclusão de conta" dialog that promised
-- permanent removal of all data within 30 business days. Its handler fired a
-- success toast and closed the modal. There was no table, no RPC, no email and
-- no record: the promise was never kept because nothing was ever recorded.
--
-- This records the request and makes it visible. It deliberately does NOT
-- perform the deletion. A cascade across the domain tables, the per-tenant
-- crm_<number> table, auth.users and the state that still lives in the
-- pre-migration n8n project is a project of its own, and a wrong cascade in a
-- system that charges credits is worse than the current bug. Fulfilment stays
-- manual, which is what the product already does; what was missing was the
-- queue, the visibility and the truth in the UI.
--
-- Committed SLA, now that the text is honoured: acknowledge within 48h,
-- complete within 30 days. src/pages/Privacy.tsx already publishes the 30-day
-- figure, so that side of it was a commitment regardless of what the modal said.
-- ============================================================================

create table if not exists public.account_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status       text not null default 'pending'
                 check (status in ('pending', 'completed', 'cancelled')),
  handled_at   timestamptz,
  handled_by   uuid references auth.users(id),
  notes        text
);

-- One open request per user, enforced by the database rather than by the
-- application. This is also what makes request_account_deletion() safe against
-- two concurrent clicks.
create unique index if not exists account_deletion_requests_one_open_per_user
  on public.account_deletion_requests (user_id)
  where status = 'pending';

create index if not exists account_deletion_requests_pending_requested_at
  on public.account_deletion_requests (requested_at)
  where status = 'pending';

alter table public.account_deletion_requests enable row level security;

-- Two SELECT policies, matching the copy_requests pattern. The admin one is not
-- optional: ops_pending_account_deletions below is security_invoker, like every
-- other ops_* view, so without it an admin would read zero rows and the panel
-- would look empty while real requests waited.
drop policy if exists "Users read own deletion requests" on public.account_deletion_requests;
create policy "Users read own deletion requests"
  on public.account_deletion_requests for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins read all deletion requests" on public.account_deletion_requests;
create policy "Admins read all deletion requests"
  on public.account_deletion_requests for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- Writes go through the RPC only. Same shape as the copy/send request tables:
-- the existence of a row is evidence the RPC ran, not that a client asked.
revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;

-- ── request_account_deletion ────────────────────────────────────────────────
-- Idempotent: a second call while one is open returns the open request instead
-- of creating a duplicate or raising. No is_active_user() check on purpose --
-- a BLOCKED user must still be able to ask for their data to be deleted.
create or replace function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid          uuid := auth.uid();
  _id           uuid;
  _requested_at timestamptz;
  _created      boolean := false;
begin
  if _uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into public.account_deletion_requests (user_id)
  values (_uid)
  on conflict (user_id) where status = 'pending' do nothing
  returning id, requested_at into _id, _requested_at;

  if _id is not null then
    _created := true;
  else
    -- Lost the race, or already had one open. Either way, return the open one.
    select id, requested_at into _id, _requested_at
    from public.account_deletion_requests
    where user_id = _uid and status = 'pending'
    limit 1;
  end if;

  return jsonb_build_object(
    'success', true,
    'created', _created,
    'request_id', _id,
    'requested_at', _requested_at,
    'due_at', _requested_at + interval '30 days'
  );
end;
$$;

revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

-- ── Operator visibility ─────────────────────────────────────────────────────
create or replace view public.ops_pending_account_deletions
with (security_invoker = true) as
select
  r.id                                        as request_id,
  r.user_id,
  p.email,
  p.agency_name,
  r.requested_at,
  now() - r.requested_at                      as age,
  r.requested_at + interval '48 hours'        as acknowledge_by,
  r.requested_at + interval '30 days'         as complete_by,
  now() > r.requested_at + interval '30 days' as overdue
from public.account_deletion_requests r
join public.profiles p on p.id = r.user_id
where r.status = 'pending'
order by r.requested_at;

-- ── Active signal ───────────────────────────────────────────────────────────
-- A view alone is not enough here, and this repository has the evidence: in the
-- August incident, ops_stuck_leads flagged 191 stuck leads correctly and nobody
-- looked for four days, because the view was checked by hand. A legal deadline
-- cannot depend on someone remembering to open a panel.
--
-- Fires daily while anything is pending -- deliberately a nag, not a one-shot,
-- so an unhandled request keeps surfacing until it is closed.
--
-- NOTE: the hardcoded functions URL below matches the five existing call sites
-- (copy_quality_alert, email_queue_shared_token, ...). It is a known
-- portability defect -- these migrations cannot be replayed into a fresh
-- project without pointing its cron at production -- tracked separately, and
-- deliberately not diverged from here so the eventual fix can change one
-- pattern instead of two.
create or replace function private.check_and_send_account_deletion_alert()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _pending    integer;
  _overdue    integer;
  _recipients text[];
  _token      text;
  _html       text;
  _text       text;
  _row        record;
begin
  select count(*), count(*) filter (where now() > requested_at + interval '30 days')
    into _pending, _overdue
  from public.account_deletion_requests
  where status = 'pending';

  if _pending = 0 then
    return false;
  end if;

  select array_agg(email) into _recipients
  from public.profiles where role = 'ADMIN' and email is not null and email <> '';

  if _recipients is null or array_length(_recipients, 1) = 0 then
    raise warning 'check_and_send_account_deletion_alert: no admin recipients';
    return false;
  end if;

  select decrypted_secret into _token
  from vault.decrypted_secrets where name = 'ops_alert_shared_token';

  if _token is null then
    raise warning 'check_and_send_account_deletion_alert: ops_alert_shared_token not found in vault';
    return false;
  end if;

  _html := '<h2>Solicitações de exclusão de conta pendentes</h2><ul>';
  _text := 'Solicitações de exclusão de conta pendentes' || chr(10) || chr(10);

  for _row in
    select request_id, email, age, complete_by, overdue
    from public.ops_pending_account_deletions
  loop
    _html := _html || '<li>' || coalesce(_row.email, _row.request_id::text)
      || ' — aberta há ' || date_trunc('hour', _row.age)::text
      || ', concluir até ' || to_char(_row.complete_by, 'DD/MM/YYYY')
      || case when _row.overdue then ' <b>(VENCIDA)</b>' else '' end
      || '</li>';
    _text := _text || '- ' || coalesce(_row.email, _row.request_id::text)
      || ' — aberta há ' || date_trunc('hour', _row.age)::text
      || ', concluir até ' || to_char(_row.complete_by, 'DD/MM/YYYY')
      || case when _row.overdue then ' (VENCIDA)' else '' end
      || chr(10);
  end loop;

  _html := _html || '</ul><p>Runbook em <code>docs/operations/</code>. '
    || 'Consulte <code>public.ops_pending_account_deletions</code>.</p>';
  _text := _text || chr(10) || 'Consulte ops_pending_account_deletions.';

  perform net.http_post(
    url := 'https://tumqhovjzjojmrfoshou.supabase.co/functions/v1/send-ops-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Ops-Alert-Token', _token
    ),
    body := jsonb_build_object(
      'subject', '[Prospectus] ' || _pending || ' solicitação(ões) de exclusão de conta'
                 || case when _overdue > 0 then ' — ' || _overdue || ' VENCIDA(S)' else '' end,
      'html', _html,
      'text', _text,
      'to', to_jsonb(_recipients),
      'template', 'ops_account_deletion_alert'
    )
  );

  return true;
end;
$$;

revoke all on function private.check_and_send_account_deletion_alert() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'account-deletion-alert') then
    perform cron.unschedule('account-deletion-alert');
  end if;

  perform cron.schedule(
    'account-deletion-alert',
    '0 7 * * *',
    $job$select private.check_and_send_account_deletion_alert();$job$
  );
end;
$$;
