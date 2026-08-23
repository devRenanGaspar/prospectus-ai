-- Validate webhook URLs to prevent SSRF
CREATE OR REPLACE FUNCTION public.validate_webhook_url(_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _host text;
BEGIN
  IF _url IS NULL OR length(_url) = 0 THEN
    RETURN false;
  END IF;

  -- Must be HTTPS
  IF _url !~* '^https://' THEN
    RETURN false;
  END IF;

  -- Extract hostname (between :// and next / or : or end)
  _host := lower(substring(_url from '^https://([^/:?#]+)'));

  IF _host IS NULL OR length(_host) = 0 THEN
    RETURN false;
  END IF;

  -- Block localhost / loopback
  IF _host IN ('localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]') THEN
    RETURN false;
  END IF;

  -- Block private IPv4 ranges
  IF _host ~ '^10\.' THEN RETURN false; END IF;
  IF _host ~ '^192\.168\.' THEN RETURN false; END IF;
  IF _host ~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.' THEN RETURN false; END IF;
  IF _host ~ '^127\.' THEN RETURN false; END IF;
  IF _host ~ '^169\.254\.' THEN RETURN false; END IF;
  IF _host ~ '^0\.' THEN RETURN false; END IF;

  -- Block bare IPv6 brackets containing loopback / link-local
  IF _host ~ '^\[(::1|fc|fd|fe80)' THEN RETURN false; END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.webhook_configs_validate_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_webhook_url(NEW.url) THEN
    RAISE EXCEPTION 'Invalid webhook URL: must be HTTPS and not a private/loopback/link-local address';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_configs_validate_url ON public.webhook_configs;
CREATE TRIGGER trg_webhook_configs_validate_url
BEFORE INSERT OR UPDATE OF url ON public.webhook_configs
FOR EACH ROW EXECUTE FUNCTION public.webhook_configs_validate_url();