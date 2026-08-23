-- ============================================================================
-- Stores the LGPD consents the Settings screen collects.
--
-- Until now the three consent switches in Settings had no `onCheckedChange`:
-- the user toggled "Comunicações de marketing", the switch moved, and nothing
-- was written anywhere. A consent control that records nothing is worse than
-- no control, because it looks like a choice was registered.
--
-- jsonb rather than one boolean column per consent: the list of consents
-- changes with the product, and each change would otherwise be a migration.
--
-- `lgpd_consents_updated_at` is not decoration. Art. 8 §1 of the LGPD puts the
-- burden of *demonstrating* consent on the controller, and a boolean with no
-- timestamp demonstrates nothing.
--
-- Verified against production inside a rolled-back transaction before being
-- applied: an `authenticated` caller can write both columns for their own row
-- (RLS allows it) and `prevent_sensitive_profile_update` does not block them --
-- that trigger only guards `credits_balance` and `plan_id`.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lgpd_consents jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lgpd_consents_updated_at timestamptz;

COMMENT ON COLUMN public.profiles.lgpd_consents IS
  'LGPD consents the user has given, keyed by consent id (marketing, analytics). Absent key = never answered; the application treats that as granted for analytics, matching what the privacy policy discloses. Processing for prospecting is not here: it is contract execution, not consent.';

COMMENT ON COLUMN public.profiles.lgpd_consents_updated_at IS
  'When lgpd_consents last changed. Required to demonstrate consent under LGPD art. 8 §1.';
