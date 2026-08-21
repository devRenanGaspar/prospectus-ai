-- Tabela singleton de configurações da aplicação
CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  maintenance_mode text NOT NULL DEFAULT 'off' CHECK (maintenance_mode IN ('off','banner','blocked')),
  maintenance_message text,
  maintenance_started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.app_settings (id) VALUES (true);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler (para exibir banner/bloqueio)
CREATE POLICY "Authenticated users can read app_settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Apenas admins podem atualizar
CREATE POLICY "Admins can update app_settings"
  ON public.app_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime
ALTER TABLE public.app_settings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;