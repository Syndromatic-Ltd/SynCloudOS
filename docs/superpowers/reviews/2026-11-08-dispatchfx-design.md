# DispatchFX: Grand Central Dispatch for SynCloudOS

Design review, 8 November 2026. Author: Claude. Status: proposed, awaiting the owner's review.

DispatchFX mirrors Apple's Dispatch framework (libdispatch, Swift overlay) under the `DFX` prefix:
- `DispatchQueue` → `DFXQueue`;
- `DispatchGroup` → `DFXGroup`;
- `DispatchSemaphore` → `DFXSemaphore`;
- the same pattern for every other type.

It follows the ten rules of `docs/superpowers/reviews/2026-11-08-fx-device-families.md`. AnimationFX is the structural standard: one class per file, and `public.ts` only re-exports.

This is **not** the "DispatchFX" Codex proposed on 8 November to carry an ambient execution context through `await`. That idea stays rejected. This one exists for performance and for making concurrency easy.

---

## 1. What we are actually buying

GCD doesn't make code faster. It makes concurrency cheap, safe and ordinary, so the code that can run elsewhere does. On the web that buys three things, in order of size:

1. **Responsiveness.** One main thread does JavaScript, style, layout, paint and input. Chrome's INP metric measures exactly the long tasks that block it. DispatchFX helps in two ways:
   - **QoS-ordered, time-sliced main-thread scheduling.** `.background` work never delays `.userInteractive` work, and long queues yield between items.
   - **Moving computation off the main thread.**
2. **Throughput for parallel CPU work.** `concurrentPerform`, and concurrent global queues across a worker pool. Image kernels, video frames, PDF parsing, indexing and hashing can use every core: this machine has 32.
3. **One concurrency model instead of six.** The framework already runs six hand-rolled workers, each with its own request ids, cancellation messages, transfer lists and teardown:
   - `BrowserImageProcessingWorker`;
   - `VideoWorkerTransport`;
   - `WorkerLuminaIndexBackend`;
   - `BrowserPDFDocumentWorker`;
   - pdf.js's worker;
   - `BrowserRecoveryWatchdog`.

   Each of those protocols is an implicit state machine. DispatchFX replaces the first four with queues.

**What it will not do:**
- **It won't speed up rendering.** The DOM, layout and React reconciliation are main-thread only.
- **It won't help small jobs.** Crossing to a worker costs a structured clone or transfer plus a task hop. Below a crossover size (measured in Task 7, not assumed) dispatching to a worker is slower than doing the work inline.
- **It won't speed up Web Crypto.** Web Crypto already runs off the main thread internally.

Every adoption must therefore prove itself with measurements (§7).

## 2. The three tiers

The browser gives different powers in different places, so DispatchFX is built in three tiers. **Apple's semantics hold in every tier.** Only the amount of parallelism changes.

| Tier | Where it runs | Requires | What it gives |
| --- | --- | --- | --- |
| 0. In-realm | The page's main thread | Nothing | The full Dispatch API with Apple's ordering guarantees, QoS-ordered scheduling and time slicing. A legal GCD schedule that happens to use one thread. |
| 1. Worker pool | Module workers | The SynWare Vite plugin | *Sendable* closures run in parallel on a shared worker pool, with results returned through `DFXQueue.main.async`, groups and notify. Works in every browser. |
| 2. Blocking | Inside worker threads | Cross-origin isolation (`SharedArrayBuffer`, `Atomics.wait`) | Blocking members (`sync` to a worker queue, `DFXSemaphore.wait`, `DFXGroup.wait`, parallel `concurrentPerform`) work on worker threads exactly as on Apple platforms. |

Tier 2 is an **owner decision** (§9, question 1). Cross-origin isolation would break `NSEWebView`: it embeds arbitrary cross-origin `<iframe>`s, which most sites won't permit under `Cross-Origin-Embedder-Policy: require-corp`. Safari also lacks `credentialless`. Tiers 0 and 1 don't depend on it.

## 3. Public API (Apple's Swift overlay, under DFX)

### Conventions (pinned)

- **Arguments are positional, in Apple's order.** This is the established convention in CryptoFX (`HKDF.expand(prk, info, count)`) and the device-families review (`new BTFXCentralManager(delegate, queue)`). There is one exception:
  - when an Apple signature has **two or more defaulted parameters in a row**, those go into one options object keyed by Apple's labels;
  - a single defaulted parameter stays positional;
  - the work closure is always the last argument.
