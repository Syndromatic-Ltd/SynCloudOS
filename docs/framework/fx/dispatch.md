# DispatchFX

DispatchFX (`@syndromatic/syncloudos/fx/dispatch`) mirrors Apple's Dispatch types under `DFX`. This entry currently provides the value types below. Arguments are positional in Apple's order.

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

## Time representation and limits

`DFXTime` stores a JavaScript `number` of monotonic uptime nanoseconds. `now()` samples `performance.now()`, rounds down to integer nanoseconds and caps finite readings at `Number.MAX_SAFE_INTEGER - 1`. `distantFuture.uptimeNanoseconds` is the pinned `Number.MAX_SAFE_INTEGER` sentinel. This provides exact integer arithmetic up to approximately 104 days. Advancing past the sentinel returns `distantFuture`; advancing before zero clamps to zero. A future value remains future when advanced. Distances are signed nanosecond intervals.

`DFXWallTime.rawValue` follows libdispatch's unsigned 64-bit negative-epoch encoding: `2^64 - epochNanoseconds`. The `distantFuture` raw value is `2^64 - 1`. **Wall raw values use `bigint`**, an explicit departure from the design's general JavaScript-number shorthand: current epoch nanoseconds already exceed the safe integer range. `Date.now()` is converted to `bigint` before multiplication by one million. Its samples retain millisecond resolution, while subsequent interval arithmetic is exact to a nanosecond. Encoded raw values decrease as finite dates advance; compare wall times using `distance`, rather than ordering `rawValue` numerically.

Finite wall instants clamp to epoch nanoseconds 2 through `2^62 - 2`; host samples or advances reaching `2^62 - 1` return `distantFuture`. This follows [Apple's libdispatch clock encoding](https://github.com/apple-oss-distributions/libdispatch/blob/main/src/shims/time.h): wall time reserves bits 63 and 62 as `11`, with `DISPATCH_TIME_MAX_VALUE = (1 << 62) - 1`. The lower bound reserves the libdispatch raw sentinel. The `timespec` initializer is intentionally omitted; there is no public wall-time constructor and no `uptimeNanoseconds` property. Subtraction uses exact `bigint` values before projecting to a safe nanosecond interval. Finite distances outside the safe-number interval range saturate at positive or negative `Number.MAX_SAFE_INTEGER`. A distance to future is `never`; future to finite is negative `Number.MAX_SAFE_INTEGER`; future to future is zero. These saturation choices preserve direction without pretending that JavaScript numbers can represent all 64-bit intervals.

Interval factories accept signed safe integers in their named units and reject conversions exceeding safe integer nanoseconds. `never` is the sole unbounded interval. Its numeric payload remains private. QoS relative priorities are integers from -15 through 0. Invalid arguments throw a plain `Error` beginning `BUG IN CLIENT OF LIBDISPATCH: `. Enums, option-set singletons and value instances are immutable. Autorelease frequency names follow Apple; JavaScript has no autorelease pools.
