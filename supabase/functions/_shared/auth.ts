// Shared authentication helpers for the edge functions that authenticate with
// a shared token rather than a Supabase JWT.
//
// This module exists so there is exactly one implementation of the comparison.
// There used to be two: `n8n-proxy` compared its token in constant time while
// `send-queue-poll` used `!==` on the whole `Authorization` header, even though
// both check the *same* secret (`N8N_SHARED_TOKEN`). A second copy is how the
// next function ends up written with `!==` again.
//
// Deliberately free of Deno globals and URL imports, so the unit tests under
// `src/test/` can import and exercise the same code the functions run.

/**
 * Compares two strings without leaking, through timing, how many leading bytes
 * matched. `!==` on secrets returns as soon as it finds a differing byte, which
 * lets an attacker who can measure response time recover a token byte by byte.
 *
 * Length is not secret here (both tokens are fixed-length operational secrets),
 * so returning early on a length mismatch is fine.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

/**
 * Extracts the token from an `Authorization: Bearer <token>` header.
 * Returns "" when the header is absent or not a Bearer header, so callers
 * compare a string against a string instead of branching on null.
 */
export function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : "";
}
