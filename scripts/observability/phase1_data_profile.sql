-- Aggregate-only production audit. This query never returns row identifiers,
-- customer attributes, message contents, payloads, tokens, URLs or other PII.
select jsonb_build_object(
  'generated_at', now(),
  'source_windows', (
    select jsonb_agg(to_jsonb(source_window) order by source_window.source_name)
    from (
      select 'auth.audit_log_entries' as source_name, count(*) as row_count, min(created_at) as first_at, max(created_at) as last_at from auth.audit_log_entries
      union all select 'auth.sessions', count(*), min(created_at), max(created_at) from auth.sessions
      union all select 'auth.users', count(*), min(created_at), max(created_at) from auth.users
      union all select 'public.copy_requests', count(*), min(created_at), max(created_at) from public.copy_requests
      union all select 'public.email_send_log', count(*), min(created_at), max(created_at) from public.email_send_log
      union all select 'public.lead_comments', count(*), min(created_at), max(created_at) from public.lead_comments
      union all select 'public.lead_searches', count(*), min(created_at), max(created_at) from public.lead_searches
      union all select 'public.leads', count(*), min(created_at), max(created_at) from public.leads
      union all select 'public.messages', count(*), min("timestamp"), max("timestamp") from public.messages
      union all select 'public.profiles', count(*), min(created_at), max(created_at) from public.profiles
      union all select 'public.send_requests', count(*), min(created_at), max(created_at) from public.send_requests
      union all select 'public.subscription_events', count(*), min(created_at), max(created_at) from public.subscription_events
      union all select 'public.subscriptions', count(*), min(created_at), max(created_at) from public.subscriptions
      union all select 'public.usage_logs', count(*), min("timestamp"), max("timestamp") from public.usage_logs
      union all select 'public.whatsapp_connection_events', count(*), min(created_at), max(created_at) from public.whatsapp_connection_events
    ) source_window
  ),
  'distributions', (
    select jsonb_agg(to_jsonb(distribution) order by distribution.source_name, distribution.dimension_value)
    from (
      select 'copy_requests.status' as source_name, status as dimension_value, count(*) as row_count from public.copy_requests group by status
      union all select 'email_send_log.status', status, count(*) from public.email_send_log group by status
      union all select 'lead_searches.status', status, count(*) from public.lead_searches group by status
      union all select 'leads.status', status, count(*) from public.leads group by status
      union all select 'messages.sender', sender, count(*) from public.messages group by sender
      union all select 'profiles.role', role, count(*) from public.profiles group by role
      union all select 'profiles.whatsapp_status', whatsapp_status, count(*) from public.profiles group by whatsapp_status
      union all select 'send_requests.status', status, count(*) from public.send_requests group by status
      union all select 'subscription_events.event_type', event_type, count(*) from public.subscription_events group by event_type
      union all select 'subscription_events.status', status, count(*) from public.subscription_events group by status
      union all select 'subscriptions.status', status, count(*) from public.subscriptions group by status
      union all select 'usage_logs.action_name', action_name, count(*) from public.usage_logs group by action_name
      union all select 'whatsapp_connection_events.event_type', event_type, count(*) from public.whatsapp_connection_events group by event_type
    ) distribution
  ),
  'timestamp_quality', (
    select jsonb_agg(to_jsonb(timestamp_check) order by timestamp_check.source_name, timestamp_check.status)
    from (
      select 'copy_requests' as source_name, status, count(*) as row_count,
        count(completed_at) as completed_at_present,
        count(*) filter (where completed_at < created_at) as invalid_order
      from public.copy_requests group by status
      union all
      select 'lead_searches', status, count(*), count(completed_at),
        count(*) filter (where completed_at < created_at or refunded_at < created_at)
      from public.lead_searches group by status
      union all
      select 'send_requests', status, count(*), count(completed_at),
        count(*) filter (where completed_at < created_at)
      from public.send_requests group by status
    ) timestamp_check
  ),
  'field_coverage', (
    select jsonb_agg(to_jsonb(field_check) order by field_check.source_name, field_check.field_name)
    from (
      select 'profiles' as source_name, 'onboarding_completed_true' as field_name, count(*) as total_rows,
        count(*) filter (where onboarding_completed is true) as populated_rows from public.profiles
      union all select 'profiles', 'google_calendar_connected_at', count(*), count(google_calendar_connected_at) from public.profiles
      union all select 'profiles', 'whatsapp_active', count(*), count(*) filter (where whatsapp_status = 'active') from public.profiles
      union all select 'lead_searches', 'completed_at', count(*), count(completed_at) from public.lead_searches
      union all select 'lead_searches', 'refunded_at', count(*), count(refunded_at) from public.lead_searches
      union all select 'leads', 'search_id', count(*), count(search_id) from public.leads
      union all select 'leads', 'google_place_id', count(*), count(google_place_id) from public.leads
      union all select 'leads', 'ai_generated_copy', count(*), count(*) filter (where nullif(btrim(ai_generated_copy), '') is not null) from public.leads
      union all select 'leads', 'commercial_message', count(*), count(*) filter (where nullif(btrim(mensagem_abordagem_comercial), '') is not null) from public.leads
      union all select 'leads', 'last_message_at', count(*), count(last_message_at) from public.leads
      union all select 'messages', 'external_message_id', count(*), count(external_message_id) from public.messages
      union all select 'usage_logs', 'metadata', count(*), count(metadata) from public.usage_logs
      union all select 'subscription_events', 'idempotency_key', count(*), count(idempotency_key) from public.subscription_events
    ) field_check
  ),
  'flow_links', (
    select jsonb_agg(to_jsonb(flow_check) order by flow_check.metric_name)
    from (
      select 'searches_total' as metric_name, count(*) as metric_value from public.lead_searches
      union all select 'searches_with_at_least_one_lead', count(*) from public.lead_searches s where exists (select 1 from public.leads l where l.search_id = s.id)
      union all select 'leads_total', count(*) from public.leads
      union all select 'leads_linked_to_search', count(*) from public.leads where search_id is not null
      union all select 'leads_in_copy_request', count(distinct copy_lead.lead_id) from (select unnest(lead_ids) as lead_id from public.copy_requests) copy_lead
      union all select 'leads_in_send_request', count(distinct send_lead.lead_id) from (select unnest(lead_ids) as lead_id from public.send_requests) send_lead
      union all select 'leads_with_message', count(distinct lead_id) from public.messages
      union all select 'leads_with_outbound_message', count(distinct lead_id) from public.messages where upper(sender) in ('AI', 'USER')
      union all select 'leads_with_inbound_message', count(distinct lead_id) from public.messages where upper(sender) = 'LEAD'
      union all select 'find_lead_charges_correlated', count(*) from public.usage_logs where action_name = 'FIND_LEAD' and metadata ? 'search_id'
      union all select 'copy_charges_correlated', count(*) from public.usage_logs where action_name = 'GENERATE_COPY' and metadata ? 'copy_request_id'
      union all select 'send_charges_correlated', count(*) from public.usage_logs where action_name = 'SEND_MESSAGE' and metadata ? 'send_request_id'
    ) flow_check
  ),
  'integrity_checks', (
    select jsonb_agg(to_jsonb(integrity_check) order by integrity_check.check_name)
    from (
      select 'negative_credit_balances' as check_name, count(*) as finding_count from public.profiles where credits_balance < 0
      union all select 'auth_users_without_profile', count(*) from auth.users u left join public.profiles p on p.id = u.id where p.id is null and u.deleted_at is null
      union all select 'profiles_without_auth_user', count(*) from public.profiles p left join auth.users u on u.id = p.id where u.id is null
      union all select 'searches_with_invalid_time_order', count(*) from public.lead_searches where completed_at < created_at or refunded_at < created_at
      union all select 'copy_requests_with_invalid_time_order', count(*) from public.copy_requests where completed_at < created_at
      union all select 'send_requests_with_invalid_time_order', count(*) from public.send_requests where completed_at < created_at
      union all select 'copy_request_missing_lead_references', count(*) from public.copy_requests c cross join lateral unnest(c.lead_ids) lead_id left join public.leads l on l.id = lead_id where l.id is null
      union all select 'send_request_missing_lead_references', count(*) from public.send_requests r cross join lateral unnest(r.lead_ids) lead_id left join public.leads l on l.id = lead_id where l.id is null
      union all select 'copy_request_cross_user_leads', count(*) from public.copy_requests c cross join lateral unnest(c.lead_ids) lead_id join public.leads l on l.id = lead_id where l.user_id <> c.user_id
      union all select 'send_request_cross_user_leads', count(*) from public.send_requests r cross join lateral unnest(r.lead_ids) lead_id join public.leads l on l.id = lead_id where l.user_id <> r.user_id
      union all select 'orphan_messages', count(*) from public.messages m left join public.leads l on l.id = m.lead_id where l.id is null
      union all select 'duplicate_external_message_id_groups', count(*) from (select external_message_id from public.messages where external_message_id is not null group by external_message_id having count(*) > 1) duplicates
      union all select 'duplicate_google_place_per_user_groups', count(*) from (select user_id, google_place_id from public.leads where google_place_id is not null group by user_id, google_place_id having count(*) > 1) duplicates
      union all select 'duplicate_subscription_idempotency_groups', count(*) from (select idempotency_key from public.subscription_events where idempotency_key is not null group by idempotency_key having count(*) > 1) duplicates
      union all select 'ops_stuck_searches', count(*) from public.ops_stuck_searches
      union all select 'ops_stuck_copy_requests', count(*) from public.ops_stuck_copy_requests
      union all select 'ops_orphan_charges', count(*) from public.ops_orphan_charges
      union all select 'ops_double_sends', count(*) from public.ops_double_sends
      union all select 'ops_stuck_leads', count(*) from public.ops_stuck_leads
    ) integrity_check
  )
) as profile;
