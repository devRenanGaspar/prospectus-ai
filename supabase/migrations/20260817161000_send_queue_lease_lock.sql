-- ============================================================================
-- Lock the send queue: get_send_queue_batch() had no FOR UPDATE and no
-- transition, so two overlapping polls (retry, overlapping cron windows)
-- could return the same lead twice -- a real double-send, cobrado uma vez,
-- entregue duas.
--
-- Two things had to be true at once, both found in review, not just one:
--
-- 1. `SELECT DISTINCT ON` and `FOR UPDATE` cannot appear in the same query
--    block (verified: Postgres raises 0A000 "FOR UPDATE is not allowed with
--    DISTINCT clause"). The one-lead-per-account ranking has to happen in a
--    CTE that carries no locking clause; the locking happens in a separate
--    CTE against the ids that ranking produced.
--
-- 2. A transient status with no lease is worse than the bug it fixes: if the
--    worker crashes or times out after claiming a lead but before sending
--    it, a status with no expiry leaves that lead permanently invisible to
--    the Kanban (KANBAN_COLUMNS has no such status) and to ops_stuck_leads'
--    reasoning about what "stuck" means. So the claim is a *lease*
--    (send_claimed_at), not a status change: the lead stays SEND_PENDING,
--    and a lease older than 10 minutes -- well past how long a send is
--    expected to take -- is eligible to be claimed again.
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS send_claimed_at timestamptz NULL;

CREATE OR REPLACE FUNCTION public.get_send_queue_batch()
RETURNS TABLE(
  out_lead_id uuid,
  out_user_id uuid,
  out_lead jsonb,
  out_agency jsonb,
  out_context jsonb,
  out_phone text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate_ids AS (
    -- Ranking only: one lead per account, oldest first. No locking clause
    -- here -- that's what DISTINCT ON forbids.
    SELECT DISTINCT ON (l.user_id) l.id
    FROM public.leads l
    WHERE l.status = 'SEND_PENDING'
      AND l.user_id IS NOT NULL
      AND (l.send_claimed_at IS NULL OR l.send_claimed_at < now() - interval '10 minutes')
    ORDER BY l.user_id, l.updated_at ASC
  ),
  locked AS (
    -- Try to lock exactly those ids. A concurrent call racing on the same
    -- rows finds them already locked and skips them -- returns nothing for
    -- those ids -- instead of blocking or returning the same lead twice.
    SELECT l.id
    FROM public.leads l
    WHERE l.id IN (SELECT id FROM candidate_ids)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    -- Stamp the lease on exactly what this call actually locked.
    UPDATE public.leads l
    SET send_claimed_at = now()
    WHERE l.id IN (SELECT id FROM locked)
    RETURNING l.*
  )
  SELECT
    c.id AS out_lead_id,
    c.user_id AS out_user_id,
    to_jsonb(c) AS out_lead,
    jsonb_build_object(
      'agency_name', COALESCE(p.agency_name, ''),
      'business_type', COALESCE(p.business_type, 'trafego_pago'),
      'owner_name', COALESCE(p.owner_name, ''),
      'sdr_name', COALESCE(p.sdr_name, 'MarIA')
    ) AS out_agency,
    jsonb_build_object(
      'persona', p.context_persona,
      'icp', p.context_icp,
      'qualification', p.context_qualification
    ) AS out_context,
    COALESCE(p.whatsapp_number, '') AS out_phone
  FROM claimed c
  LEFT JOIN public.profiles p ON p.id = c.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_send_queue_batch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_send_queue_batch() TO service_role;

-- Surface the lease on the existing stuck-lead signal, so a SEND_PENDING
-- lead that keeps getting claimed and never actually sent is visible for
-- the reason it's stuck, not just that it is.
-- CREATE OR REPLACE VIEW can only append columns, not insert them before
-- existing ones -- the new columns go after sem_copy, not before it.
CREATE OR REPLACE VIEW public.ops_stuck_leads
WITH (security_invoker = true) AS
SELECT
  l.id          AS lead_id,
  l.user_id,
  l.status,
  l.updated_at,
  now() - l.updated_at AS parado_ha,
  (l.ai_generated_copy IS NULL OR length(trim(l.ai_generated_copy)) = 0) AS sem_copy,
  l.send_claimed_at,
  (l.status = 'SEND_PENDING' AND l.send_claimed_at IS NOT NULL) AS send_claimed_but_not_sent
FROM public.leads l
WHERE l.status IN ('COPY_PENDING', 'SEND_PENDING')
  AND l.updated_at < now() - interval '1 hour';

REVOKE ALL ON public.ops_stuck_leads FROM anon;
