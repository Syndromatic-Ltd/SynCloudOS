# DispatchFX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grand Central Dispatch for SynCloudOS: Apple's Dispatch API under `DFX`, with QoS-ordered main-thread scheduling, a worker pool that runs sendable closures in parallel, and Tier 2 blocking where cross-origin isolation allows it. Framework subsystems adopt it only where measured.

**Architecture:**
- **One internal root scheduler** serves the main thread (Tier 0) and a capped module-worker pool (Tier 1).
- **The SynWare Vite plugin converts closures:** it annotates sendable closures, builds them into a per-app worker chunk, and hoists nested `DFXQueue.main.async` continuations back to the main thread.
- **Blocking members** use `SharedArrayBuffer` and `Atomics.wait` on workers, only when `crossOriginIsolated` (Tier 2).

**Tech Stack:** TypeScript, Vite/Rollup plugin API (ESTree via `this.parse`), Vitest, Playwright Chromium, `scheduler.postTask`, module workers, `Atomics`.

**Spec:** `docs/superpowers/reviews/2026-11-08-dispatchfx-design.md`. Read it in full first. Its section numbers are cited below as §n.

## Global Constraints

- **Prefix:** `DFX`, exactly. Apple's type name with `Dispatch` replaced by `DFX`. One class per file in `src/FX/DispatchFX/`; `public.ts` only re-exports; helpers go in `src/FX/DispatchFX/internal/`.
- **Package entry:** `@syndromatic/syncloudos/fx/dispatch`.
- **Rules:** the ten rules of `docs/superpowers/reviews/2026-11-08-fx-device-families.md` apply, and the conventions in §3 of the spec are pinned. No aliases, no shims, no invented members.
- **Errors:** Dispatch has no error type. Misuse throws a plain `Error` whose message starts `"BUG IN CLIENT OF LIBDISPATCH: "`.
- **Work items are synchronous.** Their types reject functions returning `PromiseLike`.
- **Pinned numbers:**
  - main-thread slice: 5 ms;
  - pool size: `max(1, min(navigator.hardwareConcurrency − 1, 8))`;
  - worker idle termination: 30 s;
  - `utility` and `background` may hold at most `ceil(poolSize / 2)` workers;
  - overcommit cap: 2 × pool size;
  - after a session ends, a worker still running that app's item is terminated after 2 s.
- **Per-app binding** uses the option A binder from the FX fidelity job (`bindFXFamily`). Tasks 1–6 run inside that job, right after option A and before the device families. Tasks 7 onwards come after the families.
- **Arguments are positional, in Apple's order.** Two or more consecutive defaulted parameters go in one options object keyed by Apple's labels, and the work closure comes last (spec §3).
- **British spelling** in prose, Apple's spelling in API names.
- **Commit and push rules:**
  - commit by explicit paths;
  - no `Co-Authored-By`;
  - no pushes;
  - no bare `git stash`.
- **Ports and protected files:**
  - never touch ports 5173, 5210 or 5387;
  - never stage `site/vite.claude-5199.config.mts`;
  - Fusion is read-only;
  - never open `SynCloudOS-Fusion-gemini`.

## Review Focus

1. **A main-queue item that dispatches to the main queue.** The new item runs after the current one returns, never re-entrantly. Pinned by `main queue never re-enters` (Task 2).
2. **A closure capturing an `NSEData` the caller keeps using.** The caller's data stays intact: captures are cloned, never transferred. Pinned by `captured NSEData is not detached on the caller` (Task 10).
3. **An app quitting while its work is in flight.** No continuation from that app runs after its session ends, and the pool replaces a stuck worker. Pinned by `session end drops worker continuations and replaces a stuck worker` (Task 10).
4. **`queue.sync` from inside a closure already running on that queue,** directly or through a target chain. It throws with the queue chain in the message and never hangs. Pinned by `sync onto a queue on the current stack throws` (Task 3).
5. **An `async` function passed as work.** It's a type error in TypeScript, and at runtime it's reported once with the pinned message, not silently run half-way. Pinned by `thenable return is reported once` (Task 2), plus a `// @ts-expect-error` line in the same test.

---

### Task 1: Value types, entry registration

