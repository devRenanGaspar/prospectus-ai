// Type declarations for `checks.mjs`, which is plain JS on purpose (it runs
// under `node evals/copy-grounding/run.mjs`, outside the app bundle).
//
// The extension has to be `.d.mts`, not `.d.ts`. With
// `moduleResolution: "bundler"` and an explicit `.mjs` specifier, TypeScript
// looks for `checks.mts` and `checks.d.mts` and then falls through to the
// `.mjs` itself -- a `.d.ts` sitting next to it is never consulted, and the
// import stays implicitly `any`. Confirmed with `tsc --traceResolution`.

/** A lead as the copy-quality checks read it. */
export interface CopyLead {
  copy: string;
  reviews_count?: string | null;
  total_score?: string | null;
  website?: string | null;
  instagram?: string | null;
  website_analysis?: string | null;
  city?: string | null;
  comments?: Array<Record<string, unknown>>;
}

/** One CP-T check, ported from `ops_copy_quality`. */
export interface CopyCheck {
  test_id: string;
  check_name: string;
  severity: string;
  /** Returns the violation's context, or null when the copy is clean. */
  run(lead: CopyLead): Record<string, unknown> | null;
}

/** A check that fired, with the evidence that made it fire. */
export interface CopyViolation {
  test_id: string;
  check_name: string;
  severity: string;
  context: Record<string, unknown>;
}

export declare const CHECKS: CopyCheck[];

export declare function evaluateCopy(lead: CopyLead): CopyViolation[];
