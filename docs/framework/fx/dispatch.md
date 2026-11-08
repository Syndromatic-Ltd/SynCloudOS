# DispatchFX

DispatchFX (`@syndromatic/syncloudos/fx/dispatch`) mirrors Apple's Dispatch types under `DFX`. It currently provides value types and synchronous in-realm queue scheduling. Arguments are positional in Apple's order; consecutive defaulted arguments use an options object, with work last.

```ts
import { DFXTime, DFXTimeInterval, DFXQoS, DFXQoSClass } from "@syndromatic/syncloudos/fx/dispatch";

const deadline = DFXTime.now().advanced(DFXTimeInterval.milliseconds(5));
const priority = new DFXQoS(DFXQoSClass.utility, -5);
```

| Export | Apple counterpart | Members |
| --- | --- | --- |
| `DFXTime` | `DispatchTime` | `new DFXTime(uptimeNanoseconds)`, `now()`, `distantFuture`, `uptimeNanoseconds`, `advanced(by)`, `distance(to)` |
| `DFXWallTime` | `DispatchWallTime` | `now()`, `distantFuture`, `rawValue`, `advanced(by)`, `distance(to)` |
| `DFXTimeInterval` | `DispatchTimeInterval` | `seconds(n)`, `milliseconds(n)`, `microseconds(n)`, `nanoseconds(n)`, `never` |
| `DFXTimeoutResult` | `DispatchTimeoutResult` | `success`, `timedOut` |
| `DFXQoS` | `DispatchQoS` | `new DFXQoS(qosClass, relativePriority)`, `qosClass`, `relativePriority`, standard class constants |
| `DFXQoSClass` | `DispatchQoS.QoSClass` | `background`, `utility`, `default`, `userInitiated`, `userInteractive`, `unspecified` |
| `DFXQueueAttributes` | `DispatchQueue.Attributes` | `concurrent`, `initiallyInactive` |
| `DFXQueueAutoreleaseFrequency` | `DispatchQueue.AutoreleaseFrequency` | `inherit`, `workItem`, `never` |
| `DFXWorkItemFlags` | `DispatchWorkItemFlags` | `barrier`, `detached`, `assignCurrentContext`, `noQoS`, `inheritQoS`, `enforceQoS` |
| `DFXSpecificKey<T>` | `DispatchSpecificKey<T>` | `new DFXSpecificKey<T>()`; identity-based key |
| `DFXSourceTimerFlags` | `DispatchSource.TimerFlags` | `strict` |
| `DFXSourceMemoryPressureEvent` | `DispatchSource.MemoryPressureEvent` | `normal`, `warning`, `critical`, `all` |
| `DFXObject` | `DispatchObject` | Abstract base; `activate()`, `suspend()`, `resume()`, `setTarget(queueOrNull)` |
| `DFXQueue` | `DispatchQueue` | `new DFXQueue(label, options?)`, `main`, `global(qosClass?)`, `concurrentPerform(iterations, execute)`, static `getSpecific(key)`; `label`, `qos`, `async(work)`, `async({ qos?, flags? }, work)`, `sync(work)`, `sync(flags, work)`, `setSpecific(key, value)`, `getSpecific(key)` |
| `DFXPredicate` | `DispatchPredicate` | `onQueue(queue)`, `onQueueAsBarrier(queue)`, `notOnQueue(queue)` |
| `dispatchPrecondition` | `dispatchPrecondition` | `dispatchPrecondition(condition)` |

## Queues and synchronous work

```ts
import { DFXQueue, DFXQoS, DFXQoSClass, DFXQueueAttributes, DFXWorkItemFlags } from "@syndromatic/syncloudos/fx/dispatch";

const preparation = new DFXQueue("example.preparation", {
  qos: DFXQoS.utility,
  attributes: [DFXQueueAttributes.concurrent],
});
preparation.async(() => { /* one atomic synchronous step */ });
preparation.async({ flags: [DFXWorkItemFlags.barrier] }, () => { /* commit prior steps */ });
DFXQueue.global(DFXQoSClass.background).async(() => { /* background step */ });
DFXQueue.main.async(() => { /* update UI after earlier main items return */ });
const result = preparation.sync(() => 42); // returns before the call completes
preparation.sync([DFXWorkItemFlags.barrier], () => { /* ordered commit */ });
DFXQueue.concurrentPerform(3, index => { /* finishes 0, 1, 2 before returning */ });
```