- Examples:
  - `DispatchQueue(label:qos:attributes:autoreleaseFrequency:target:)` → `new DFXQueue(label)` or `new DFXQueue(label, { qos, attributes, autoreleaseFrequency, target })`;
  - `async(group:qos:flags:execute:)` → `queue.async(work)` or `queue.async({ group, qos, flags }, work)`;
  - `asyncAfter(deadline:qos:flags:execute:)` → `queue.asyncAfter(deadline, work)` or `queue.asyncAfter(deadline, { qos, flags }, work)`. A `DFXWallTime` argument selects Apple's `wallDeadline:` form; the type distinguishes them, as `wait(timeout:)` and `wait(wallTimeout:)` do;
  - `global(qos:)` → `DFXQueue.global()` or `DFXQueue.global(qos)`;
  - `notify(qos:flags:queue:execute:)` → `group.notify(queue, work)` or `group.notify(queue, { qos, flags }, work)`. `queue` is required, so it comes first;
  - `makeTimerSource(flags:queue:)` → `DFXSource.makeTimerSource()` or `DFXSource.makeTimerSource({ flags, queue })`.
- **Swift enums without payloads** become frozen string-constant objects, as `CPFXAlgorithm` does: `DFXQoSClass.userInitiated === "userInitiated"`.
- **Swift enums and structs with payloads, or static members**, become classes with static members or factories, as `CRFXSymmetricKeySize` does: `DFXTimeInterval.seconds(5)`, `DFXQoS.userInitiated`.
- **Option sets** take an array of members: `attributes: [DFXQueueAttributes.concurrent, DFXQueueAttributes.initiallyInactive]`.
- **Apple protocols are interfaces; Apple classes are classes.** The `DispatchSource*` protocols are interfaces, and the concrete source classes are internal.
- **Work is synchronous, as in Swift.** The `work` parameter is typed so that a function returning a `PromiseLike` is a type error. Swift rejects `async` closures here too. At runtime, a thenable return is reported once through `reportError` with the message "DispatchFX work items are synchronous. Use DFXGroup enter() and leave() around asynchronous work."
- **Dispatch has no error type; libdispatch traps.** DispatchFX throws a plain `Error` whose message starts with Apple's own wording, `"BUG IN CLIENT OF LIBDISPATCH: "`. It adds no public error class.
- **Time is a JavaScript `number`** of nanoseconds, not `UInt64`. It's exact up to 2^53 ns (104 days of uptime), which is beyond any page's lifetime. `DFXTime.distantFuture.uptimeNanoseconds` is `Number.MAX_SAFE_INTEGER`, and it compares as later than every other time.

### Types and files (`src/FX/DispatchFX/`)

