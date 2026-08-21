import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  classifyRuntimeError,
  recordOperationalEvent,
  recordOperationRun,
} from '../_shared/operational-telemetry.ts'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const jsonHeaders = { 'Content-Type': 'application/json' }

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: '[Prospectus IA] Confirme seu acesso aqui',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

// Superset of every template's props. Each component's own Props interface
// declares only the fields it needs; passing this wider object satisfies all
// of them (TypeScript accepts excess properties on a typed variable).
interface EmailTemplateProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  token: string
  email: string
  newEmail: string
  userName?: string
}

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<EmailTemplateProps>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// Configuration
const SITE_NAME = "Prospectus IA"
const ROOT_DOMAIN = "prospectus.ia.br"
const FROM_DOMAIN = "prospectus.ia.br" // Domain shown in From address (may be root or sender subdomain)

// Reauthentication delivers a 6-digit code, not a link, so it has no verify URL.
const CODE_ONLY_ACTIONS = new Set(['reauthentication'])

interface HookUser {
  email: string
  new_email?: string
  user_metadata?: { full_name?: string }
}

interface HookEmailData {
  email_action_type: string
  token: string
  token_hash: string
  token_new?: string
  token_hash_new?: string
  redirect_to?: string
}

interface HookPayload {
  user: HookUser
  email_data: HookEmailData
}

function hookError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: { http_code: status, message } }),
    { status, headers: jsonHeaders }
  )
}

// Auth signs with the Standard Webhooks scheme. The secret arrives from the
// dashboard prefixed ("v1,whsec_<base64>"); the verifier wants the base64 alone.
function verifyHookPayload(rawBody: string, req: Request, secret: string): HookPayload {
  const webhook = new Webhook(secret.replace('v1,whsec_', ''))
  return webhook.verify(rawBody, {
    'webhook-id': req.headers.get('webhook-id') ?? '',
    'webhook-timestamp': req.headers.get('webhook-timestamp') ?? '',
    'webhook-signature': req.headers.get('webhook-signature') ?? '',
  }) as HookPayload
}

// With secure email change enabled, Auth fires the hook twice — once per
// address — and only the "_new" call carries the token for the new mailbox.
// Both map to the same template, which is keyed on the bare action name.
function resolveDelivery(user: HookUser, emailData: HookEmailData) {
  const action = emailData.email_action_type

  if (action === 'email_change_new') {
    return {
      templateKey: 'email_change',
      verifyType: 'email_change',
      recipient: user.new_email || user.email,
      tokenHash: emailData.token_hash_new || emailData.token_hash,
      token: emailData.token_new || emailData.token,
    }
  }

  if (action === 'email_change_current') {
    return {
      templateKey: 'email_change',
      verifyType: 'email_change',
      recipient: user.email,
      tokenHash: emailData.token_hash,
      token: emailData.token,
    }
  }

  return {
    templateKey: action,
    verifyType: action,
    recipient: user.email,
    tokenHash: emailData.token_hash,
    token: emailData.token,
  }
}

// Auth sends token hashes, not finished links: the confirmation URL has to be
// assembled against the project's verify endpoint.
function buildConfirmationUrl(
  supabaseUrl: string,
  tokenHash: string,
  verifyType: string,
  redirectTo: string | undefined
): string {
  const url = new URL('/auth/v1/verify', supabaseUrl)
  url.searchParams.set('token', tokenHash)
  url.searchParams.set('type', verifyType)
  if (redirectTo) {
    url.searchParams.set('redirect_to', redirectTo)
  }
  return url.toString()
}

