import type { Reporter, TestCase, TestModule, TestResult } from "vitest/node";

/**
 * Tiered verdict reporter for the conformance suite.
 *
 * Turns per-test pass/fail/skip results into a single end-of-run verdict:
 *
 *   IS fully AHP-conformant   — zero hard + zero soft failures (skips ok)
 *   ISN'T conformant          — at least one hard or soft failure
 *   SKIPPED                   — nothing ran (no host configured)
 *
 * Tests whose full name contains "[strict]" are SHOULD-tier: they assert
 * recommended rather than mandatory behavior, so their failure is a soft
 * failure. Everything else is MUST-tier and fails hard. Skipped tests count
 * separately and never fail the run; inspect the totals, because a run with
 * many skips covers fewer protocol areas.
 */

const STRICT_MARK = "[strict]";

const RULE_WIDTH = 64;

const COLUMN_WIDTH = 3;

const INITIAL_COUNT = 0;

const NONE = 0;

type Counts = {
  mustPass: number;
  softPass: number;
  hardFail: number;
  softFail: number;
  skip: number;
};

function initialCounts(): Counts {
  return {
    mustPass: INITIAL_COUNT,
    softPass: INITIAL_COUNT,
    hardFail: INITIAL_COUNT,
    softFail: INITIAL_COUNT,
    skip: INITIAL_COUNT,
  };
}

function stateOf(result: TestResult | undefined): string | undefined {
  return result?.state;
}

function isSkipped(testCase: TestCase): boolean {
  const { mode } = testCase.options;
  const state = stateOf(testCase.result());

  return mode === "skip" || mode === "todo" || state === "skipped" || state === "pending";
}

function verdictFor(counts: Counts): string {
  const failures = counts.hardFail + counts.softFail;
  const ran = counts.mustPass + counts.softPass;

  if (ran === NONE && counts.skip !== INITIAL_COUNT) {
    return "SKIPPED (nothing ran; check host configuration and fixture variables)";
  }

  return failures === NONE ? "IS fully AHP-conformant" : "ISN'T conformant";
}

export default class VerdictReporter implements Reporter {
  private readonly counts: Counts = initialCounts();

  onTestRunEnd(
    testModules: readonly TestModule[],
    unhandledErrors: readonly unknown[],
  ): void {
    for (const module of testModules) {
      for (const testCase of module.children.allTests()) {
        this.count(testCase);
      }
    }

    this.print(unhandledErrors.length);
  }

  private count(testCase: TestCase): void {
    const soft = testCase.fullName.includes(STRICT_MARK);

    if (isSkipped(testCase)) {
      this.counts.skip += 1;

      return;
    }

    if (stateOf(testCase.result()) === "failed") {
      if (soft) {
        this.counts.softFail += 1;
      } else {
        this.counts.hardFail += 1;
      }

      return;
    }

    if (soft) {
      this.counts.softPass += 1;
    } else {
      this.counts.mustPass += 1;
    }
  }

  private print(collectionErrors: number): void {
    const { mustPass, softPass, hardFail, softFail, skip } = this.counts;
    const failures = hardFail + softFail + collectionErrors;

    const lines = [
      "",
      "=".repeat(RULE_WIDTH),
      "  AHP CONFORMANCE VERDICT",
      "=".repeat(RULE_WIDTH),
      `  MUST-tier  : pass ${String(mustPass).padStart(COLUMN_WIDTH)} | fail(hard) ${String(hardFail).padStart(COLUMN_WIDTH)}`,
      `  SHOULD-tier: pass ${String(softPass).padStart(COLUMN_WIDTH)} | fail(soft) ${String(softFail).padStart(COLUMN_WIDTH)}`,
      `  skipped    : ${String(skip).padStart(COLUMN_WIDTH)} | collection errors: ${collectionErrors}`,
      `  VERDICT: ${verdictFor(this.counts)}`,
      `  (hard=${failures}, skips=${skip})`,
      "=".repeat(RULE_WIDTH),
      "",
    ];

    for (const line of lines) {
      console.log(line);
    }
  }
}