**Files:**
- Create in `src/FX/DispatchFX/`:
  - `DFXTime.ts`, `DFXWallTime.ts`, `DFXTimeInterval.ts`, `DFXTimeoutResult.ts`;
  - `DFXQoS.ts`, `DFXQoSClass.ts`;
  - `DFXQueueAttributes.ts`, `DFXQueueAutoreleaseFrequency.ts`;
  - `DFXWorkItemFlags.ts`, `DFXSpecificKey.ts`, `DFXSourceTimerFlags.ts`, `DFXSourceMemoryPressureEvent.ts`;
  - `public.ts`.
- Modify:
  - the package `exports` map and the SDK build entry list (wherever `fx/crypto` is registered; follow it exactly);
  - `docs/framework/appkit-counterparts.json`;
  - `scripts/quality/architecture-boundaries.json`;
  - the developer MCP lookup data.
- Test: `src/FX/DispatchFX/__tests__/values.test.ts`, plus the counterparts test in the style the FX fidelity job added.

**Interfaces:**
- **Produces:**
  - `DFXTime.now()`, `DFXTime.distantFuture`, `new DFXTime(uptimeNanoseconds)`, `.uptimeNanoseconds`, `.advanced(by: DFXTimeInterval): DFXTime`, `.distance(to: DFXTime): DFXTimeInterval`.
  - `DFXWallTime` has the same shape on `Date.now()`.
  - `DFXTimeInterval.seconds|milliseconds|microseconds|nanoseconds(n)`, `DFXTimeInterval.never`, and an internal `nanoseconds` getter in `internal/time.ts`.
  - `DFXQoS.{background,utility,default,userInitiated,userInteractive,unspecified}`, `new DFXQoS(qosClass, relativePriority)`.
  - `DFXQoSClass`, `DFXTimeoutResult`, and `DFXQueueAutoreleaseFrequency` are frozen string objects.
  - `DFXQueueAttributes`, `DFXWorkItemFlags`, `DFXSourceTimerFlags` and `DFXSourceMemoryPressureEvent` are classes with frozen static members.

- [ ] **Step 1:** Write the failing tests:
  - `DFXTime.now().advanced(by: DFXTimeInterval.milliseconds(5)).distance(to: DFXTime.now())` is negative, and in nanoseconds;
  - `DFXTime.distantFuture` compares later than `new DFXTime(Number.MAX_SAFE_INTEGER - 1)`;
  - `new DFXQoS(DFXQoSClass.utility, 1)` throws, because `relativePriority` must be in −15…0;
  - every export of `fx/dispatch` has an `appkit-counterparts.json` entry naming its `Dispatch*` counterpart.
- [ ] **Step 2:** Run `npx vitest run src/FX/DispatchFX`. Expect FAIL (modules missing).
- [ ] **Step 3:** Implement the files. `DFXTime` is based on `performance.now() * 1e6`, and `DFXWallTime` on `Date.now() * 1e6`.
- [ ] **Step 4:** Run the tests and `npx tsc -b`. Expect PASS.
- [ ] **Step 5:** Commit: `FX: add DispatchFX value types and entry`.

### Task 2: Root scheduler, DFXObject, DFXQueue.async

**Files:**
- Create:
  - `internal/rootScheduler.ts`, the QoS lanes and host-task hop. Reuse the MessageChannel and `scheduler.yield` approach in `src/SynCloudOS/PlatformAdapters/browserHostYield.ts`; don't duplicate it, and extract a shared helper if needed.
  - `internal/executionStack.ts`;
  - `DFXObject.ts`, `DFXQueue.ts`, `DFXPredicate.ts`, `dispatchPrecondition.ts`.
- Test: `__tests__/queue.test.ts`, using a fake host that implements `postTask`, `yield`, `MessageChannel` and `setTimeout`, with a controllable clock.

**Interfaces:**
- **Consumes:** Task 1.
- **Produces:**
  - `DFXQueue.main`, `DFXQueue.global(qos?: DFXQoS)`;
  - `new DFXQueue(label: string, options?: { qos?, attributes?: DFXQueueAttributes[], autoreleaseFrequency?, target?: DFXQueue })`;
  - `.label`, `.qos`;
  - `.async(work)`, `.async(options: { group?: DFXGroup, qos?: DFXQoS, flags?: DFXWorkItemFlags[] }, work)`, `.async(item: DFXWorkItem)`;
  - `.setSpecific<T>(key, value)`, `.getSpecific<T>(key)`, `DFXQueue.getSpecific<T>(key)`;
  - `DFXObject.activate|suspend|resume|setTarget(queue)`.
  - Internal: `rootScheduler.submit(job: ScheduledJob)`, where `ScheduledJob = { queue, qos, run(): void, appId: string | null }`. `DFXGroup` is declared in Task 4; only its type is referenced here.
  - `type DFXWork<R> = () => R & (R extends PromiseLike<unknown> ? never : unknown)`.