async function handleWebhook(req: Request): Promise<Response> {
  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!hookSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error('[auth-email-hook] config_missing code=SERVER_MISCONFIGURED')
    return hookError(500, 'Server configuration error')
  }

  // The raw body is the signed content, so it must be read before parsing.
  const rawBody = await req.text()

  let payload: HookPayload
  try {
    payload = verifyHookPayload(rawBody, req, hookSecret)
  } catch {
    console.error('[auth-email-hook] verification_failed code=INVALID_SIGNATURE')
    return hookError(401, 'Invalid signature')
  }

  if (!payload?.user?.email || !payload?.email_data?.email_action_type) {
    console.error('[auth-email-hook] event_rejected code=INVALID_PAYLOAD')
    return hookError(400, 'Invalid webhook payload')
  }

  const delivery = resolveDelivery(payload.user, payload.email_data)
  console.log(
    `[auth-email-hook] event_received type=${EMAIL_TEMPLATES[delivery.templateKey] ? delivery.templateKey : 'unknown'}`
  )

  const EmailTemplate = EMAIL_TEMPLATES[delivery.templateKey]
  if (!EmailTemplate) {
    console.error('[auth-email-hook] event_rejected code=UNKNOWN_EMAIL_TYPE')
    return hookError(400, `Unknown email type: ${payload.email_data.email_action_type}`)
  }

  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: `https://${ROOT_DOMAIN}`,
    recipient: delivery.recipient,
    confirmationUrl: CODE_ONLY_ACTIONS.has(delivery.templateKey)
      ? ''
      : buildConfirmationUrl(
          supabaseUrl,
          delivery.tokenHash,
          delivery.verifyType,
          payload.email_data.redirect_to
        ),
    token: delivery.token,
    email: payload.user.email,
    newEmail: payload.user.new_email || '',
    userName: payload.user.user_metadata?.full_name || '',
  }

  // Render React Email to HTML and plain text
  const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
  const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
    plainText: true,
  })

  // Enqueue email for async processing by the dispatcher (process-email-queue).
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const messageId = crypto.randomUUID()

  // Log pending BEFORE enqueue so we have a record even if enqueue crashes
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: delivery.templateKey,
    recipient_email: delivery.recipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'auth_emails',
    payload: {
      message_id: messageId,
      to: delivery.recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      subject: EMAIL_SUBJECTS[delivery.templateKey] || 'Notification',
      html,
      text,
      purpose: 'transactional',
      label: delivery.templateKey,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('[auth-email-hook] enqueue_failed code=DATABASE_ERROR')
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: delivery.templateKey,
      recipient_email: delivery.recipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    await Promise.all([
      recordOperationalEvent(supabase, {
        eventName: 'email.delivery_failed',
        source: 'edge',
        correlationId: messageId,
        requestId: messageId,
        operationType: 'email_delivery',
        entityType: 'email_message',
        entityId: messageId,
        status: 'failed',
        errorCode: 'QUEUE_ENQUEUE_FAILED',
        attributes: {
          action: 'enqueue',
          operation_stage: delivery.templateKey,
          provider: 'resend',
          queue_name: 'auth_emails',
        },
      }),
      recordOperationRun(supabase, {
        correlationId: messageId,
        requestId: messageId,
        operationType: 'email_delivery',
        status: 'failed',
        source: 'edge',
        errorCode: 'QUEUE_ENQUEUE_FAILED',
        attributes: { provider: 'resend', queue_name: 'auth_emails' },
      }),
    ])
    return hookError(500, 'Failed to enqueue email')
  }

  await Promise.all([
    recordOperationalEvent(supabase, {
      eventName: 'email.delivery_queued',
      source: 'edge',
      correlationId: messageId,
      requestId: messageId,
      operationType: 'email_delivery',
      entityType: 'email_message',
      entityId: messageId,
      status: 'queued',
      attributes: {
        action: 'enqueue',
        operation_stage: delivery.templateKey,
        provider: 'resend',
        queue_name: 'auth_emails',
      },
    }),
    recordOperationRun(supabase, {
      correlationId: messageId,
      requestId: messageId,
      operationType: 'email_delivery',
      status: 'queued',
      source: 'edge',
      attributes: { provider: 'resend', queue_name: 'auth_emails' },
    }),
  ])
  console.log(`[auth-email-hook] enqueue_completed type=${delivery.templateKey}`)

  // Auth treats any `error` key in the body as a rejection, so success is bare.
  return new Response(JSON.stringify({}), { status: 200, headers: jsonHeaders })
}

export async function handler(req: Request): Promise<Response> {
  try {
    return await handleWebhook(req)
  } catch (error) {
    const errorCode = classifyRuntimeError(error)
    console.error(`[auth-email-hook] handler_failed code=${errorCode}`)
    return hookError(500, `Internal server error (${errorCode})`)
  }
}
