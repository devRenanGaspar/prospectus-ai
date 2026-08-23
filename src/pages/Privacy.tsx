import { Link } from "react-router-dom";
import { ArrowLeft, Zap, Shield } from "lucide-react";
import SEO from "@/components/SEO";

const Privacy = () => (
  <>
    <SEO
      title="Política de Privacidade"
      description="Política de Privacidade da plataforma Prospectus — Gaspar Ads (Comunidade MAIA). Saiba como seus dados são coletados, utilizados e protegidos."
    />
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-soft">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">Prospectus</span>
          </Link>
          <Link
            to="/login"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao login
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-muted-foreground mb-10">
          Última atualização: 11 de março de 2026
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground/90 leading-relaxed">
          {/* 1 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">1. Introdução</h2>
            <p>
              A presente Política de Privacidade descreve como a <strong>Gaspar Ads</strong> (Comunidade
              MAIA), inscrita no CNPJ 38.111.390/0001-40, controladora da plataforma{" "}
              <strong>Prospectus</strong>, doravante denominada "Controlador", coleta, utiliza,
              armazena e protege os dados pessoais dos usuários da Plataforma, em conformidade com a Lei
              Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e demais legislações
              aplicáveis.
            </p>
            <p>
              Ao utilizar a Plataforma, você declara ter lido e concordado com os termos desta
              Política. Caso não concorde, recomendamos que não utilize nossos serviços.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">2. Dados Pessoais Coletados</h2>
            <p>Coletamos as seguintes categorias de dados:</p>
            <h3 className="text-lg font-medium text-foreground mt-4">2.1 Dados fornecidos pelo usuário</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Nome completo</li>
              <li>Endereço de e-mail</li>
              <li>Senha (armazenada de forma criptografada)</li>
              <li>Nome da agência</li>
              <li>Número de WhatsApp</li>
              <li>Informações de contexto de negócio (persona, ICP, FAQ, qualificação)</li>
              <li>Prompts e textos de abordagem comercial</li>
            </ul>
            <h3 className="text-lg font-medium text-foreground mt-4">2.2 Dados coletados automaticamente</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Dados de navegação (endereço IP, tipo de navegador, páginas acessadas)</li>
              <li>Registros de uso da Plataforma (logs de ações e consumo de créditos)</li>
              <li>
                Cookies necessários, medição de terceiros no site público e telemetria interna do
                aplicativo (veja seção 7)
              </li>
            </ul>
            <h3 className="text-lg font-medium text-foreground mt-4">2.3 Dados obtidos de terceiros</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Dados de leads comerciais provenientes de fontes públicas (Google Maps, sites
                institucionais), incluindo nome da empresa, telefone, endereço, CNPJ, website e
                redes sociais
              </li>
              <li>
                Dados de disponibilidade do Google Calendar (somente leitura — escopo{" "}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded">calendar.readonly</code>),
                quando o usuário autorizar a integração, para consulta de disponibilidade da agenda
                (períodos ocupado/livre) via Google Calendar FreeBusy, sem acessar o conteúdo dos eventos
              </li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">3. Finalidades do Tratamento</h2>
            <p>Utilizamos seus dados pessoais para as seguintes finalidades:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Criação e gerenciamento de conta na Plataforma</li>
              <li>Prospecção automatizada de leads comerciais via inteligência artificial</li>
              <li>Geração de mensagens de abordagem comercial personalizadas por IA</li>
              <li>Envio de mensagens via integração com WhatsApp</li>
              <li>Consulta de disponibilidade via Google Calendar</li>
              <li>Gestão de créditos e faturamento</li>
              <li>Comunicações sobre a Plataforma (atualizações, notificações de serviço)</li>
              <li>Melhoria e personalização dos serviços</li>
              <li>Cumprimento de obrigações legais e regulatórias</li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">4. Base Legal para o Tratamento</h2>
            <p>O tratamento dos dados pessoais é realizado com fundamento nas seguintes bases legais da LGPD (art. 7º):</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Consentimento</strong> (art. 7º, I): para integrações com serviços de
                terceiros (Google Calendar, WhatsApp), concedido de forma livre, informada e inequívoca
              </li>
              <li>
                <strong>Execução de contrato</strong> (art. 7º, V): para prestação dos serviços
                contratados na Plataforma
              </li>
              <li>
                <strong>Legítimo interesse</strong> (art. 7º, IX): para melhoria dos serviços e
                comunicações relevantes
              </li>
              <li>
                <strong>Cumprimento de obrigação legal</strong> (art. 7º, II): para atendimento a
                exigências fiscais e regulatórias
              </li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">5. Compartilhamento de Dados</h2>
            <p>Seus dados poderão ser compartilhados com:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Google (Google Calendar API)</strong> — exclusivamente para consulta de
                disponibilidade da agenda (períodos ocupado/livre) via FreeBusy, mediante autorização
                expressa do usuário. Utilizamos o escopo restrito{" "}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded">calendar.readonly</code>.
                Não armazenamos eventos do Google Calendar; os dados de disponibilidade são usados
                apenas para verificar horários ocupados/livres e sugerir horários de reunião.
              </li>
              <li>
                <strong>Plataformas de automação (N8N/webhooks)</strong> — para execução dos fluxos
                de prospecção e envio de mensagens configurados pelo próprio usuário.
              </li>
              <li>
                <strong>Provedores de infraestrutura</strong> — serviços de hospedagem, banco de
                dados e processamento de IA, todos com cláusulas contratuais de proteção de dados.
              </li>
            </ul>
            <p>
              Não vendemos, alugamos ou comercializamos dados pessoais com terceiros para
              finalidades de marketing.
            </p>
          </section>

          {/* 5.1 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              5.1 Dados do Google Calendar e conformidade com a política do Google
            </h2>
            <p>
              Google (Google Calendar API) — exclusivamente para consulta de disponibilidade da
              agenda (períodos ocupado/livre) via FreeBusy, mediante autorização expressa do
              usuário. Utilizamos o escopo{" "}
              <code className="text-sm bg-muted px-1.5 py-0.5 rounded">calendar.readonly</code>.
              Não armazenamos eventos do Google Calendar; os dados de disponibilidade são usados
              apenas para verificar horários ocupados/livres e sugerir horários de reunião.
            </p>
            <div className="border border-primary/20 bg-primary/5 rounded-lg p-4 space-y-2 mt-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm text-foreground">Limited Use Disclosure</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The use of raw or derived user data received from Workspace APIs will adhere to the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
            </div>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">6. Transferência Internacional de Dados</h2>
            <p>
              Alguns de nossos provedores de infraestrutura podem estar localizados fora do Brasil.
              Nesses casos, asseguramos que a transferência ocorra em conformidade com a LGPD,
              mediante cláusulas contratuais padrão ou mecanismos equivalentes de proteção.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">7. Cookies e Tecnologias Similares</h2>
            <p>
              Usamos duas categorias distintas, e elas se aplicam a partes diferentes do serviço.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">7.1 Cookies necessários</h3>
            <p>
              Dentro do aplicativo (após o login), usamos apenas cookies estritamente necessários
              para o funcionamento do serviço: autenticação de sessão e preferências do usuário.
              Sem eles a Plataforma não opera.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">
              7.2 Medição de terceiros no site público
            </h3>
            <p>
              Nas páginas públicas (a página inicial e as páginas de apresentação, acessíveis sem
              login) carregamos o <strong>Google Tag Manager</strong>, operado pelo Google, para
              medir o desempenho das nossas campanhas de marketing. Ele é um recurso de terceiros e{" "}
              <strong>não é estritamente necessário</strong> para o funcionamento do serviço, e é
              carregado assim que a página é aberta, antes de qualquer manifestação sua.
            </p>
            <p>
              Você pode recusá-lo bloqueando cookies de terceiros ou scripts do domínio
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">googletagmanager.com</code>
              nas configurações do seu navegador, ou usando uma extensão de bloqueio. Isso não
              afeta o uso da Plataforma depois do login.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">
              7.3 Telemetria interna do aplicativo
            </h3>
            <p>
              Dentro do aplicativo coletamos métricas próprias de navegação e desempenho, sem
              conteúdo de mensagens e sem dados de leads. Diferente da medição descrita em 7.2,
              esta você controla: o interruptor{" "}
              <strong>“Telemetria de uso dentro do aplicativo”</strong> em Configurações &gt;
              Privacidade a desativa, e nada é enviado enquanto a sua escolha não estiver carregada.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">8. Direitos do Titular</h2>
            <p>
              Em conformidade com a LGPD (art. 18), você possui os seguintes direitos em relação
              aos seus dados pessoais:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Confirmação da existência de tratamento</li>
              <li>Acesso aos dados pessoais</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários</li>
              <li>Portabilidade dos dados (exportação em formato estruturado)</li>
              <li>Eliminação dos dados tratados com base no consentimento</li>
              <li>Revogação do consentimento a qualquer momento</li>
              <li>Oposição ao tratamento quando baseado em legítimo interesse</li>
            </ul>
            <p>
              A exportação em Configurações &gt; Privacidade entrega, em JSON, o seu perfil, os
              seus leads, buscas, cobranças, assinaturas, comentários e o histórico de mensagens
              trocadas com os leads. O <strong>texto</strong> escrito pelo lead não vai no arquivo:
              é dado de um terceiro que não consentiu com essa exportação, e a portabilidade
              prevista na LGPD alcança os dados do titular. Os metadados de cada mensagem — data,
              remetente e o lead correspondente — estão incluídos.
            </p>
            <p>
              Para exercer seus direitos, utilize as funcionalidades disponíveis na seção
              "Configurações" da Plataforma (exportação e exclusão de dados) ou entre em contato
              com nosso Encarregado de Dados (DPO) pelo e-mail indicado na seção 11.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">9. Retenção de Dados</h2>
            <p>
              Os dados pessoais serão armazenados pelo tempo necessário para o cumprimento das
              finalidades para as quais foram coletados, incluindo obrigações legais, contratuais
              e regulatórias. Após solicitação de exclusão de conta, os dados serão removidos em
              até 30 (trinta) dias, salvo obrigação legal de retenção.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">10. Segurança dos Dados</h2>
            <p>
              Adotamos medidas técnicas e organizacionais apropriadas para proteger seus dados
              pessoais contra acesso não autorizado, destruição, perda, alteração ou qualquer
              forma de tratamento inadequado, incluindo:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Criptografia de dados em trânsito (TLS/SSL) e em repouso</li>
              <li>Controles de acesso baseados em função (RBAC)</li>
              <li>Políticas de segurança em nível de linha (Row-Level Security)</li>
              <li>Armazenamento seguro de senhas com algoritmos de hash</li>
              <li>Monitoramento contínuo de acessos e atividades</li>
            </ul>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">11. Contato do Encarregado (DPO)</h2>
            <p>
              Para dúvidas, solicitações ou reclamações relacionadas ao tratamento de dados
              pessoais, entre em contato com nosso Encarregado de Proteção de Dados:
            </p>
            <div className="bg-muted/50 border border-border rounded-lg p-4 mt-3 space-y-1">
              <p><strong>Controlador:</strong> Gaspar Ads (Comunidade MAIA)</p>
              <p><strong>CNPJ:</strong> 38.111.390/0001-40</p>
              <p><strong>Canal do DPO:</strong> disponível na área de suporte da versão oficial.</p>
            </div>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">12. Alterações nesta Política</h2>
            <p>
              Reservamo-nos o direito de atualizar esta Política de Privacidade a qualquer momento.
              As alterações serão comunicadas por meio da Plataforma ou por e-mail. Recomendamos a
              consulta periódica desta página. A data da última atualização está indicada no início
              deste documento.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-16">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Gaspar Ads (Comunidade MAIA). Todos os direitos reservados.
        </div>
      </footer>
    </div>
  </>
);

export default Privacy;
