-- Adds "Indústria/Fábrica" to the niche catalogue (issue #2). Idempotent
-- against production, same pattern as 20260817230000_seed_reference_data.sql:
-- ON CONFLICT (name), no explicit id -- nothing references niche_options.id
-- by FK, unlike plans.id, so a random id per environment is fine here.
INSERT INTO public.niche_options (name, lead_category, sort_order, is_active) VALUES
  ('Indústria/Fábrica', 'industrial_company', 16, true)
ON CONFLICT (name) DO NOTHING;
