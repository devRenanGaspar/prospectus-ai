const DEFAULT_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 15_000;

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailOptions {
  apiKey: string;
  /**
   * Deduplication key honored by the provider for 24h. Callers pass the queue
   * message id so an ambiguous failure (timeout, dropped connection) can be
   * retried without double-sending.
   */
  idempotencyKey?: string;
  /** Overrides the provider endpoint. Used for local development. */
  endpoint?: string;
}

/**
 * Carries `status` and `retryAfterSeconds` so callers can distinguish a
 * throttle from a hard failure without parsing messages.
 */
export class EmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = "EmailApiError";
  }
}

function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get("retry-after") ?? headers.get("ratelimit-reset");
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);

  const retryAt = Date.parse(raw);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  }
  return null;
}

// Provider error bodies carry a machine-readable `name` (e.g. "validation_error")
// and a human message that may echo the recipient address. Only the name is kept.
async function providerErrorName(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const name = (body as { name?: unknown })?.name;
    return typeof name === "string" ? name : "unknown_error";
  } catch {
    return "unknown_error";
  }
}

export async function sendEmail(
  message: EmailMessage,
  options: SendEmailOptions,
): Promise<{ id: string | null }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
  };
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(options.endpoint ?? DEFAULT_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new EmailApiError(
      `provider rejected the send: ${await providerErrorName(response)}`,
      response.status,
      parseRetryAfter(response.headers),
    );
  }

  const body = await response.json().catch(() => null);
  const id = (body as { id?: unknown })?.id;
  return { id: typeof id === "string" ? id : null };
}
