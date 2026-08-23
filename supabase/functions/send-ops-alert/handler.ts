import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/email-client.ts'

const FROM = 'Prospectus IA — Alertas <ops@prospectus.ia.br>'

interface AlertRequestBody {
  subject?: unknown
  html?: unknown
  text?: unknown
  to?: unknown
  template?: unknown
}

export async function handler(req: Request): Promise<Response> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('[send-ops-alert] missing_env_vars')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const providedToken = req.headers.get('X-Ops-Alert-Token')
  if (!providedToken) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // No Supabase JWT/service_role key travels over the wire for this call —
  // Postgres has no Deno env, so cron authenticates with a shared token
  // (vault: ops_alert_shared_token) instead. Validated via RPC so vault.*
  // is never exposed through PostgREST.
  const { data: tokenValid, error: tokenError } = await supabase.rpc('verify_ops_alert_token', {
    _token: providedToken,
  })
  if (tokenError || tokenValid !== true) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: AlertRequestBody
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const subject = typeof body.subject === 'string' ? body.subject : null
  const html = typeof body.html === 'string' ? body.html : null
  const text = typeof body.text === 'string' ? body.text : undefined
  const to = Array.isArray(body.to)
    ? body.to.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  const template = typeof body.template === 'string' ? body.template : 'ops_alert'

  if (!subject || !html || to.length === 0) {
    return new Response(
      JSON.stringify({ error: 'subject, html and a non-empty to[] are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const results: Array<{ to: string; ok: boolean }> = []

  for (const recipient of to) {
    try {
      await sendEmail(
        { to: recipient, from: FROM, subject, html, text },
        { apiKey, endpoint: Deno.env.get('EMAIL_API_URL') }
      )
      await supabase.from('email_send_log').insert({
        template_name: template,
        recipient_email: recipient,
        status: 'sent',
      })
      results.push({ to: recipient, ok: true })
    } catch (error) {
      console.error(`[send-ops-alert] delivery_failed template=${template}`)
      await supabase.from('email_send_log').insert({
        template_name: template,
        recipient_email: recipient,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'unknown_error',
      })
      results.push({ to: recipient, ok: false })
    }
  }

  const allOk = results.every((r) => r.ok)
  return new Response(
    JSON.stringify({ results }),
    { status: allOk ? 200 : 502, headers: { 'Content-Type': 'application/json' } }
  )
}
