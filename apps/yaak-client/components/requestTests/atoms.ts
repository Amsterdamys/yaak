import { atom } from "jotai";
import { atomWithKVStorage } from "../../lib/atoms/atomWithKVStorage";
import type { SandboxOutcome, TestStatus } from "./sandbox";

export interface TestRun {
  requestId: string;
  responseId: string;
  state: "running" | "done";
  startedAt: number;
  outcome: SandboxOutcome | null;
}

/** Results keyed by response id, for this window's lifetime. */
export const testRunsAtom = atom<Record<string, TestRun>>({});

/** Per request: whether the script runs after every send. Unset means yes. */
export const runTestsOnSendAtom = atomWithKVStorage<Record<string, boolean | undefined>>(
  "tests_run_on_send",
  {},
);

export interface TestSummary {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  /** A script-level error counts as a failure for the badge. */
  ok: boolean;
}

export function summarize(outcome: SandboxOutcome): TestSummary {
  const count = (status: TestStatus) => outcome.results.filter((r) => r.status === status).length;
  const passed = count("passed");
  const failed = count("failed");
  const skipped = count("skipped");
  return {
    passed,
    failed,
    skipped,
    total: outcome.results.length,
    ok: failed === 0 && outcome.error == null,
  };
}