- [ ] **Step 1:** Write the failing tests:
  - `QoS lanes drain in priority order`: `background`, `utility`, `userInteractive` submitted in that order run as `userInteractive`, `utility`, `background`;
  - `relativePriority orders within a class`;
  - `serial queue runs FIFO one at a time`;
  - `barrier waits for earlier items and blocks later ones on a concurrent queue`;
  - `global queues ignore barrier`;
  - `target queue chain resolves QoS per Apple's table`, with `inheritQoS` and `enforceQoS` cases;
  - `suspend holds items; over-resume throws BUG IN CLIENT OF LIBDISPATCH`;
  - `initiallyInactive holds items until activate`;
  - `main queue never re-enters`;
  - `time slice yields after 5 ms except between userInteractive items`;
  - `throwing item is reported and the queue continues`: spy on `reportError` and assert the queue label is in the reported error;
  - `thenable return is reported once`;
  - `getSpecific reads the current stack, including the target chain`;
  - `dispatchPrecondition onQueue/notOnQueue/onQueueAsBarrier`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement.
  - `console.createTask` wrapping is feature-detected.
  - Dev-only `performance.measure("DFX " + label)` is behind `import.meta.env.DEV`.
- [ ] **Step 4:** Run the tests and `npx tsc -b`. Expect PASS.
- [ ] **Step 5:** Commit: `FX: add DispatchFX queues and root scheduler`.

### Task 3: sync, deadlock detection and QoS override

**Files:**
- Modify: `DFXQueue.ts`, `internal/rootScheduler.ts`.
- Test: `__tests__/sync.test.ts`.

**Interfaces:**
- **Produces:**
  - `.sync<R>(work: DFXWork<R>): R`, `.sync<R>(options: { flags? }, work): R`;
  - internal `rootScheduler.drainInRealm(queue, upTo?: ScheduledJob): void`;
  - internal `rootScheduler.override(queue, qos)`.

- [ ] **Step 1:** Write the failing tests:
  - `sync drains earlier pending items in order, then runs inline and returns the value`;
  - `sync onto a queue on the current stack throws`: direct, through a target chain, and `DFXQueue.main.sync` from a main item. Each message includes the chain of labels;
  - `sync onto a queue with a worker item in flight throws` (use a stub in-flight flag on the queue now; Task 10 re-runs this test against the real pool);
  - `higher-QoS sync boosts the lower-QoS items ahead of it`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit: `FX: add DispatchFX sync with deadlock detection and QoS override`.

### Task 4: DFXWorkItem, DFXGroup, DFXSemaphore

**Files:**
- Create: `DFXWorkItem.ts`, `DFXGroup.ts`, `DFXSemaphore.ts`, `internal/blockingRules.ts`.
- Test: `__tests__/workitem-group-semaphore.test.ts`.

**Interfaces:**
- **Produces:**
  - `new DFXWorkItem(block)`, `new DFXWorkItem({ qos?, flags? }, block)`;
  - `.perform()`, `.wait(): void`, `.wait(timeout: DFXTime | DFXWallTime): DFXTimeoutResult`;
  - `.notify(queue, execute)`, `.notify(queue, { qos?, flags? }, execute)`, `.cancel()`, `.isCancelled`;
  - `new DFXGroup()`, `.enter()`, `.leave()`, `.notify(queue, work)`, `.notify(queue, { qos?, flags? }, work)`, `.wait(...)`, with the same overloads as the work item;
  - `new DFXSemaphore(value)`, `.wait(...)`, `.signal(): number`;
  - internal `blockingRules.mainThreadWait(satisfy: () => boolean, timeout): DFXTimeoutResult`, which implements §4 exactly.