| Apple | Ours | File | Members |
| --- | --- | --- | --- |
| `DispatchObject` | `DFXObject` (abstract) | `DFXObject.ts` | `activate()`, `suspend()`, `resume()`, `setTarget(queue)` |
| `DispatchQueue` | `DFXQueue` | `DFXQueue.ts` | `static main`, `static global(qos?)`, `static concurrentPerform(iterations, execute)`, `static getSpecific(key)`; constructor `(label, { qos?, attributes?, autoreleaseFrequency?, target? }?)`; `label`, `qos`; `async`, `sync` (returns `T`), `asyncAfter`, `setSpecific(key, value)`, `getSpecific(key)` |
| `DispatchQueue.Attributes` | `DFXQueueAttributes` | `DFXQueueAttributes.ts` | `.concurrent`, `.initiallyInactive` |
| `DispatchQueue.AutoreleaseFrequency` | `DFXQueueAutoreleaseFrequency` | `DFXQueueAutoreleaseFrequency.ts` | `.inherit`, `.workItem`, `.never` (accepted; no effect on the web, documented) |
| `DispatchQoS` | `DFXQoS` | `DFXQoS.ts` | `static background`, `utility`, `default`, `userInitiated`, `userInteractive`, `unspecified`; constructor `(qosClass, relativePriority)`; `qosClass`, `relativePriority` (−15…0) |
| `DispatchQoS.QoSClass` | `DFXQoSClass` | `DFXQoSClass.ts` | `background`, `utility`, `default`, `userInitiated`, `userInteractive`, `unspecified` |
| `DispatchWorkItem` | `DFXWorkItem` | `DFXWorkItem.ts` | constructor `(block)` or `({ qos?, flags? }, block)`; `perform()`, `wait()`, `wait(timeout: DFXTime \| DFXWallTime)`, `notify(queue, execute)` or `notify(queue, { qos?, flags? }, execute)`, `cancel()`, `isCancelled` |
| `DispatchWorkItemFlags` | `DFXWorkItemFlags` | `DFXWorkItemFlags.ts` | `.barrier`, `.detached`, `.assignCurrentContext`, `.noQoS`, `.inheritQoS`, `.enforceQoS` |
| `DispatchGroup` | `DFXGroup` | `DFXGroup.ts` | `enter()`, `leave()`, `notify(queue, work)` or `notify(queue, { qos?, flags? }, work)`, `wait()`, `wait(timeout: DFXTime \| DFXWallTime)` |
| `DispatchSemaphore` | `DFXSemaphore` | `DFXSemaphore.ts` | constructor `(value)`; `wait()`, `wait(timeout: DFXTime \| DFXWallTime)`, `signal()` → number |
| `DispatchTime` | `DFXTime` | `DFXTime.ts` | `static now()`, `static distantFuture`; constructor `(uptimeNanoseconds)`; `uptimeNanoseconds`, `advanced(by)`, `distance(to)`. Apple's own overlay defines these two; they stand in for its `+` and `-` operators. |
| `DispatchWallTime` | `DFXWallTime` | `DFXWallTime.ts` | `static now()`, `static distantFuture`; `advanced(by)`, `distance(to)`. The `timespec:` constructor is omitted, since the web has no `timespec`. |
| `DispatchTimeInterval` | `DFXTimeInterval` | `DFXTimeInterval.ts` | `static seconds(n)`, `milliseconds(n)`, `microseconds(n)`, `nanoseconds(n)`, `static never` |
| `DispatchTimeoutResult` | `DFXTimeoutResult` | `DFXTimeoutResult.ts` | `success`, `timedOut` |
| `DispatchSpecificKey<T>` | `DFXSpecificKey<T>` | `DFXSpecificKey.ts` | constructor `()` |
| `DispatchPredicate` | `DFXPredicate` | `DFXPredicate.ts` | `static onQueue(q)`, `onQueueAsBarrier(q)`, `notOnQueue(q)` |
| `dispatchPrecondition(condition:)` | `dispatchPrecondition(condition)` | `dispatchPrecondition.ts` | A free function under Apple's own name (owner decision, 8 November). |
| `DispatchSource` | `DFXSource` | `DFXSource.ts` | `static makeTimerSource({ flags?, queue? }?)`, `makeUserDataAddSource(queue?)`, `makeUserDataOrSource(queue?)`, `makeUserDataReplaceSource(queue?)`, `makeMemoryPressureSource(eventMask, queue?)` |
| `DispatchSourceProtocol` | `DFXSourceProtocol` | `DFXSourceProtocol.ts` | `setEventHandler(handler)` or `setEventHandler({ qos?, flags? }, handler)`; `setCancelHandler`, `setRegistrationHandler` (same overloads); `activate()`, `resume()`, `suspend()`, `cancel()`, `isCancelled` |
| `DispatchSourceTimer` | `DFXSourceTimer` | `DFXSourceTimer.ts` | `schedule(deadline: DFXTime \| DFXWallTime, { repeating?, leeway? }?)` |
| `DispatchSource.TimerFlags` | `DFXSourceTimerFlags` | `DFXSourceTimerFlags.ts` | `.strict` |
| `DispatchSourceUserDataAdd` / `Or` / `Replace` | `DFXSourceUserDataAdd` / `Or` / `Replace` | one file each | `add(data)` / `or(data)` / `replace(data)`; `data` |
| `DispatchSourceMemoryPressure` | `DFXSourceMemoryPressure` | `DFXSourceMemoryPressure.ts` | `data`, `mask` |
| `DispatchSource.MemoryPressureEvent` | `DFXSourceMemoryPressureEvent` | `DFXSourceMemoryPressureEvent.ts` | `.normal`, `.warning`, `.critical`, `.all` |

**Not mirrored** (owner decision, 8 November: leave out and list, as with VR in XRFX):
- File-descriptor, Mach and POSIX-signal sources: `makeReadSource`, `makeWriteSource`, `makeFileSystemObjectSource`, `makeSignalSource`, `makeMachSendSource`, `makeMachReceiveSource`. The web has no file descriptors.
- `makeProcessSource`.
- `DispatchIO`.
- `DispatchData`. `NSEData` already covers bytes.
- `DispatchWorkloop`.
- `DispatchQueue.SchedulerTimeType`. It's Combine, and there's no Combine.

## 4. Semantics (Tier 0, in-realm)

### The scheduler

There is one internal root scheduler per page. Each QoS class drains in priority order: `userInteractive` > `userInitiated` > `default` > `utility` > `background`. Within a class, items are ordered by `relativePriority`, then FIFO.

It hops between tasks with `scheduler.postTask` when it exists (Chromium 94+, Firefox 142+):

