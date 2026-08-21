CREATE TABLE public.admin_impersonation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  target_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_impersonation_logs_admin ON public.admin_impersonation_logs(admin_id, started_at DESC);
CREATE INDEX idx_admin_impersonation_logs_target ON public.admin_impersonation_logs(target_user_id, started_at DESC);

ALTER TABLE public.admin_impersonation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read impersonation logs"
ON public.admin_impersonation_logs
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));