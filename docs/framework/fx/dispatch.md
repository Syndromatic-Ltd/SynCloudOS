# DispatchFX

DispatchFX schedules your app's work on queues. Use it to order synchronous steps, prioritise work by quality of service (QoS), wait for a batch of jobs with a group, run something after a delay, or react to timers and coalesced events through sources. Every other FX framework delivers its callbacks on a `DFXQueue`, so you will meet it early. The model is libdispatch's (GCD's), so if you know that, the names will be familiar.

Import from `@syndromatic/syncloudos/fx/dispatch`. Arguments are positional; where several trailing arguments have defaults, they are gathered into one options object and the work closure comes last.

```ts
import { DFXTime, DFXTimeInterval, DFXQoS, DFXQoSClass } from "@syndromatic/syncloudos/fx/dispatch";

const deadline = DFXTime.now().advanced(DFXTimeInterval.milliseconds(5));
const priority = new DFXQoS(DFXQoSClass.utility, -5);
```

## API at a glance

| Export | Members |
| --- | --- |
| `DFXTime` | `new DFXTime(uptimeNanoseconds)`, `now()`, `distantFuture`, `uptimeNanoseconds`, `advanced(by)`, `distance(to)` |
| `DFXWallTime` | `now()`, `distantFuture`, `rawValue`, `advanced(by)`, `distance(to)` |
| `DFXTimeInterval` | `seconds(n)`, `milliseconds(n)`, `microseconds(n)`, `nanoseconds(n)`, `never` |
| `DFXTimeoutResult` | `success`, `timedOut` |
| `DFXQoS` | `new DFXQoS(qosClass, relativePriority)`, `qosClass`, `relativePriority`, and a constant for each class (for example `DFXQoS.utility`) |
| `DFXQoSClass` | `background`, `utility`, `default`, `userInitiated`, `userInteractive`, `unspecified` |
| `DFXQueueAttributes` | `concurrent`, `initiallyInactive` |
| `DFXQueueAutoreleaseFrequency` | `inherit`, `workItem`, `never` (accepted for compatibility; JavaScript has no autorelease pools) |
| `DFXWorkItemFlags` | `barrier`, `detached`, `assignCurrentContext`, `noQoS`, `inheritQoS`, `enforceQoS` |
| `DFXSpecificKey<T>` | `new DFXSpecificKey<T>()`, compared by identity |
| `DFXSourceTimerFlags` | `strict` |
| `DFXSourceMemoryPressureEvent` | `normal`, `warning`, `critical`, `all` |
| `DFXObject` | Abstract base with `activate()`, `suspend()`, `resume()`, `setTarget(queueOrNull)` |
| `DFXQueue` | `new DFXQueue(label, options?)`, `main`, `global(qosClass?)`, `concurrentPerform(iterations, execute)`, static `getSpecific(key)`; `label`, `qos`, `async(work)`, `async({ group?, qos?, flags? }, work)`, `async(item)`, `async(group, item)`, `asyncAfter(deadline, work)`, `asyncAfter(deadline, { qos?, flags? }, work)`, `asyncAfter(deadline, item)`, `sync(item)`, `sync(work)`, `sync(flags, work)`, `setSpecific(key, value)`, `getSpecific(key)` |
| `DFXPredicate`, `dispatchPrecondition` | `onQueue(queue)`, `onQueueAsBarrier(queue)`, `notOnQueue(queue)`; `dispatchPrecondition(condition)` |
| `DFXWorkItem` | `new DFXWorkItem(block)`, `new DFXWorkItem({ qos?, flags? }, block)`, `perform()`, `wait()`, `wait(timeout)`, `notify(queue, work)`, `notify(queue, { qos?, flags? }, work)`, `notify(queue, item)`, `cancel()`, `isCancelled` |
| `DFXGroup` | `new DFXGroup()`, `enter()`, `leave()`, `wait()`, `wait(timeout)`, `notify(queue, work)`, `notify(queue, { qos?, flags? }, work)`, `notify(queue, item)`; extends `DFXObject` |
| `DFXSemaphore` | `new DFXSemaphore(value)`, `wait()`, `wait(timeout)`, `signal(): number`; extends `DFXObject` |
| `DFXSource` | Protected constructor; factories `makeTimerSource({ flags?, queue? }?)`, `makeUserDataAddSource(queue?)`, `makeUserDataOrSource(queue?)`, `makeUserDataReplaceSource(queue?)`, `makeMemoryPressureSource(eventMask, queue?)` |
| `DFXSourceProtocol` | Interface: `handle`, `mask`, `data`, `isCancelled`, `cancel()`, the `DFXObject` lifecycle members, and `setEventHandler`, `setCancelHandler`, `setRegistrationHandler`, each taking a handler, `({ qos?, flags? }, handler)` or a work item |
| `DFXSourceTimer` | Numeric `data` and `mask`; `schedule(deadline, { repeating?, leeway? }?)` |
| `DFXSourceUserDataAdd`, `DFXSourceUserDataOr`, `DFXSourceUserDataReplace` | Numeric `data` and `mask`; `add(data)`, `or(data)`, `replace(data)` |
| `DFXSourceMemoryPressure` | `data` and `mask` as arrays of events |

## Queues

```ts
import { DFXQueue, DFXQoS, DFXQoSClass, DFXQueueAttributes, DFXWorkItemFlags } from "@syndromatic/syncloudos/fx/dispatch";

const preparation = new DFXQueue("example.preparation", {
  qos: DFXQoS.utility,
  attributes: [DFXQueueAttributes.concurrent],
});
preparation.async(() => { /* one atomic synchronous step */ });
preparation.async({ flags: [DFXWorkItemFlags.barrier] }, () => { /* commit the earlier steps */ });
DFXQueue.global(DFXQoSClass.background).async(() => { /* background step */ });
DFXQueue.main.async(() => { /* update the UI once earlier main items return */ });
const result = preparation.sync(() => 42); // runs now and returns 42
preparation.sync([DFXWorkItemFlags.barrier], () => { /* ordered commit */ });
DFXQueue.concurrentPerform(3, index => { /* runs 0, 1, 2 before returning */ });
```

Queue options are `qos`, `attributes`, `autoreleaseFrequency` and `target`. A new queue is serial with `DFXQoS.unspecified`; its `qos` property reports what you assigned, though work can inherit a higher QoS from its target. `DFXQueue.main` is serial at `userInteractive`. `DFXQueue.global(qosClass)` takes a `DFXQoSClass` and defaults to `default`.

Barriers order earlier and later work on a concurrent queue, including work that arrives through its target hierarchy. Global concurrent queues ignore barriers. `concurrentPerform` takes a non-negative safe integer and runs every iteration synchronously, in index order, on the calling thread.

### Scheduling

Each realm has one private scheduler. Ready queue heads run by QoS class (`userInteractive`, `userInitiated`, `default`, `utility`, `background`), then by higher relative priority, then in submission order. Each leaf queue is first in, first out, and a shared serial target runs one item at a time. A suspended or inactive child does not hold up independent work on a target that is otherwise free.

Each work item runs to completion. After 5 ms the scheduler yields to the browser between items, except between consecutive `userInteractive` items. A main-queue submission made from inside a main-queue item runs after the current item returns. Where the host has `scheduler.postTask`, the scheduler uses the `user-blocking`, `user-visible` and `background` priorities; elsewhere it uses the runtime's MessageChannel helper, or zero-delay timers for background work. A pending low-priority hop is promoted when higher-priority work becomes ready, and continuations use `scheduler.yield` when available.

### Work must be synchronous

TypeScript rejects work closures that return a `PromiseLike`, including unions with a `PromiseLike` member; plain synchronous return types are inferred as usual. If a thenable slips through at runtime, DispatchFX reports it once with `DispatchFX work items are synchronous. Use DFXGroup enter() and leave() around asynchronous work.` and consumes its rejection so it cannot surface a second time. For asynchronous work, use a group with manual `enter()` and `leave()`.

An `async` item that throws is reported with its queue label and the original error as `cause`, and later work carries on. A `sync` block's exception propagates to the caller. Errors go to `reportError`, or `console.error` where that is missing. When supported, `console.createTask` records where the work was submitted, and developer builds add `performance.measure("DFX " + label)`.

### Synchronous submission

`sync(work)` and `sync(flags, work)` run the block straight away and return its result. `flags` is the same array of `DFXWorkItemFlags` that `async` takes; there is no options-object form. Before running, `sync` drains any earlier work the block depends on (FIFO predecessors, serial targets and concurrent barriers) using each submission's saved target chain. Unrelated queues keep their normal scheduling. If the caller has a higher QoS, the predecessors and the block run at that QoS for the duration, without changing any queue's assigned `qos`.

`sync` throws an error starting `BUG IN CLIENT OF LIBDISPATCH: ` when the queue is already on the execution stack, when the caller holds an exclusive target, when a queue in the target chain has work running on a worker, or when the required predecessors cannot run synchronously. Deadlock errors list the full executing and requested label chains. Independent queues can `sync` through a shared global concurrent target. If a predecessor is suspended, inactive or otherwise cannot drain, `sync` fails promptly and the block is discarded.

## Running work on workers

Apps built with the SynCloudOS plugin can run some Dispatch closures off the main thread. At build time the plugin examines closures passed to `async` on queues other than `main`, to `notify` with a non-main queue, and to `new DFXWorkItem`. A closure that can be sent to a worker is compiled with the metadata DispatchFX needs. At runtime, if the host supports `Worker` and the queue's target chain does not include the main queue, that closure runs on a shared worker pool sized from `navigator.hardwareConcurrency`; otherwise it runs in the page as usual. Queue ordering, barriers and group accounting still apply, and `sync` refuses to drain a queue that has a worker item in flight.

A closure can be sent to a worker when:

- it is a plain function, not `async` or a generator;
- it does not use `this`, `super` or `arguments`;
- it only reads the variables it captures. Captures are copied with structured clone, so assigning to them, or calling methods on a captured class instance, is not allowed;
- the globals it uses are available in workers, and its imports come from worker-safe modules: `fx/dispatch`, `fx/crypto`, `fx/compression`, and Foundation (except `NSEUserDefaults`).

Inside such a closure, a call to `DFXQueue.main.async(...)` or `notify(DFXQueue.main, ...)` becomes a continuation: it runs back on the main thread with the values computed in the worker. A continuation may not assign to the worker's local variables.

Closures that do not qualify still work; they run in the page and the build prints a `DispatchFX closure not sendable` warning with the reason. Set the plugin option `dispatch: { strict: true }` to turn those warnings into build errors.

## Target queues, flags and lifetime

### QoS resolution

Asynchronous work defaults to `inheritQoS`: an explicitly assigned queue QoS wins over the item's own QoS. An unspecified queue uses the item's assigned QoS, or the QoS captured when it was submitted. Each target's assigned QoS acts as a floor. `enforceQoS` lets an item raise the queue to its own QoS and wins if both preference flags are set; it never lowers a queue or target floor. Relative priority breaks ties within a class, and the `default` class applies only when nothing was assigned or captured.

Ordinary `async` captures only the synchronous stack it was called from. `noQoS` and `detached` suppress that capture, and an explicit item QoS takes precedence. `noQoS` wins over `assignCurrentContext`. For a closure, `assignCurrentContext` refers to the submitting stack. A work item with `assignCurrentContext` captures the QoS at creation; other work items capture it when submitted. `sync(item)` uses `enforceQoS` unless the item chooses a preference. Calling `perform()` directly raises the caller's effective QoS when appropriate and restores the execution frame afterwards. No queue or application context survives an `await` or carries into a later microtask.

### Suspension, activation and targets

`suspend()` and `resume()` keep a count, and resuming more times than you suspended throws an error starting `BUG IN CLIENT OF LIBDISPATCH: `. A queue created with `initiallyInactive` holds its work until `activate()`. Activating twice is harmless and does not consume suspensions. Suspending, resuming or retargeting the main or a global queue has no effect.

`setTarget` rejects cycles. `target: null` in the constructor, and `setTarget(null)`, select the default global root queue (not the main queue); the assigned QoS still applies. Retargeting an inactive queue affects work already submitted; retargeting an active queue affects only later submissions. When an inactive ancestor changes target, existing work keeps its saved prefix through active queues and only the affected suffix updates. Changing the target of an initially inactive queue after activation is a client error. Setting a target on the main queue or a global queue is ignored.

### Application attribution

Inside a plugin-discovered `.app` bundle, the Queue, Group, WorkItem, Semaphore and Source classes you import are attributed to your app. Value types are not. Importing a class does not look up a session; the first constructor call or static queue lookup selects the live session, using the usual SCOS rules and rejecting ambiguity across runtimes. Constructing an unattributed base class throws an error, with the libdispatch prefix, explaining that the app must be compiled with the SynCloudOS plugin. Instances keep their base-class identity, and factory-made sources keep their app Source class identity.

Each app session owns its queues, pending jobs, delayed timers, sources and group bookkeeping. Each fresh read of `main` or `global()` follows the latest same-runtime session and rejects ambiguity, even while an older handle is still alive. A handle you hold keeps its session and becomes unusable when that session is aborted or removed. Constructing or retargeting a queue validates the whole target chain. A pending job watches every session in its saved chain and is dropped if any of them ends. A relaunch gets fresh handles from the same cached class. Jobs carry the bundle identifier and a private session token, so ending one session never discards another session's jobs.

When a session ends, DispatchFX drops pending work, clears delayed and source timers, suppresses notifications and cancels sources. Each source's cancel handler runs once on its queue, after any handler already running finishes; this final call runs even if the source or its queue was inactive or suspended, because the ended app cannot resume them. An ordinary `source.cancel()` still respects activation and suspension. Failures in handlers are reported once and clean-up continues. An item already running completes, including its automatic group leave. Developer builds report outstanding manual `enter()` calls with their call sites. Worker jobs for the ended session are cancelled.

Attribution is bookkeeping, not a permission. No promise, callback or ambient context is patched, and separate copies of the SDK keep separate registries.

## Work items, groups and semaphores

```ts
import { DFXGroup, DFXQueue, DFXTime, DFXWorkItem } from "@syndromatic/syncloudos/fx/dispatch";

const group = new DFXGroup();
const queue = new DFXQueue("example.group");
const item: DFXWorkItem = new DFXWorkItem(() => { /* synchronous preparation */ });
queue.async(group, item);
queue.async({ group }, () => { /* another synchronous step */ });
group.notify(DFXQueue.main, () => { /* every entry has left */ });
const status = item.wait(DFXTime.now());
```

`DFXWorkItem` is a standalone class; `DFXGroup` and `DFXSemaphore` extend `DFXObject`. `async(group, item)` is positional because both arguments are required. A closure's optional `group`, `qos` and `flags` go in one options object. `sync(item)` returns `void`; the closure overloads return the closure's result.

### Work items

`DFXWorkItem<R = unknown>` uses its type parameter only to reject a block that returns a `PromiseLike`, with the same check as queue closures. That applies to both constructors and to every `notify` overload. Other return values are accepted and discarded. A bare `DFXWorkItem` annotation, array or parameter accepts any instance. There is no result property. If you erase the type explicitly, the runtime check still reports a thenable once.

`cancel()` stops the body from running on future attempts. It does not interrupt a body already running. A cancelled item that is still queued completes when its turn comes and delivers its notifications. You can call `perform()` repeatedly, but `wait` and `notify` observe only the first completion. Notifications always go to their requested queue, even when registered after completion. If the body throws, the error is reported once and completion and group clean-up still happen. Completed or never-performed items do not keep the session alive, and abandoned items are not retained.

### Groups

Groups count manual `enter()`/`leave()` pairs and automatic queue submissions together. Every automatic entry leaves exactly once, including cancelled and throwing work. Leaving an empty group throws `BUG IN CLIENT OF LIBDISPATCH: Unbalanced call to dispatch_group_leave()`. A `notify` fires on the next transition to empty, or straight away if the group is already empty, and is not repeated for later cycles. Wrap external asynchronous work in a manual pair and use `notify` to learn when it is done.

### Waiting

`wait()` with no argument returns `void`. Passing a `DFXTime` or `DFXWallTime` selects the timeout form, which returns a `DFXTimeoutResult`. Work-item and group waits synchronously drain their registered in-realm jobs and any required predecessors; jobs a group member enrols while running are also eligible. The caller's temporary QoS boost and execution frames are restored even when a wait cannot finish, and blocked work stays queued.

A positive semaphore count, a completed item or an empty group succeeds immediately. Otherwise an expired timeout (including `now()`) returns `timedOut`, and a future or omitted timeout throws `BUG IN CLIENT OF LIBDISPATCH: blocking wait on the main thread cannot be satisfied in the browser; use notify(queue:)`. That covers unsubmitted or self-waiting items, manual group entries with nothing to drain, suspended or inactive predecessors, and work running on a worker. Waits do not pump browser events. Use `notify` when you need to wait for work that has not finished.

`DFXGroup.wait` has one extra safeguard. A group member could keep enrolling a successor forever, so the drain stops at the scheduler's 5 ms main-thread slice, checked between items. If the item that empties the group crosses the slice, the wait still succeeds. If work remains, pending entries and notifications stay intact and the normal rule applies: an expired timeout returns `timedOut`, and a future or omitted timeout throws. This can happen before a finite group would have emptied, even with `distantFuture`. Work-item waits and `sync` have no such slice.

A semaphore takes a non-negative safe integer. `signal()` increments the count and returns `0`, because no other thread can be blocked waiting on it. Overflowing the count is a client error.

## Specific values and preconditions

`queue.setSpecific(key, value)` stores a value against a key; `undefined` removes it. `queue.getSpecific(key)` looks only at that queue. The static `DFXQueue.getSpecific(key)` searches the queue currently executing and then its target chain, and returns `undefined` outside a work item. Global queues do not store values.

`dispatchPrecondition(DFXPredicate.onQueue(queue))` checks that the queue (or one of its targets) is on the synchronous execution stack, and `notOnQueue` checks that it is not. `onQueueAsBarrier` passes on a serial queue or inside a concurrent queue's barrier item; global concurrent queues ignore barriers. A failed check throws a client error naming the predicate and queue label.

## Delayed work and sources

`queue.asyncAfter(deadline, work)`, `asyncAfter(deadline, { qos?, flags? }, work)` and `asyncAfter(deadline, item)` take a `DFXTime`, or a `DFXWallTime` for a wall-clock deadline. The caller's QoS and DevTools task are captured at the call. When the deadline passes, the work joins the queue with the usual target, barrier and cancellation rules, so a busy or suspended queue may run it later. Delayed work and source handlers follow the same synchronous-return rule as `async`.

### Sources

A factory called with no queue, or `null`, uses the default global queue. Sources start inactive: call `activate()` (or `resume()` once) to begin delivery. Suspension is counted separately. The registration handler runs before any event, a source runs one handler at a time even on a concurrent queue, and cancellation discards queued events. `cancel()` can be called more than once and clears the source's timer immediately; the cancel handler runs once on the source's queue after any running handler returns, and an inactive or suspended source delivers it when activated or resumed. Pass `null` to a handler setter to clear it. `setTarget(null)` before activation restores the default global queue; retargeting after activation is a client error.

Replacing a handler before it runs swaps the whole pending invocation at once: body, QoS, flags, barrier, DevTools capture and work-item association. The old work item is removed without running or completing, so notifications belong to the item that actually runs. Clearing the handler with `null` suppresses the queued body. Once a handler has started, a replacement affects the next invocation. Cancellation and suspension are checked before any body runs.

### User-data sources

Values are non-negative safe integers. An Add source sums pending values, an Or source merges bits (beyond JavaScript's 32-bit bitwise limit), and a Replace source keeps the latest value. Adding or or-ing zero does nothing; replacing with zero stores it without requesting delivery. Pending data accumulates until a handler starts, and data arriving during a handler belongs to the next delivery. `data` is the current delivery's value and reads zero outside a handler. `handle` and `mask` are zero for user-data sources. A timer's `mask` is one when strict. Memory-pressure sources use arrays of `DFXSourceMemoryPressureEvent` values for `data` and `mask`.

### Timers

`schedule(deadline, { repeating?, leeway? })` accepts either clock. `repeating` defaults to `DFXTimeInterval.never` and also accepts a number of seconds, including `Infinity`; `leeway` defaults to zero. A zero repeat becomes one nanosecond. Negative or unrepresentable intervals are client errors. Rescheduling clears pending timer data.

Repeating timers keep their original phase. If the host wakes late, `data` counts every interval that elapsed and the next deadline follows the original phase, not the wake time. After the first fire, leeway is capped at half the interval. A suspended timer holds delivery while expirations accumulate.

Timers whose leeway windows overlap share one host timer; strict timers each get their own. Host delays are capped at 2,147,483,647 ms, after which the clock is rechecked and the remainder rearmed. A `distantFuture` deadline arms nothing. Browser timers are soft: throttling, a blocked event loop, millisecond wall-clock samples and clock changes can all delay delivery beyond the leeway.

### Memory pressure

The runtime environments expose `memory.sample()` through `RuntimeMemorySampler`, but there is no memory-pressure signal or event to subscribe to. Memory-pressure sources therefore never fire. DispatchFX does not poll the heap, listen for speculative browser events or invent pressure levels.

## Time values and limits

`DFXTime` holds monotonic uptime in nanoseconds as a JavaScript `number`. `now()` reads `performance.now()`, rounds down to whole nanoseconds and caps finite readings at `Number.MAX_SAFE_INTEGER - 1`. `distantFuture.uptimeNanoseconds` is `Number.MAX_SAFE_INTEGER`. That gives exact integer arithmetic for roughly 104 days of uptime. Advancing past the sentinel returns `distantFuture`, advancing below zero clamps to zero, and `distantFuture` stays in the future when advanced. Distances are signed nanosecond intervals.

`DFXWallTime.rawValue` is a `bigint`, because epoch nanoseconds already exceed the safe-integer range. It uses libdispatch's negative-epoch encoding, `2^64 - epochNanoseconds`, so raw values fall as time moves forward: compare wall times with `distance`, not by ordering `rawValue`. `distantFuture` is `2^64 - 1`. `Date.now()` is converted to `bigint` before scaling, so samples have millisecond resolution while later arithmetic is exact to the nanosecond.

Finite wall instants are clamped to epoch nanoseconds 2 through `2^62 - 2`; a sample or advance that reaches `2^62 - 1` returns `distantFuture`. There is no public wall-time constructor and no `uptimeNanoseconds` on `DFXWallTime`. Wall-time distances are computed exactly with `bigint` and then converted to a safe interval: finite results outside the safe range saturate at ±`Number.MAX_SAFE_INTEGER`, the distance to `distantFuture` is `never`, from `distantFuture` to a finite time is `-Number.MAX_SAFE_INTEGER`, and between two `distantFuture` values is zero.

Interval factories take signed safe integers in their unit and reject values that would overflow safe-integer nanoseconds. `never` is the only unbounded interval. QoS relative priorities are integers from -15 to 0. Invalid arguments throw an `Error` starting `BUG IN CLIENT OF LIBDISPATCH: `. Enums, option-set members and value instances are immutable.