| QoS | postTask priority |
| --- | --- |
| `userInteractive`, `userInitiated` | `"user-blocking"` |
| `default` | `"user-visible"` |
| `utility`, `background` | `"background"` |

Otherwise (Safari) it falls back to the MessageChannel task already used by `browserHostYield.ts`, and to `setTimeout(0)` for the background priority.

### The main queue

`DFXQueue.main` is serial and runs on the main thread at `userInteractive`.
- If a `DFXQueue.main.async` happens during a main-queue item, the new item runs after the current item returns and before the next frame's input, never re-entrantly.

### Time slicing

The drainer runs items until **5 ms** of the current task has elapsed, then yields. It yields with `scheduler.yield()` where available, and otherwise with a fresh task.
- A single item is never interrupted: work items are atomic, as in GCD.
- `userInteractive` items never yield to each other.

### Serial and concurrent queues

- **Serial queues:** at most one item in flight, FIFO.
- **Concurrent queues:** items start in FIFO order and may overlap only in Tier 1 and above. In-realm they run one after another, which is a legal concurrent schedule.
- **Barriers:** a `.barrier` item starts only after every earlier item on that queue has completed, including worker-side ones. No later item starts until the barrier completes.
- **Global queues** ignore `.barrier`, as Apple's do.

### Target queues and QoS

- A queue submits its items to its target. The root targets are the global queues.
- An item's effective QoS follows Apple's resolution: the item's own QoS, the queue's QoS, `.inheritQoS` and `.enforceQoS`. These are tested case by case against Apple's documented table.

### Suspension and activation

- `suspend()` and `resume()` are counted. Resuming more than suspending throws the libdispatch "over-resume" message.
- `.initiallyInactive` queues hold their items until `activate()`.

### sync

`sync` runs the block on the caller's thread, as GCD does.

**In-realm,** `queue.sync(block)`:
1. synchronously drains that queue's earlier pending items, in order;
2. runs the block;
3. returns its result.

Draining early is a legal schedule: GCD may run any queue's items whenever ordering and exclusivity permit.

**`sync` throws the libdispatch message instead when:**
- the target is the current queue, or any queue on the current execution stack (deadlock: "dispatch_sync called on queue already owned by current thread");
- the target has an item in flight on a worker;
- the target is the main queue and the caller isn't already on the main thread. That's the worker side, which only Tier 2 can wait on.

### Blocking members on the main thread

This covers `DFXSemaphore.wait`, `DFXGroup.wait` and `DFXWorkItem.wait`.

**They succeed when no wait is needed:**
- a semaphore whose count is above 0;
- a group whose entered work is all in-realm and drainable;
- a work item that is complete, or pending in-realm and drainable as `sync` drains.

**Otherwise:**
- with timeout `DFXTime.now()`, they return `DFXTimeoutResult.timedOut`;
- with any later timeout, they throw `"BUG IN CLIENT OF LIBDISPATCH: blocking wait on the main thread cannot be satisfied in the browser; use notify(queue:)"`.

Apple discourages blocking the main thread for the same reason. `notify` is the documented non-blocking form.

### asyncAfter and timer sources

- `DFXTime` is based on `performance.now()`. `DFXWallTime` is based on `Date.now()`.
- **Leeway** lets timers whose windows overlap share one host timer, a power saving Apple's timers make too.
- **`.strict` timers** never coalesce.
- **Repeating timers** don't drift. Each fire is scheduled from the original deadline plus n × interval, not from the previous fire.

### concurrentPerform

In-realm it runs `execute(0…n−1)` synchronously, in order, and returns when done. That's Apple's blocking contract and a legal schedule.
- It's parallel only in Tier 2, when called on a worker.

### Specifics and preconditions

These read the current execution stack of queues. The scheduler maintains that stack while an item runs. It's never ambient state across `await`, because work items are synchronous.

### Memory pressure source

It's backed by the runtime's existing memory signal, if `BrowserRuntimeEnvironment` exposes one. If not, the source can be created and is documented as never firing.
- It must never fake events.

### Per-app binding and lifetime (option A)

DispatchFX follows the per-app module binding built in the FX fidelity job.
- **Per-app binding:**
  - `DFXQueue.main`, `DFXQueue.global()` and `new DFXQueue(…)` imported inside an app bundle are bound to that app.
  - There's one shared physical scheduler and worker pool, but every item carries its app's bundle identifier.
- **When the app's session ends:**
  - its pending items are dropped;
  - its sources are cancelled, with cancel handlers run, as Apple does on cancel;
  - its timers are cleared;
  - its worker items stop delivering results;
  - a worker still running one of its items 2 s after the session ends is terminated and replaced.
- **Framework code** (ImageFX and the others) uses an internal system binding, never the app entry.

