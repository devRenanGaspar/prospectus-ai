-- ============================================================================
-- Classe de defeito: "produção tem, as migrations não"
-- ============================================================================
-- Um banco construído só a partir de supabase/migrations/ não conseguia
-- executar NENHUMA ação paga do produto: request_send, request_copy e
-- request_find_leads leem credit_costs e levantam ACTION_NOT_FOUND quando a
-- linha não existe, e a única linha semeada em todas as 94 migrations era
-- FIND_LEAD_REFUND (20260611121224), que por sinal não é lida por ninguém --
-- refund_unused_search_credits usa o preço de FIND_LEAD.
--
-- Enumeração da classe, medida contra produção e não presumida:
--
--   tabela             prod   nas migrations   lacuna
--   credit_costs          5   1                4 linhas
--   plans                 4   0                4 linhas
--   niche_options        15   3 (outros nomes) 15 linhas + 3 legados a remover
--   app_settings          1   1                ok
--   credit_packages       0   0                ok (vazia em produção)
--   webhook_configs       6   0                config de ambiente, ver abaixo
--   triggers email_queue  2   0                config de ambiente, ver abaixo
--
-- DUAS EXCLUSÕES DELIBERADAS, pela mesma razão:
--
--   * webhook_configs guarda URLs do n8n específicas do ambiente.
--   * Os triggers email_queue_wake_auth / email_queue_wake_transactional
--     existem em produção sem nenhuma migration os criar, mas a função que
--     eles chamam tem a URL do projeto de produção fixa no corpo
--     (20260814180000:114). Recriá-los faria qualquer ambiente novo disparar
--     requests contra a produção, com um token do vault local que a produção
--     não reconhece. Tornar essa função ambiente-consciente mexe num caminho
--     de e-mail vivo e fica fora desta migration.
--
-- Ambas estão documentadas em docs/environment-variables.md como
-- infraestrutura que um ambiente novo precisa configurar. Semear URL de
-- produção numa migration é o mesmo defeito das migrations que já hardcodam o
-- project ref.
--
-- Idempotente por construção: contra produção isto é um no-op verificável
-- (todas as linhas já existem), e o DELETE dos nichos legados não encontra
-- nada porque produção nunca os teve.
-- ============================================================================

-- ── credit_costs: os 4 que faltavam ─────────────────────────────────────────
-- Valores lidos de produção no momento de escrever esta migration.
INSERT INTO public.credit_costs (action_name, cost) VALUES
  ('FIND_LEAD', 1),
  ('GENERATE_COPY', 3),
  ('SEND_MESSAGE', 1),
  ('AI_CONVERSATION_TURN', 1)
ON CONFLICT (action_name) DO NOTHING;

-- ── plans ───────────────────────────────────────────────────────────────────
-- UUIDs fixos, iguais aos de produção: profiles.plan_id aponta para eles, e um
-- gen_random_uuid() aqui faria cada ambiente ter ids diferentes para o mesmo
-- plano.
INSERT INTO public.plans (id, name, price_monthly, credits_included, features, is_active) VALUES
  ('35bb2a71-6fe1-459e-85a7-541fd8898051', 'Trial',     0.00,   100, '[]'::jsonb, true),
  ('25ec766f-7459-438d-af9b-712b237701e6', 'Básico',   97.00,   800, '[]'::jsonb, true),
  ('3842a765-3ba8-4ed4-9473-281d52b48c1b', 'Avançado', 197.00, 2000, '[]'::jsonb, true),
  ('af9a99ed-aa61-4b31-9c69-f29e6a9c804f', 'Premium',  397.00, 5000, '[]'::jsonb, true)
ON CONFLICT (id) DO NOTHING;

-- ── niche_options ───────────────────────────────────────────────────────────
-- O catálogo real tem 15 nichos. A migration 20260317211908 semeia três nomes
-- ('Médicos', 'Salão de Beleza', 'Advogados') que foram substituídos em
-- produção e não existem mais lá, então um replay novo ficava com um catálogo
-- que nenhum ambiente real usa.
INSERT INTO public.niche_options (name, sort_order, is_active) VALUES
  ('Agências de Turismo',                  0,  true),
  ('Advogado/Escritório de Advocacia',     1,  true),
  ('Beleza/Estética/Barbearia',            2,  true),
  ('Concessionárias de Automóveis',        3,  true),
  ('Contador/Escritório de Contabilidade', 4,  true),
  ('Escolas/Universidades',                5,  true),
  ('Imobiliária/Corretor de Imóveis',      6,  true),
  ('Lojas',                                7,  true),
  ('Pizzarias',                            8,  true),
  ('Restaurante/Bar/Café',                 10, true),
  ('Saúde Médico',                         11, true),
  ('Saúde Odontologia',                    11, true),
  ('Saúde Veterinária',                    13, true),
  ('Seguradoras Vida/Saúde e Outros',      14, true),
  ('Nutricionistas',                       15, true)
ON CONFLICT (name) DO NOTHING;

-- No-op em produção (os três já não existem lá); num replay novo converge o
-- catálogo para os mesmos 15.
DELETE FROM public.niche_options
WHERE name IN ('Médicos', 'Salão de Beleza', 'Advogados');
