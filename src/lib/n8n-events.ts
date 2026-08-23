/**
 * Event contract between the app and n8n.
 *
 * The frontend never calls n8n directly. Every call goes through the
 * `webhook-proxy` edge function, which resolves the event's URL from
 * `webhook_configs` (an admin-only table), injects the authenticated
 * `user_id`, and, for paid operations, also injects the cost-defining
 * parameters read from the record that was already charged.
 *
 * n8n writes back through the `n8n-proxy` edge function, authenticated by
 * `N8N_SHARED_TOKEN` (not a Supabase JWT). Changes reach the UI over Realtime.
 *
 * Message sending is by polling, not push: n8n calls `send-queue-poll` and
 * receives at most one lead per account, which is the WhatsApp rate limiter.
 *
 * Operations that spend credit are never fired directly. They go through an
 * atomic RPC that charges and changes state in the same transaction:
 *
 *   find_leads                 -> request_find_leads()
 *   copy_generation_requested  -> request_copy()
 *   (sending, via polling)     -> request_send()
 *
 * Lead state machine (the database refuses a direct transition into the paid
 * states COPY_PENDING and SEND_PENDING; only the RPCs above can put a lead
 * there):
 *
 *   NEW -> COPY_PENDING -> COPY_READY -> SEND_PENDING -> SENT
 *       -> IN_CONVERSATION -> FOLLOW_UP -> SCHEDULED -> CLOSED_WON
 *                                                    -> CLOSED_LOST
 */

export const N8N_EVENT_TYPES = [
  "lead_created",
  "lead_status_changed",
  "message_received",
  "message_sent",
  "message_send_requested",
  "copy_generation_requested",
  "meeting_scheduled",
  "credits_debited",
  "find_leads",
  "prompt_validation",
  "agent_toggle",
  "whatsapp",
] as const;

export type N8nEventType = (typeof N8N_EVENT_TYPES)[number];