- [ ] **Step 1:** Write the failing tests:
  - `cancelled work item that has not started never runs; notify still fires`, per Apple's behaviour for cancelled items;
  - `group notify fires once after all async items and enter/leave pairs`;
  - `leave without enter throws Unbalanced call to dispatch_group_leave()`;
  - `semaphore wait with count>0 succeeds; with count 0 and timeout now returns timedOut; with a later timeout on main throws the pinned main-thread message`;
  - `group wait drains in-realm work and returns success`;
  - `work item wait drains its in-realm queue`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit: `FX: add DispatchFX work items, groups and semaphores`.

### Task 5: asyncAfter and sources

**Files:**
- Create:
  - `internal/timerWheel.ts` (leeway coalescing);
  - `DFXSource.ts`, `DFXSourceProtocol.ts`, `DFXSourceTimer.ts`;
  - `DFXSourceUserDataAdd.ts`, `DFXSourceUserDataOr.ts`, `DFXSourceUserDataReplace.ts`;
  - `DFXSourceMemoryPressure.ts`;
  - `internal/sources/*` for the concrete classes.
- Modify: `DFXQueue.ts` (`asyncAfter`).
- Test: `__tests__/sources.test.ts`.

**Interfaces:**
- **Produces:**
  - `.asyncAfter(deadline: DFXTime | DFXWallTime, work)`, `.asyncAfter(deadline, { qos?, flags? }, work)`;
  - `DFXSource.makeTimerSource({ flags?, queue? }?)`, `makeUserDataAddSource(queue?)`, `makeUserDataOrSource(queue?)`, `makeUserDataReplaceSource(queue?)`, `makeMemoryPressureSource(eventMask, queue?)`;
  - `DFXSourceTimer.schedule(deadline: DFXTime | DFXWallTime, { repeating?, leeway? }?)`;
  - user-data `add|or|replace(data)` and `.data`.

- [ ] **Step 1:** Write the failing tests:
  - `repeating timer does not drift`: 100 fires at 10 ms under a jittery fake clock, where fire n is at start + n×10 ms ± leeway;
  - `timers within each other's leeway share one host timer`;
  - `strict timers never coalesce`;
  - `user data add coalesces between handler runs`, where `data` is the sum;
  - `cancel runs the cancel handler once on the source queue`;
  - `memory pressure source never fires when the runtime has no signal`. Check `BrowserRuntimeEnvironment` first; if it has a signal, test delivery instead.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit: `FX: add DispatchFX asyncAfter and sources`.

### Task 6: Per-app binding and lifetime

**Files:**
- Modify:
  - the option A binder registry (wherever `bindFXFamily` lives after the FX fidelity job), adding a `"dispatch"` family;
  - `internal/rootScheduler.ts` (app-scoped cancellation).
- Create: `internal/systemBinding.ts`, the framework-internal binding.
- Test: `__tests__/app-binding.test.tsx`, using `createSynWareTestHost`, plus the packed SDK consumer test for `fx/dispatch`.

**Interfaces:**
- **Consumes:** `bindFXFamily(family, appId)` from the FX fidelity job.
- **Produces:**
  - per-app `DFXQueue` whose `main`, `global()` and constructor stamp `appId` on every job;
  - `systemDispatch()`, internal only, returning system-bound queues for framework code.

- [ ] **Step 1:** Write the failing tests:
  - `items dispatched by an app after an await and in a timer carry its appId`;
  - `session end drops pending items, cancels sources with cancel handlers, clears timers`;
  - `group still entered at session end is reported in dev with the enter() site`;
  - `packed third-party consumer gets per-app DFXQueue`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests, the packed consumer test and `npx tsc -b`. Expect PASS.
- [ ] **Step 5:** Commit: `FX: bind DispatchFX queues to their application`.
- [ ] **Step 6:** Record Tasks 1–6 in `docs/superpowers/evidence/<date>-dispatchfx/PLAN.md`, with:
  - a member mapping table (Apple → ours → file);
  - test counts;
  - every deviation from Apple.

  **Owner decision (8 November):** Tasks 1–6 run inside the FX fidelity job, straight after option A. The device families then continue without a stop. Tasks 7 onwards are a later, separate job.

### Task 7: Benchmark harness and baselines

**Files:**
- Create:
  - `scripts/perf/dispatchfx-bench.mjs` (Playwright Chromium, against a fixture page);
  - `scripts/perf/fixtures/dispatchfx/` (the workloads in §7);
  - `docs/superpowers/evidence/<date>-dispatchfx/benchmarks.md`.