`global` accepts a `DFXQoSClass`, matching [Apple's signature](https://developer.apple.com/documentation/dispatch/dispatchqueue/global(qos:)). Queue options accept `qos`, `attributes`, `autoreleaseFrequency` and `target`. The default queue is serial and has `DFXQoS.unspecified`; `qos` reports that assigned value, while execution can inherit a target's QoS. `main` is serial at `userInteractive`. Concurrent queues use a legal sequential schedule in this tier; this implementation creates no workers and claims no parallel speed-up. Barriers order earlier and later work on a concurrent queue, including work arriving through its target hierarchy. Global concurrent queues ignore barriers. `concurrentPerform` requires a non-negative safe integer and runs every iteration synchronously in index order.

Each realm has one private scheduler. Ready queue heads run by QoS class (`userInteractive`, `userInitiated`, `default`, `utility`, `background`), descending relative priority, then submission order. Leaf queues preserve FIFO; shared serial targets preserve exclusivity. Suspended and inactive children do not stall independent work on an otherwise runnable target. Work is atomic: after 5 ms the scheduler yields between items, except between successive `userInteractive` items. Nested main submissions run after the current main item returns. Hosts with `scheduler.postTask` receive `user-blocking`, `user-visible` or `background` priorities. Other hosts use the same MessageChannel helper as the runtime, or zero-delay timers for background tasks. A pending low-priority hop is promoted when higher-priority work becomes runnable; obsolete hops cannot drain again. Slice continuations prefer `scheduler.yield` where available.

Work closures reject `PromiseLike` return values in TypeScript, including return unions containing a PromiseLike member. Synchronous value unions retain their inferred result type. Runtime thenables are reported once with `DispatchFX work items are synchronous. Use DFXGroup enter() and leave() around asynchronous work.` Their rejection is consumed so it cannot produce a second unhandled rejection. A thrown asynchronous item is reported with its queue label and original error as `cause`, and later work continues. A synchronous block's original exception propagates to its caller. Hosts without `reportError` use `console.error`. `console.createTask` captures the submission site when supported; developer builds record `performance.measure("DFX " + label)`.

`sync(work)` and `sync(flags, work)` return the block's result on the caller's thread. The single defaulted flags argument stays positional, and takes the same option-set member array as `async`; there is no options-object overload. Sync drains earlier required work synchronously, including FIFO predecessors and serial-target or concurrent-barrier dependencies, using each submission's saved target chain. Independent pending queues retain their host scheduling. A higher-QoS caller temporarily raises the effective execution QoS of the required predecessors and sync block; assigned queue `qos` values stay unchanged. Frames and boosts are released in `finally`.

Sync throws a plain libdispatch-prefix error when the requested queue is already on the execution stack, an exclusive target is held by the caller, a queue in the target chain has a worker item in flight, or the required pending work cannot run synchronously. Deadlock errors include the full executing and requested queue label chains. Independent queues may sync through a shared concurrent global target. Suspended, inactive or otherwise undrainable predecessors cause a bounded failure; the failed sync block is removed and never runs later. The internal worker-in-flight guard is a test stub in this tier; the actual worker pool and cross-realm main-queue waits remain later tasks.

## Target queues, flags and lifetime

The QoS rules follow [Apple's `dispatch/block.h`](https://github.com/apple-oss-distributions/libdispatch/blob/main/dispatch/block.h). Asynchronous execution defaults to `inheritQoS`: an explicitly assigned queue QoS wins over the item's QoS. An unspecified queue uses the item's assigned or submission-time QoS. Each target's assigned QoS provides a floor. `enforceQoS` can raise the queue's QoS to the item's QoS and wins when both preference flags are supplied; it never lowers the queue or target floor. Relative priorities break ties within a class. The default class is used only if no class was assigned or captured.

Ordinary `async` captures only the synchronous submitting execution stack. `noQoS` and `detached` suppress that capture; an explicitly supplied item QoS takes precedence. `noQoS` wins over `assignCurrentContext`. For ordinary submissions, `assignCurrentContext` refers to the submitting stack; WorkItem creation-time capture will be added with WorkItem itself. No queue or application context persists across an `await` or into a later microtask.

`suspend` and `resume` maintain a count. An over-resume throws a plain `Error` beginning `BUG IN CLIENT OF LIBDISPATCH: `. `initiallyInactive` holds work until `activate`; activation is idempotent and does not consume suspension counts. Global and main queue suspension, resumption and target changes have no effect. `setTarget` rejects cycles. Constructor `target: null` and `setTarget(null)` select the implicit default global root, as Apple's `DISPATCH_TARGET_QUEUE_DEFAULT` does; they do not select the main queue. Assigned QoS continues to apply. As in [Apple's target-queue contract](https://github.com/apple-oss-distributions/libdispatch/blob/main/dispatch/queue.h), inactive retargeting affects existing submissions immediately; active retargeting affects subsequent submissions. When an inactive ancestor changes target, existing work retains its saved prefix through active queues and updates only the affected suffix. Changing the target after activating an initially inactive queue is a client error. Apple's [`dispatch_set_target_queue` implementation](https://github.com/apple-oss-distributions/libdispatch/blob/main/src/object.c) ignores global/root/base objects, including the main queue declared as a global object in [`src/init.c`](https://github.com/apple-oss-distributions/libdispatch/blob/main/src/init.c).

Group/WorkItem-dependent `async` overloads are deferred until those classes are implemented; no placeholder types are exported. Timers, sources and per-application binding/lifetime cancellation belong to the following core tasks. Current scheduling items use the internal system attribution (`appId: null`). The queue API is not yet a per-application scheduling surface.

## Specific values and execution preconditions

`queue.setSpecific(key, value)` stores a value by key identity; `undefined` removes it. `queue.getSpecific(key)` queries that queue alone. Static `DFXQueue.getSpecific(key)` searches the current execution queue and then its target chain, returning `undefined` outside an executing item. Global queues do not store specific values. These are Apple's distinct `dispatch_queue_get_specific` and `dispatch_get_specific` behaviours.

`dispatchPrecondition(DFXPredicate.onQueue(queue))` checks the synchronous execution stack, including target queues. `notOnQueue` checks its absence. `onQueueAsBarrier` succeeds for a serial queue, or for a concurrent queue's barrier item; global concurrent queues ignore barrier flags. Failed checks throw the libdispatch client-error prefix with the predicate and queue label.

## Time representation and limits

`DFXTime` stores a JavaScript `number` of monotonic uptime nanoseconds. `now()` samples `performance.now()`, rounds down to integer nanoseconds and caps finite readings at `Number.MAX_SAFE_INTEGER - 1`. `distantFuture.uptimeNanoseconds` is the pinned `Number.MAX_SAFE_INTEGER` sentinel. This provides exact integer arithmetic up to approximately 104 days. Advancing past the sentinel returns `distantFuture`; advancing before zero clamps to zero. A future value remains future when advanced. Distances are signed nanosecond intervals.

`DFXWallTime.rawValue` follows libdispatch's unsigned 64-bit negative-epoch encoding: `2^64 - epochNanoseconds`. The `distantFuture` raw value is `2^64 - 1`. **Wall raw values use `bigint`**, an explicit departure from the design's general JavaScript-number shorthand: current epoch nanoseconds already exceed the safe integer range. `Date.now()` is converted to `bigint` before multiplication by one million. Its samples retain millisecond resolution, while subsequent interval arithmetic is exact to a nanosecond. Encoded raw values decrease as finite dates advance; compare wall times using `distance`, rather than ordering `rawValue` numerically.

Finite wall instants clamp to epoch nanoseconds 2 through `2^62 - 2`; host samples or advances reaching `2^62 - 1` return `distantFuture`. This follows [Apple's libdispatch clock encoding](https://github.com/apple-oss-distributions/libdispatch/blob/main/src/shims/time.h): wall time reserves bits 63 and 62 as `11`, with `DISPATCH_TIME_MAX_VALUE = (1 << 62) - 1`. The lower bound reserves the libdispatch raw sentinel. The `timespec` initializer is intentionally omitted; there is no public wall-time constructor and no `uptimeNanoseconds` property. Subtraction uses exact `bigint` values before projecting to a safe nanosecond interval. Finite distances outside the safe-number interval range saturate at positive or negative `Number.MAX_SAFE_INTEGER`. A distance to future is `never`; future to finite is negative `Number.MAX_SAFE_INTEGER`; future to future is zero. These saturation choices preserve direction without pretending that JavaScript numbers can represent all 64-bit intervals.

Interval factories accept signed safe integers in their named units and reject conversions exceeding safe integer nanoseconds. `never` is the sole unbounded interval. Its numeric payload remains private. QoS relative priorities are integers from -15 through 0. Invalid arguments throw a plain `Error` beginning `BUG IN CLIENT OF LIBDISPATCH: `. Enums, option-set singletons and value instances are immutable. Autorelease frequency names follow Apple; JavaScript has no autorelease pools.
