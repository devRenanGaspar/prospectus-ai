// Signs a Standard Webhooks request the way Supabase Auth does and posts it to
// a locally served auth-email-hook, so the signature path and every template can
// be exercised without touching the project's Auth settings.
//
//   supabase functions serve auth-email-hook --no-verify-jwt
//   SEND_EMAIL_HOOK_SECRET='v1,whsec_...' node scripts/send-auth-hook.mjs signup
//
// Pass an action type as the first argument. Defaults to signup.

import { createHmac, randomUUID } from 'node:crypto'

const ACTION = process.argv[2] ?? 'signup'
const TARGET =
  process.env.HOOK_URL ?? 'http://127.0.0.1:54321/functions/v1/auth-email-hook'
const SECRET = process.env.SEND_EMAIL_HOOK_SECRET

if (!SECRET) {
  console.error('SEND_EMAIL_HOOK_SECRET is required')
  process.exit(1)
}

const payload = JSON.stringify({
  user: {
    id: randomUUID(),
    email: process.env.HOOK_RECIPIENT ?? 'dev@example.test',
    new_email: 'novo@example.test',
    user_metadata: { full_name: 'Teste Local' },
  },
  email_data: {
    email_action_type: ACTION,
    token: '123456',
    token_hash: 'hash_current',
    token_new: '654321',
    token_hash_new: 'hash_new',
    redirect_to: 'https://prospectus.ia.br/',
  },
})

const id = `msg_${randomUUID()}`
const timestamp = Math.floor(Date.now() / 1000).toString()
const key = Buffer.from(SECRET.replace('v1,whsec_', ''), 'base64')
const signature = createHmac('sha256', key)
  .update(`${id}.${timestamp}.${payload}`)
  .digest('base64')

const response = await fetch(TARGET, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${signature}`,
  },
  body: payload,
})

console.log(`${response.status} ${await response.text()}`)
process.exit(response.ok ? 0 : 1)
