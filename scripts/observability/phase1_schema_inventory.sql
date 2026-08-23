-- Single SELECT so the Supabase CLI can execute it as a prepared statement.
-- The result contains metadata and aggregate estimates only, never row data.
select jsonb_build_object(
  'relations', (
    select coalesce(jsonb_agg(to_jsonb(relation_row) order by relation_row.schema_name, relation_row.source_name), '[]'::jsonb)
    from (
      select
        n.nspname as schema_name,
        c.relname as source_name,
        case c.relkind
          when 'r' then 'table'
          when 'p' then 'partitioned_table'
          when 'v' then 'view'
          when 'm' then 'materialized_view'
          else c.relkind::text
        end as source_kind,
        c.reltuples::bigint as estimated_rows,
        pg_total_relation_size(c.oid) as total_bytes,
        c.relrowsecurity as rls_enabled
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'auth')
        and c.relkind in ('r', 'p', 'v', 'm')
    ) relation_row
  ),
  'time_columns', (
    select coalesce(jsonb_agg(to_jsonb(time_row) order by time_row.schema_name, time_row.source_name, time_row.ordinal_position), '[]'::jsonb)
    from (
      select
        table_schema as schema_name,
        table_name as source_name,
        ordinal_position,
        column_name,
        data_type,
        is_nullable
      from information_schema.columns
      where table_schema in ('public', 'auth')
        and (
          data_type in ('timestamp with time zone', 'timestamp without time zone', 'date')
          or column_name ~* '(^|_)(date|time|timestamp|at)$'
        )
    ) time_row
  ),
  'event_columns', (
    select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.schema_name, event_row.source_name, event_row.ordinal_position), '[]'::jsonb)
    from (
      select
        table_schema as schema_name,
        table_name as source_name,
        ordinal_position,
        column_name,
        data_type,
        is_nullable
      from information_schema.columns
      where table_schema in ('public', 'auth')
        and column_name ~* '(status|state|event|action|type|source|provider|result|error)'
    ) event_row
  )
) as inventory;
