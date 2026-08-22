import { maskSecrets } from "./env";

/**
 * The suite's only long-wait primitive.
 *
 * Everything that waits on the real system — a search finishing, copy landing,
 * the send queue firing, the agent replying — goes through this. Scattering
 * `waitForTimeout` around is exactly how a suite that takes tens of minutes
 * per run turns flaky without anyone noticing which step got slower.
 *
 * Two properties matter more than they look:
 *
 * - It logs every probe. A 35-minute wait with no output is indistinguishable
 *   from a hang, and someone will kill it.
 * - On timeout it reports the LAST OBSERVED VALUE, not just "timed out". A
 *   bare timeout after 35 minutes tells you nothing about why.
 */
export interface WaitOptions {
  /** Hard ceiling. Infrastructure steps use 35 min; agent turns use ~4-6 min. */
  timeoutMs: number;
  /** Gap between probes. Default 10s: cheap for Postgres, and 210 probes max. */
  intervalMs?: number;
}

export class WaitTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly elapsedMs: number,
    readonly attempts: number,
    readonly lastObserved: unknown,
  ) {
    super(
      maskSecrets(
        `[${label}] timed out after ${Math.round(elapsedMs / 1000)}s ` +
          `(${attempts} probes). Last observed: ${describe(lastObserved)}`,
      ),
    );
    this.name = "WaitTimeoutError";
  }
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  try {
    const json = JSON.stringify(value);
    return json.length > 300 ? `${json.slice(0, 300)}…` : json;
  } catch {
    return String(value);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Reports what a probe saw on an unsuccessful pass, so the timeout error can
 * quote it. Without this the only thing a 35-minute timeout tells you is that
 * 35 minutes went by.
 */
export type Observe = (value: unknown) => void;

/**
 * Polls `probe` until it returns something other than null/undefined.
 *
 * The probe receives an `observe` callback. Call it with whatever you looked
 * at — the row, the status, the count — before returning null.
 */
export async function waitUntil<T>(
  label: string,
  probe: (observe: Observe) => Promise<T | null | undefined>,
  opts: WaitOptions,
): Promise<T> {
  const intervalMs = opts.intervalMs ?? 10_000;
  const started = Date.now();
  const maxAttempts = Math.max(1, Math.ceil(opts.timeoutMs / intervalMs));
  let lastObserved: unknown = "(nothing observed yet)";
  const observe: Observe = (value) => {
    lastObserved = value;
  };
  let attempt = 0;

  for (;;) {
    attempt += 1;
    let result: T | null | undefined;
    try {
      result = await probe(observe);
    } catch (error) {
      // A probe that throws is not a failure of the wait — the database or the
      // n8n API can blip. Record it and keep going until the ceiling.
      lastObserved = `probe threw: ${maskSecrets(String(error))}`;
      result = null;
    }

    if (result !== null && result !== undefined) {
      const elapsed = Math.round((Date.now() - started) / 1000);
      console.log(`[${label}] satisfied after ${elapsed}s (${attempt} probes)`);
      return result;
    }

    const elapsed = Date.now() - started;
    if (elapsed >= opts.timeoutMs) {
      throw new WaitTimeoutError(label, elapsed, attempt, lastObserved);
    }

    console.log(
      `[${label}] probe ${attempt}/${maxAttempts} — not yet ` +
        `(${Math.round(elapsed / 1000)}s elapsed) — ${describe(lastObserved)}`,
    );
    await sleep(Math.min(intervalMs, opts.timeoutMs - elapsed));
  }
}

/**
 * Asserts that something does NOT happen within a window.
 *
 * Used for "the agent must not reply to a bot message". Proving absence needs a
 * deliberate window, and it needs a companion positive assertion elsewhere —
 * on its own, "nothing happened" also passes when the whole system is down.
 */
export async function expectNothingWithin<T>(
  label: string,
  probe: () => Promise<T | null | undefined>,
  windowMs: number,
  intervalMs = 15_000,
): Promise<void> {
  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < windowMs) {
    attempt += 1;
    const result = await probe();
    if (result !== null && result !== undefined) {
      throw new Error(
        maskSecrets(
          `[${label}] expected nothing, but observed: ${describe(result)} ` +
            `(after ${Math.round((Date.now() - started) / 1000)}s)`,
        ),
      );
    }
    const remaining = windowMs - (Date.now() - started);
    if (remaining <= 0) break;
    console.log(
      `[${label}] still nothing (probe ${attempt}, ` +
        `${Math.round(remaining / 1000)}s left in window) — as expected`,
    );
    await sleep(Math.min(intervalMs, remaining));
  }

  console.log(`[${label}] confirmed: nothing within ${Math.round(windowMs / 1000)}s`);
}