**Interfaces:**
- **Produces:** `node scripts/perf/dispatchfx-bench.mjs --workload <name> [--isolated]`. It prints JSON `{ longestTaskMs, p95InputDelayMs, wallMs }` and the crossover table.

- [ ] **Step 1:** Implement the harness.
  - Input delay comes from synthetic `pointerdown` events every 50 ms, measured from event `timeStamp` to handler start.
  - Long tasks come from `PerformanceObserver({ type: "longtask" })`.
- [ ] **Step 2:** Record baselines for every §7 workload on the current code, three runs each, reporting the median. Record the clone, transfer and `SharedArrayBuffer` crossover table, with the harness serving COOP/COEP for the `--isolated` runs.
- [ ] **Step 3:** Commit: `Perf: add DispatchFX benchmark harness and baselines`.

### Task 8: Worker pool runtime

**Files:**
- Create:
  - `internal/pool/WorkerPool.ts`;
  - `internal/pool/poolWorker.ts` (the worker entry);
  - `internal/pool/protocol.ts`;
  - `internal/pool/dedicatedThread.ts`.
- Test:
  - `__tests__/pool.test.ts`, with a fake `Worker`;
  - one Chromium smoke test in the packed consumer style that runs a real module worker.

**Interfaces:**
- **Produces:**
  - internal `WorkerPool.shared.submit(job: PoolJob): void`, where `PoolJob = { appId, closureId, chunkURL, captures: unknown[], qos, queueKey, onResult(values), onError(error) }`;
  - `WorkerPool.shared.cancelApp(appId)`;
  - `dedicatedThread(label, chunkURL)` returning a serial queue target.

- [ ] **Step 1:** Write the failing tests:
  - `pool size is max(1, min(cores-1, 8)) and spawns lazily`;
  - `idle worker terminates after 30 s`;
  - `background and utility hold at most ceil(size/2) workers`;
  - `jobs for one worker in one turn are posted as one message`;
  - `serial queue prefers its previous worker`;
  - `worker error returns name, message and stack`;
  - `cancelApp drops results; worker still busy 2 s after is terminated and replaced`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit: `FX: add DispatchFX worker pool`.

### Task 9: Closure conversion transform

**Files:**
- Create:
  - `scripts/synware/dispatch/closureConversion.mjs` (the transform);
  - `scripts/synware/dispatch/workerGlobals.mjs` (the allow-list);
  - `src/FX/DispatchFX/internal/workerSafeEntries.json`.
- Modify: `scripts/synware/vite-plugin.mjs`, to call the transform from `transform` for app-bundle modules and framework modules that import `fx/dispatch`.
- Test: `scripts/synware/dispatch/__tests__/closureConversion.test.mjs`, with 40 or more fixture shapes under `__fixtures__/`.

**Interfaces:**
- **Produces:**
  - `convertDispatchClosures(code, id, { isWorkerSafe(specifier): boolean, strict: boolean }) → { code, map, closures: ExtractedClosure[], diagnostics: Diagnostic[] }`;
  - `ExtractedClosure = { closureId, params, captures: string[], imports, body, continuations: { id, workerValues: string[] }[] }`;
  - runtime helpers `__dfxSendable(fn, id, getCaptures)` and `__dfxContinuation(id, fn)` in `src/FX/DispatchFX/internal/sendable.ts`.

- [ ] **Step 1:** Write the failing fixture tests:
  - **accepted shapes:**
    - imports only;
    - a captured `const` local;
    - a captured parameter;
    - a nested `DFXQueue.main.async` that uses both a worker local and a main-side setter;
    - `notify(DFXQueue.main, …)`;
    - `concurrentPerform`;
    - `new DFXWorkItem`;
  - **rejected shapes, each with an exact reason string:**
    - `this`;
    - an assignment to a captured `let`;
    - `document`;
    - an import of a non-worker-safe module;
    - a captured class instance used by method call;
  - **receiver-agnostic:** `someOther.async(fn)` is annotated, and calling `fn` directly behaves identically;
  - **strict mode:** diagnostics become errors.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement. Use the plugin context's `this.parse` and a scope walker that already exists in `node_modules`; add no dependency without stopping to ask.
