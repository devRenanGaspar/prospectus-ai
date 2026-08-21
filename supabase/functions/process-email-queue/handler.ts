import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/email-client.ts'
import {
  isUuid,
  recordOperationalEvent,
  recordOperationRun,
} from '../_shared/operational-telemetry.ts'

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60
const EMAIL_QUEUES = ['auth_emails', 'transactional_emails'] as const

// Check if an error is a rate-limit (429) response.
// EmailApiError always carries status; the message fallback covers transport
// layers that surface the code only in the text.
function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

// Extract Retry-After seconds from a structured EmailApiError, or default to 60s.
function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

export async function handler(req: Request): Promise<Response> {
  const invocationStartedAt = Date.now()
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const providedToken = req.headers.get('X-Email-Queue-Token')
  if (!providedToken) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // No Supabase JWT/service_role key travels over the wire for this call —
  // Postgres has no Deno env, so cron authenticates with a shared token
  // (vault: email_queue_shared_token) instead. Validated via RPC so vault.*
  // is never exposed through PostgREST. Same pattern as send-ops-alert.
  const { data: tokenValid, error: tokenError } = await supabase.rpc('verify_email_queue_token', {
    _token: providedToken,
  })
  if (tokenError || tokenValid !== true) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // 1. Check rate-limit cooldown and read queue config
  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    await recordOperationalEvent(supabase, {
      eventName: 'queue.processing_skipped',
      source: 'scheduler',
      status: 'queued',
      errorCode: 'RATE_LIMITED',
      attributes: { action: 'process', provider: 'resend' },
    })
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  // 2. Process auth_emails first (priority), then transactional_emails
  for (const queue of EMAIL_QUEUES) {
    const dlq = `${queue}_dlq`
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error(`[process-email-queue] batch_read_failed queue=${queue} code=DATABASE_ERROR`)
      await recordOperationalEvent(supabase, {
        eventName: 'queue.read_failed',
        source: 'scheduler',
        status: 'failed',
        errorCode: 'DATABASE_ERROR',
        attributes: { action: 'read', queue_name: queue },
      })
      continue
    }

    if (!messages?.length) continue

    await recordOperationalEvent(supabase, {
      eventName: 'queue.batch_claimed',
      source: 'scheduler',
      status: 'processing',
      attributes: {
        action: 'process',
        queue_name: queue,
        batch_size: messages.length,
      },
    })
    let queueProcessed = 0

    // Retry budget is based on real send failures, not pgmq read_ct.
    // read_ct increments for every message in a claimed batch, including
    // messages not attempted when a 429 stops processing early.
    const messageIds = Array.from(
      new Set(
        messages
          .map((msg: { message?: { message_id?: unknown } }) =>
            msg?.message?.message_id && typeof msg.message.message_id === 'string'
              ? msg.message.message_id
              : null
          )
          .filter((id: string | null): id is string => Boolean(id))
      )
    )
    const failedAttemptsByMessageId = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: failedRows, error: failedRowsError } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      if (failedRowsError) {
        console.error(`[process-email-queue] attempt_count_failed queue=${queue} code=DATABASE_ERROR`)
      } else {
        for (const row of failedRows ?? []) {
          const messageId = row?.message_id
          if (typeof messageId !== 'string' || !messageId) continue
          failedAttemptsByMessageId.set(
            messageId,
            (failedAttemptsByMessageId.get(messageId) ?? 0) + 1
          )
        }
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const payload = msg.message
      const failedAttempts =
        payload?.message_id && typeof payload.message_id === 'string'
          ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
          : 0
      const messageCorrelationId = isUuid(payload?.message_id)
        ? payload.message_id
        : null
      const attempt = failedAttempts + 1
      const recordDeliveryEvent = (
        eventName: string,
        status: string,
        errorCode: string | null = null,
        durationMs: number | null = null,
      ) => recordOperationalEvent(supabase, {
        eventName,
        source: 'scheduler',
        correlationId: messageCorrelationId,
        requestId: messageCorrelationId,
        operationType: 'email_delivery',
        entityType: 'email_message',
        entityId: messageCorrelationId,
        status,
        durationMs,
        errorCode,
        attributes: {
          action: 'deliver',
          attempt,
          provider: 'resend',
          queue_name: queue,
        },
      })
      const recordDeliveryRun = (
        status: 'queued' | 'processing' | 'completed' | 'failed',
        errorCode: string | null = null,
        attemptIncrement = false,
      ) => messageCorrelationId
        ? recordOperationRun(supabase, {
            correlationId: messageCorrelationId,
            requestId: messageCorrelationId,
            operationType: 'email_delivery',
            status,
            source: 'scheduler',
            attemptIncrement,
            errorCode,
            attributes: { provider: 'resend', queue_name: queue },
          })
        : Promise.resolve(false)

      // Drop expired messages (TTL exceeded)
      if (payload.queued_at) {
        const ageMs = Date.now() - new Date(payload.queued_at).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          console.warn(`[process-email-queue] delivery_expired queue=${queue} code=EMAIL_EXPIRED`)
          await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'dlq',
            error_message: `TTL exceeded (${ttlMinutes[queue]} minutes)`,
          })
          const { error: ttlDlqError } = await supabase.rpc('move_to_dlq', {
            source_queue: queue,
            dlq_name: dlq,
            message_id: msg.msg_id,
            payload,
          })
          if (ttlDlqError) {
            console.error(`[process-email-queue] dlq_move_failed queue=${queue} code=DATABASE_ERROR`)
          }
          const ttlErrorCode = ttlDlqError ? 'DLQ_MOVE_FAILED' : 'EMAIL_EXPIRED'
          await Promise.all([
            recordDeliveryEvent('email.delivery_failed', 'failed', ttlErrorCode),
            recordDeliveryRun(ttlDlqError ? 'queued' : 'failed', ttlErrorCode),
          ])
          continue
        }
      }

      // Move to DLQ if max failed send attempts reached.
      if (failedAttempts >= MAX_RETRIES) {
        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'dlq',
          error_message: `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`,
        })
        const { error: retryDlqError } = await supabase.rpc('move_to_dlq', {
          source_queue: queue,
          dlq_name: dlq,
          message_id: msg.msg_id,
          payload,
        })
        if (retryDlqError) {
          console.error(`[process-email-queue] dlq_move_failed queue=${queue} code=DATABASE_ERROR`)
        }
        const retryErrorCode = retryDlqError
          ? 'DLQ_MOVE_FAILED'
          : 'MAX_RETRIES_EXCEEDED'
        await Promise.all([
          recordDeliveryEvent('email.delivery_failed', 'failed', retryErrorCode),
          recordDeliveryRun(retryDlqError ? 'queued' : 'failed', retryErrorCode),
        ])
        continue
      }

      // Guard: skip if another worker already sent this message (VT expired race)
      if (payload.message_id) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          console.warn(`[process-email-queue] duplicate_suppressed queue=${queue}`)
          const { error: dupDelError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })
          if (dupDelError) {
            console.error(`[process-email-queue] queue_delete_failed queue=${queue} code=DATABASE_ERROR`)
          }
          await Promise.all([
            recordDeliveryEvent('email.delivery_deduplicated', 'completed'),
            recordDeliveryRun('completed'),
          ])
          continue
        }
      }

      const deliveryStartedAt = Date.now()
      await Promise.all([
        recordDeliveryEvent('email.delivery_started', 'processing'),
        recordDeliveryRun('processing', null, true),
      ])

      try {
        await sendEmail(
          {
            to: payload.to,
            from: payload.from,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
          },
          // endpoint is optional — unset, the client targets the provider's
          // default API. Set EMAIL_API_URL as a Supabase secret to override
          // (e.g. for local dev).
          {
            apiKey,
            idempotencyKey: payload.idempotency_key ?? payload.message_id,
            endpoint: Deno.env.get('EMAIL_API_URL'),
          }
        )

        // Log success
        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'sent',
        })

        // Delete from queue
        const { error: delError } = await supabase.rpc('delete_email', {
          queue_name: queue,
          message_id: msg.msg_id,
        })
        if (delError) {
          console.error(`[process-email-queue] queue_delete_failed queue=${queue} code=DATABASE_ERROR`)
        }
        totalProcessed++
        queueProcessed++
        await Promise.all([
          recordDeliveryEvent(
            'email.delivery_completed',
            'completed',
            null,
            Date.now() - deliveryStartedAt,
          ),
          recordDeliveryRun('completed'),
        ])
      } catch (error) {
        const rateLimited = isRateLimited(error)
        const errorCode = rateLimited ? 'RATE_LIMITED' : 'EMAIL_PROVIDER_ERROR'
        console.error(`[process-email-queue] delivery_failed queue=${queue} code=${errorCode}`)

        if (rateLimited) {
          await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'rate_limited',
            error_message: errorCode,
          })

          const retryAfterSecs = getRetryAfterSeconds(error)
          await supabase
            .from('email_send_state')
            .update({
              retry_after_until: new Date(
                Date.now() + retryAfterSecs * 1000
              ).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)

          await Promise.all([
            recordDeliveryEvent(
              'email.delivery_deferred',
              'queued',
              errorCode,
              Date.now() - deliveryStartedAt,
            ),
            recordDeliveryRun('queued', errorCode),
          ])

          // Stop processing — remaining messages stay in queue (VT expires, retried next cycle)
          await recordOperationalEvent(supabase, {
            eventName: 'queue.processing_stopped',
            source: 'scheduler',
            status: 'queued',
            durationMs: Date.now() - invocationStartedAt,
            errorCode,
            attributes: {
              action: 'process',
              queue_name: queue,
              result_count: queueProcessed,
            },
          })
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'rate_limited' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        // Log non-429 failures to track real retry attempts.
        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'failed',
          error_message: errorCode,
        })
        if (payload?.message_id && typeof payload.message_id === 'string') {
          failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1)
        }

        await Promise.all([
          recordDeliveryEvent(
            'email.delivery_failed',
            'failed',
            errorCode,
            Date.now() - deliveryStartedAt,
          ),
          recordDeliveryRun('queued', errorCode),
        ])

        // Non-429 errors: message stays invisible until VT expires, then retried
      }

      // Small delay between sends to smooth bursts
      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }

    await recordOperationalEvent(supabase, {
      eventName: 'queue.processing_completed',
      source: 'scheduler',
      status: 'completed',
      durationMs: Date.now() - invocationStartedAt,
      attributes: {
        action: 'process',
        queue_name: queue,
        result_count: queueProcessed,
      },
    })
  }

  return new Response(
    JSON.stringify({ processed: totalProcessed }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
