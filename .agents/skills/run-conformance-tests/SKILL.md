---
name: run-conformance-tests
description: Runs the AHP host conformance suite against the basic example Worker and reports the verdict. Use when asked to check, verify, or audit the agent host's AHP conformance, see where the implementation stands, or run the conformance tests.
---

# Run conformance tests

Start the basic example host, run `@experiments/ahp-conformance` against it, and read the verdict. The suite starts no host and creates no fixtures; this skill does. The `ahp-conformance` agent reports on a run but starts no host — this skill is the run.

## Workflow

1. Start the basic example host. From the repo root, run the example's dev script in the background, redirecting output to a log file:

   ```sh
   nohup pnpm --filter @experiments/agent-host-example dev > /tmp/basic-dev.log 2>&1 &
   ```

   The basic example binds remote Workers AI, so it needs `wrangler login`; if `wrangler whoami` shows no account, stop and ask the user to authenticate. Finish when the log contains `Ready on http://127.0.0.1:8787`.

2. Run the suite. From the repo root, capture the full output to a file because it gets long:

   ```sh
   AHP_URL='ws://127.0.0.1:8787/hosts/00000000-0000-4000-8000-000000000001/ahp' \
     pnpm test:ahp > /tmp/ahp-conformance.log 2>&1
   ```

   The host UUID in the URL is the basic example's convention (its `client/prompt.ts` default). Pass any optional fixture env vars the user supplies in the same command; they unlock more coverage. A nonzero exit is expected when tests fail. Finish when the log contains a `VERDICT:` line — the custom reporter always prints one.

3. Stop the host. Kill the `wrangler dev` process started in step 1 and any `workerd` child it spawned, so port 8787 and the remote AI connection are released.

4. Read the verdict from the log: the `VERDICT:` line, the per-tier counts, each failing test, and the skip total. A test name containing `[strict]` is SHOULD-tier (soft); every other failure is MUST-tier (hard); skips never fail the run. For the fixture variables that unlock skipped coverage and the full verdict format, read `packages/ahp-conformance/README.md` — it is the source of truth, not restated here.

## Notes

- Run with `AHP_URL` alone first; the suite skips what it cannot test, and those skips are part of the findings. A passing run with many skips covers fewer protocol areas.
- The suite runs files sequentially with a 90-second per-test timeout; allow several minutes.
- One host on 8787 at a time. If a previous run left `wrangler dev` alive, stop it before step 1.