- [ ] **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit: `SynWare: convert sendable DispatchFX closures`.

### Task 10: Worker chunks, end to end

**Files:**
- Modify: `scripts/synware/vite-plugin.mjs`, to emit the per-app worker entry `\0virtual:syncloudos/app/<bundleIdentifier>/dispatch-worker` from the collected `ExtractedClosure`s, in dev and in build.
- Modify: `DFXQueue.ts`, to route annotated items to `WorkerPool` and non-annotated ones to the in-realm scheduler.
- Test:
  - `__tests__/sendable-e2e.test.ts`, in the fixture-app style used by the existing packed consumer tests;
  - a Chromium run.

- [ ] **Step 1:** Write the failing tests:
  - `global.async closure runs on a worker and main.async continuation updates main state`;
  - `captured NSEData is not detached on the caller`;
  - `mutating a captured clone throws in the worker`;
  - `results are transferred, not cloned`: assert `byteLength` is 0 on the worker side after posting;
  - `non-sendable closure runs in-realm at its QoS and the build printed its reason`;
  - `session end drops worker continuations and replaces a stuck worker`;
  - `HMR replaces the worker chunk`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests, the packed consumers and `npx tsc -b`. Expect PASS.
- [ ] **Step 5:** Commit: `FX: run sendable DispatchFX work on the worker pool`.
- [ ] **Step 6: STOP** for Claude's review, reporting as in Task 6.

### Task 11: Tier 2 blocking and starvation guard

**Files:**
- Create: `internal/pool/sharedWait.ts`, `internal/pool/starvationGuard.ts`.
- Modify: `DFXSemaphore.ts`, `DFXGroup.ts`, `DFXWorkItem.ts`, `DFXQueue.ts` (worker-side `sync`, `concurrentPerform`).
- Test: Chromium tests served with COOP `same-origin` and COEP `require-corp`, by the test harness only. Don't change `site/worker/index.ts`.

- [ ] **Step 1:** Write the failing tests:
  - `semaphore wait blocks a worker until signal`;
  - `concurrentPerform splits across idle workers and the caller participates`;
  - `all workers blocked with pending work adds one overcommit worker`;
  - `at 2x pool the guard throws naming blocked queues`;
  - `without isolation, worker-side concurrentPerform loops sequentially`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit: `FX: add DispatchFX blocking on isolated workers`.

### Tasks 12–15: Framework adoption, one commit each, each behind the adoption bar

Each task:
1. moves the subsystem onto `systemDispatch()` queues (per §8 of the spec);
2. deletes its hand-rolled request, cancel and transfer protocol;
3. keeps its public API unchanged;
4. re-runs that subsystem's benchmark.

The adoption bar: the longest main-thread task must fall by at least 50%, and wall time must not regress by more than 10%. **If the bar fails, revert that adoption and record why in `benchmarks.md`.**

12. ImageFX processing (`BrowserImageProcessingWorker.ts`, `image-processing.worker.ts`): global `userInitiated`.
13. VideoFX processing (`VideoWorkerTransport.ts`, `video-processing.worker.ts`): a serial queue per video, `userInitiated`.
14. GraphicsFX PDF documents (`BrowserPDFDocumentWorker.ts`, `pdf-document.worker.ts`): global `userInitiated`.
15. The Lumina index (`WorkerLuminaIndexBackend.ts`, `lumina-index.worker.ts`): `dedicatedThread` serial, `utility`.

Each task's tests are the subsystem's existing suite, unchanged and passing, plus `adoption keeps cancellation semantics`.

### Task 16: Documentation, verification, report

- [ ] `docs/framework/dispatch.md`:
  - the three tiers;
  - sendability rules, with each diagnostic and its fix;
  - the §6a table.

  Link it from `docs/framework/README.md`.
- [ ] Full framework suite, serially (`npx vitest run --maxWorkers=1 --no-file-parallelism`). Stop if C: has less than 20 GB free.
- [ ] `npx tsc -b`, `node scripts/quality/architecture-boundaries.mjs`, and the packed consumers.
- [ ] Site adoption via the temporary-checkout procedure in the FX fidelity prompt; site `tsc` and `vitest`.
- [ ] Write `REPORT.md` in the evidence folder, containing:
  - the member mapping;
  - deviations;
  - before and after benchmarks;
  - open owner questions (§9);
  - commits.