## 5. Tier 1: sendable closures on a worker pool

### The problem

A JavaScript closure can't cross to a worker. Its code can be rebuilt there, but its captured variables live in the main heap. Swift has the same problem across isolation domains and solves it with `@Sendable`:
- a sendable closure may capture only values that are safe to copy;
- it may not mutate captured variables.

DispatchFX applies the same rule, checked at build time.

### Build-time closure conversion

This lives in the SynWare Vite plugin, in a new transform module.

**1. Candidates.** A candidate is a function literal passed as the work argument to:
- `.async(`, `.asyncAfter(`, `.concurrentPerform(`, `.notify(` or `.setEventHandler(`;
- `new DFXWorkItem(`;

in a module that imports from `@syndromatic/syncloudos/fx/dispatch`.

**2. Annotate, don't replace.** The plugin wraps each candidate:

```js
__dfxSendable(fn, "<moduleId>#<index>", () => [capturedA, capturedB])
```

The helper returns `fn` itself, with a hidden symbol holding the closure id and the capture getter.
- A receiver that isn't DispatchFX just calls `fn`, so no semantics change and false positives are harmless.

**3. The sendability check** (syntactic, on Rollup's ESTree AST). The closure's free variables must each be one of:
- an import from a **worker-safe module** (below), re-imported in the worker chunk;
- a module-level `const` initialised by a literal;
- a captured local or parameter that the closure never assigns to. It's captured **by value**, by structured clone, when the work is dispatched.
  - **Captures are never transferred.** Transferring would detach the caller's buffer, so main-thread code that still holds that `NSEData` would break.
  - **Under cross-origin isolation, `NSEData` can be shared without copying** by backing it with a `SharedArrayBuffer`. That's safe because `NSEData` is immutable.
  - **Values coming back are transferred** (results and continuation `workerValues`), because the worker-side originals are dead after the item ends.
- a worker global: `Math`, `JSON`, `crypto`, `fetch`, `OffscreenCanvas`, `TextEncoder`, and the rest of the WorkerGlobalScope allow-list in the transform.

`this`, `arguments`, `document`, `window`, `localStorage` and any free variable outside those classes make the closure **not sendable**.

**4. Nested main-thread continuations.**
- **Inside a sendable closure,** a function literal passed to `DFXQueue.main.async`, or to `notify(DFXQueue.main, …)`, becomes a **continuation**.
- **The plugin hoists the continuation to the outer dispatch site on the main thread** as `__dfxContinuation(id, (workerValues) => body)`.
- **Free variables:** the hoisted function keeps its main-side free variables by reference, through the normal lexical scope at dispatch time. Free variables that are worker-side locals arrive as `workerValues`, which must be cloneable.
- **Order:** the worker posts `{ continuationId, workerValues }`, and the main queue runs the continuation in order.

This is how `global.async { work; DispatchQueue.main.async { update UI } }`, the commonest GCD idiom, works unchanged.

**5. Fallback.** A candidate that fails the check stays in-realm: it runs on the main thread at its QoS.
- **Diagnostic:** the build prints `file:line`, the closure, and the exact reason. For example: "captures `view` (an NSEView); move UI work into DFXQueue.main.async".
- **Determinism:** the decision is static, so the same build behaves the same every time.
- **Strict mode:** the project option `syncloudos({ dispatch: { strict: true } })` turns diagnostics into build errors. It's a build setting, not Dispatch API.

**6. Mutation safety.** Values captured by clone are deep-frozen in the worker before the closure runs. Typed-array and `NSEData` contents are exempt: `NSEData` is immutable, and typed-array buffers are transferred.
- Mutating a captured copy therefore throws, because modules are strict, instead of silently diverging from main.

**7. Worker-safe modules.** These are modules whose import graph never reaches React, NSE or DOM-only code:
- **Framework.** The framework declares a list, `src/FX/DispatchFX/internal/workerSafeEntries.json`:
  - `@syndromatic/syncloudos/fx/dispatch`;
  - `/foundation` (minus `NSEUserDefaults`, which needs `localStorage`);
  - `/fx/crypto`;
  - `/fx/compression`;
  - ImageFX's kernel entry, if one exists.

  A Chromium test loads each one in a real module worker.
- **App modules.** An app module is worker-safe when the plugin's graph walk finds no non-worker-safe import.

**8. Worker chunks.** Per app, the plugin emits one worker entry containing that app's extracted closures and their imports. The pool loads it lazily, the first time that app dispatches a sendable item.

### The pool

**Size:** `max(1, min(navigator.hardwareConcurrency − 1, 8))` module workers.
- They spawn lazily.
- A worker is terminated after **30 s** idle.

**Scheduling:**
- A free worker takes the highest-QoS pending item.
- `utility` and `background` items may occupy at most `ceil(poolSize / 2)` workers, so user-initiated work always finds a free thread. This is GCD's per-QoS width limiting.

**Serial queues:**
- A serial queue whose items are sendable runs them on whichever worker is free, one at a time, in order.
- A serial queue created with internal framework state can be pinned to one dedicated worker (`internal/dedicatedThread.ts`), for stateful services such as the Lumina index.

**Message cost:**
- **Batching.** Items bound for the same worker within one scheduler turn are posted as one message, not one message each. Per-message overhead, not per-item work, dominates small items.
- **Affinity.** A serial queue's items prefer the worker that ran its previous item, which keeps that worker's module graph and JIT warm.

**Cancellation:**
- A cancelled `DFXWorkItem` that hasn't started is removed.
- One that's already running finishes. Its result and continuations are dropped, because GCD can't interrupt a running block either.

## 6. Tier 2: blocking on workers (only with cross-origin isolation)

These apply when `crossOriginIsolated` is true and the code is running on a pool worker:
- **`DFXSemaphore`, `DFXGroup.wait`, `DFXWorkItem.wait` and `sync`** to another worker-backed queue use `SharedArrayBuffer` words and `Atomics.wait`. They block exactly as on Apple platforms.
- **`concurrentPerform`** splits its iterations across idle pool workers. The calling worker blocks until all are done. Apple's guidance is to call it from a global queue, which is exactly this case.
- **On the main thread, nothing changes.** `Atomics.wait` is forbidden there, and the §4 rules apply.
- **Without isolation,** these members behave as in-realm on that worker: `concurrentPerform` loops sequentially, still off the main thread.

## 6a. GCD's known failures, and what DispatchFX does instead

The architecture and API are Apple's. Apple's failure modes are not part of the contract. Each one below is documented: in WWDC21 "Swift concurrency: Behind the scenes", WWDC17 "Modernizing Grand Central Dispatch Usage", and the libdispatch crash messages.

| GCD failure | Why it happens on Apple platforms | DispatchFX |
| --- | --- | --- |
| **Thread explosion** | A blocked GCD thread makes the kernel spawn another, so a burst of blocking work overcommits far past the core count, with the memory and context-switch costs that brings. Apple built Swift Concurrency's cooperative pool, capped at one thread per core, mainly to fix this. | **The pool is fixed** (§5): `max(1, min(cores − 1, 8))`. It never grows for non-blocking work. |
| **Pool starvation and deadlock**, the mirror image of thread explosion | In a capped pool, workers that all block waiting on work still queued behind them never wake. Swift's cooperative pool has the same hazard, which `LIBDISPATCH_COOPERATIVE_POOL_STRICT` exists to catch. | **Tier 2 only, since only workers can block.** A worker announces itself before `Atomics.wait`. If every pool worker is blocked and runnable work is pending, the pool adds **one** overcommit worker at a time, up to a hard cap of 2 × the pool size. At the cap it throws the libdispatch-style message naming the blocked queues and their waits, instead of hanging silently. `concurrentPerform`'s caller runs iterations itself rather than waiting idle, as libdispatch does. |
| **Priority inversion** | A `.userInteractive` caller syncs to, or waits on, a serial queue whose earlier items are `.background`. | **QoS override, as Apple does.** When a higher-QoS item syncs to, waits on, or is blocked behind a barrier on a lower-QoS queue, the items ahead of it run at the waiter's QoS until it proceeds. The same applies to a main-queue continuation waiting for a background worker item. |
| **Deadlock crashes** (`dispatch_sync` onto the current queue) | The process traps with "BUG IN CLIENT OF LIBDISPATCH". | **The same detection** (§4), but it throws with the full queue chain in the message, so it never takes down the page. |
| **An exception in a block kills the process** | An uncaught exception in any block terminates the app. | **The item's exception is reported** through `reportError` with the queue label and the dispatch-site stack. The queue continues with its next item. Worker exceptions come back with name, message and stack, source-mapped in dev. |
| **Callback pyramids** (`global.async { … main.async { … } }`) | Nesting is the only composition GCD offers. Apple's answer was Swift Concurrency. | DispatchFX keeps Apple's API: `async` returns nothing, and we don't add `await queue.async(…)`, which would be an invented member. **Apple's own answer is the follow-on** (§12): a Swift Concurrency mirror (`Task`, `TaskGroup`, `MainActor`) built on the same scheduler and pool. JavaScript's `async`/`await` maps onto it directly. |
| **Queue proliferation and context switching** | Hundreds of queues each wake threads. Apple's guidance is a few queues, arranged in target hierarchies. | **One root scheduler, batched worker messages and serial-queue affinity** (§5). Queues are cheap bookkeeping objects, not threads. |
| **Unbalanced `enter`/`leave`** | Crashes ("Unbalanced call to dispatch_group_leave()"), or leaks a group that never notifies. | **`leave()` without `enter()` throws Apple's message.** In dev, a group still entered when its app's session ends is reported with the `enter()` call site. |
| **Semaphores used to make async code synchronous** | An anti-pattern Apple warns against: it blocks threads and inverts priorities. | **Impossible on the main thread by design** (§4). On workers it's allowed only in Tier 2, under starvation detection. |
| **Opaque async debugging** | Backtraces stop at the queue boundary. Xcode later added enqueue backtraces. | **Each item is wrapped in `console.createTask(label)`** (Chrome 106+, feature-detected), so DevTools shows the dispatch site under the execution stack. In dev, each item records a `performance.measure` named `"DFX <queue label>"`. Workers are named `"DispatchFX <n>"`. |

## 6b. Prior art, and where DispatchFX is new

**Prior art, accurately:**
- **Comlink** (Google Chrome Labs). RPC proxies over `postMessage`: a worker's exports become `await`able. No scheduling, priorities, closures or pool.
- **workerpool, greenlet, closure-worker.** These serialise a function's *source* to a worker. Captured variables are lost or must be passed by hand.
- **Piscina.** A worker pool for **Node.js** `worker_threads`, not for browsers. Gemini cited it as a browser alternative, which it isn't.
- **p-queue.** Promise concurrency limits and priorities, all in-realm, with no workers.
- **React's scheduler.** In-realm priority levels with ~5 ms time slices. DispatchFX's main-thread slicing matches its budget deliberately.
- **Qwik's optimizer.** The closest prior art for §5's transform. It extracts closures marked with `$` into separate chunks and restores their captured lexical scope, which must be `const` and serialisable. It does this for lazy loading, not threads.
- **`use-worker-directive` and `babel-plugin-parallel-es`.** Compilers that move a marked function into a worker and pass its captures. So "a build plugin that moves closures to workers" is **not new by itself**, whatever Gemini suggests.
- **TC39 module expressions and shared structs.** Both are Stage 2 with no recent movement. Module expressions would be the platform's native answer to "send code to a worker". The transform keeps its output shape close to them, so it can switch when they ship.

**What is new:** the combination, and the parts nobody else does:
- Apple's complete Dispatch semantics on the web: serial and concurrent queues, barriers, target hierarchies, QoS resolution and override, groups, semaphores, sources, specifics and preconditions;
- one scheduler spanning main-thread time slicing and a worker pool;
- **hoisting nested `DFXQueue.main.async` continuations back onto the main thread with their main-side scope intact**. None of the closure compilers above handles the commonest GCD idiom;
- deterministic, explained fallbacks instead of runtime surprises;
- per-app lifetime;
- the failure-mode fixes in §6a.

## 7. Measure first, adopt second

Task 7 builds a Chromium benchmark harness before any framework subsystem adopts DispatchFX.

**Recorded per workload:**
- the longest main-thread task (via a `longtask` PerformanceObserver);
- p95 main-thread input latency during the workload (via synthetic `pointerdown` events every 50 ms);
- total wall time.

**Workloads:**
- an ImageFX Gaussian blur on a 12-megapixel image;
- opening a 200-page PDF in GraphicsFX;
- indexing 5,000 Lumina documents;
- VideoFX frame processing of a 10 s 1080p clip;
- one SHA-256 of 200 MB, as a control: Web Crypto is already off-thread, so DispatchFX should show no gain;
- a `concurrentPerform` Mandelbrot (2048²), Tier 2 only.

**The crossover table.** Round-trip time for payloads of 1 KB, 64 KB, 1 MB, 16 MB and 128 MB, by three methods:
- structured clone;
- transfer;
- `SharedArrayBuffer`.

This table sets the payload size below which framework code should not dispatch to a worker.

**The adoption bar.** A subsystem adopts DispatchFX only if its benchmark shows both:
- the longest main-thread task falls by at least 50%;
- total wall time regresses by no more than 10%.

Results go in `docs/superpowers/evidence/<date>-dispatchfx/benchmarks.md`, before and after.

## 8. Framework adoption

**In order, each behind the adoption bar:**
1. **ImageFX processing** (`BrowserImageProcessingWorker`) → a global queue at `userInitiated`.
2. **VideoFX processing** (`VideoWorkerTransport`) → a serial queue per video at `userInitiated`.
3. **The GraphicsFX PDF document worker** (`BrowserPDFDocumentWorker`) → a global queue at `userInitiated`.
4. **The Lumina index** (`WorkerLuminaIndexBackend`) → a serial queue on a dedicated thread at `utility`.

**Not adopted:**
- **pdf.js's own worker:** a third-party protocol.
- **`BrowserRecoveryWatchdog`:** it must stay independent of the scheduler it watches.

Each adoption deletes its hand-rolled request, cancel and transfer protocol. It must not change public ImageFX, VideoFX, GraphicsFX or Lumina API.

## 9. Owner questions

1. **Cross-origin isolation for the site (Tier 2).** It needs `Cross-Origin-Opener-Policy: same-origin` plus `Cross-Origin-Embedder-Policy: require-corp`, served by `site/worker/index.ts`.
   - **What it breaks:**
     - `NSEWebView` embedding any cross-origin page that doesn't opt in, which is nearly all of them;
     - any cross-origin subresource without CORP;
     - Safari has no `credentialless` escape hatch.
   - **Options:**
     - (a) never;
     - (b) per deployment, opt-in, with `NSEWebView` failing visibly when isolated;
     - (c) later, once `credentialless` is in all engines.
   - **Recommendation: (c), keeping the Tier 2 code built and tested behind isolation in the test harness only.**
2. **Strict mode default.** Should non-sendable closures warn (recommended) or fail the build by default?
3. **The Swift Concurrency follow-on (§12).** Approve it as the next job after DispatchFX, and choose its prefix.

### Decided by the owner (8 November)

- **Order.** Option A, then DispatchFX's in-realm core (plan Tasks 1–6), then the device families. That way the families take `DFXQueue` where Apple takes a `DispatchQueue`. Tasks 7 onwards (benchmarks, pool, closure conversion, Tier 2, adoption) follow the families.
- **App Nap.** Yes. Hidden or minimised apps have their global-queue QoS lowered, as a follow-up after the benchmarks. It isn't part of the core.
- **Omitted Apple types.** Leave them out and list them (§3).
- **`dispatchPrecondition`.** Apple's unprefixed name.

## 10. Risks

- **Closure conversion is a compiler pass.** Bugs in capture analysis would be correctness bugs.
  - **Mitigation:** the transform is annotate-only, so a non-dispatch receiver is unaffected. Every rejection has a reason, and the transform gets its own fixture suite of 40 or more closure shapes.
- **Worker bundle bloat.** Each app's worker chunk carries its closures' imports.
  - **Mitigation:** the per-app chunk is lazy, and the benchmark records chunk sizes.
- **Two scheduling worlds.** Dispatch and React both schedule work.
  - **Mitigation:** DispatchFX never calls into React. UI updates happen inside main-queue items, as on Apple platforms, and React batches them.
- **Option A dependency.** DispatchFX starts only after the FX fidelity job's per-app binding (`bindFXFamily`) is merged and reviewed.

## 11. Is Gemini right that "Apple moved away from GCD"?

**Half right.**
- Since Swift 5.5 (2021), Apple has recommended Swift Concurrency for new Swift code, mainly because of thread explosion and callback nesting.
- But **GCD was never deprecated.** On Apple platforms, Swift Concurrency's default executors are built on it: the cooperative pool lives in libdispatch, and the strict-pool switch is a libdispatch environment variable. Apple's frameworks still use queues throughout, and AppKit code still uses `DispatchQueue.main` every day.

So the faithful move isn't to choose one. It's what Apple did: build Dispatch as the engine, then put the modern Swift Concurrency API on top of it.

## 12. Follow-on: the Swift Concurrency mirror (not in this job)

A separate job, after DispatchFX ships and its benchmarks pass. It mirrors Swift's own concurrency API on the DispatchFX engine.

**The mapping:**
- `Task(priority:operation:)` → a Promise-backed task. `await task.value`.
- `Task.detached` → a sendable closure on the pool.
- `TaskPriority` → the same QoS table.
- `withTaskGroup` / `withThrowingTaskGroup` → structured parallel work with cooperative cancellation.
- `Task.isCancelled`, `Task.checkCancellation()` and `Task.yield()` → `scheduler.yield()` on the main thread.
- `Task.sleep(for:)`.
- `MainActor.run`.

**Why it fits:**
- **JavaScript's `async`/`await` is already shaped like Swift's.** This is the part of Gemini's advice worth taking. It removes the callback pyramid without inventing members on `DFXQueue`.
- **The engine carries over.** It runs on DispatchFX's scheduler and pool, and uses the same closure conversion for `Task.detached`.

The prefix is owner question 3.
