# Task 1 review fixes

Review base: `79fa0ab`. The three findings in `.superpowers/sdd/owned-context-findings.md` were reproduced before implementation: six failing regression cases and four uncaught errors. A further recorded-ownerSignal regression reproduced one lost error and one uncaught error before its fix.

Abort cleanup remains immediate and once-only. The abort listener now catches cleanup failures and forwards them, with null execution context, to the required SDK-private `reportResourceError(error)` sink. Issuance and narrowing validate that sink and capture its function identity. Cleanup itself also runs with null context. The sink is a trusted, nonthrowing host contract: NSE queues errors on the exact recorded scope; nonstructural mount/hook contexts must use the runtime's existing error reporter. No public SDK cleanup/error API was added.

NSE release drains errors queued by early authority-abort cleanup, runs remaining ordinary resource cleanup, aborts the structural owner signal, then drains errors reported during that final signal delivery. Recorded ownerSignal children retain their existing late disposal position; their disposal errors are caught and queued on the recorded parent scope. Arbitrary external ownerSignal behavior is unchanged. Existing lifetime error collection still completes child and owner cleanup, throws a single original error directly, and uses AggregateError for multiple errors. An already aggregated child's error retains its existing nested shape. Errors queued by external mount revocation remain available for the later structural owner release. Repeated disposal does not rerun cleanup or re-report the error.

Child execution inheritance now validates before structural adoption, abort-listener installation, object ownership/lifetime map publication or acquisition-journal publication. Failed inheritance from a revoked execution context leaves no adopted partial child or installed listener; later parent disposal succeeds normally. Tests cover explicit recorded owner and explicit recorded ownerSignal while their structural scope remains live.

Runtime object admission now includes callable objects in both `own` and private context registration. Ordinary callable disposables and callable private resources retain exact identity and dispose once. Unregistered callable objects remain rejected, as do primitives, thenables and foreign/inactive ownership.

Verification after all source edits:

- `npx vitest run tests/runtime/owned-execution-context.test.ts tests/runtime/nse-owned-factory.test.ts tests/runtime/nse-ownership.test.tsx --maxWorkers=1 --reporter=dot`: 3 files, 61 tests passed; 36 cases in the context file. No uncaught errors or warnings.
- Framework `npx tsc -b --pretty false`: passed.
- Sibling site `npx tsc -b --pretty false`: passed against its existing dependency state.
- `node scripts/quality/architecture-boundaries.mjs`: passed, 1,617 files and 7,339 edges.
- `git diff --check`: passed.

The original task's scope limits remain: no mounted FX facade integration, native asynchronous context propagation, full suite, SDK build, packed-consumer/browser validation, server, branch/worktree, push, Fusion or other family changes. This fix packet is ready for independent re-review; it does not establish task 2 integration acceptance.
