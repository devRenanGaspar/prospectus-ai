// Type declarations for `fixtures.mjs`. See `checks.d.mts` for why the
// extension is `.d.mts` and not `.d.ts`.

import type { CopyLead } from "./checks.mjs";

export interface CopyFixture {
  id: string;
  label: string;
  lead: CopyLead;
  /** `check_name`s this fixture is expected to trip, and no others. */
  expect: string[];
}

export declare const FIXTURES: CopyFixture[];
