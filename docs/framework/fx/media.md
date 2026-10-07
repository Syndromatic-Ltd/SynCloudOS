# MediaFX

MediaFX (`MEFX`) is the web-native analogue of Core Media. It supplies the vocabulary that audio, video and animation share: exact rational time, clocks and timebases, timed sample buffers and bounded queues to carry them. A frame from a decoder, an audio chunk from a recorder and a haptic cue can all be described with the same time values and moved through the same queue, so they stay in step.

Floating point seconds drift. Add 1/30 of a second three hundred times and the total is not ten seconds. MediaFX time is a `bigint` numerator over an integer timescale, so arithmetic is exact, comparisons are exact and long timelines lose nothing. Conversion to seconds happens once, at the edge, when you need a number for a timer or a display.

MediaFX runs in two places. The value types (`MEFXTime`, `MEFXTimeRange`, `MEFXTimeMapping`, `MEFXFormatDescription`, `MEFXSampleTimingInfo`, `MEFXSampleBuffer`, `MEFXBlockBuffer`) are a library that runs anywhere JavaScript runs. `MEFXBufferQueue` and `MEFXTimebase` are also plain classes, so tests can drive them with fake clocks. In an application, the mounted session owns the resources that need a lifetime: `useSynWareMedia()` returns a client that creates clocks, timebases, queues and memory blocks and releases all of them when the component unmounts.

Media acquisition needs no device permission. It owns memory, queue and clock lifetimes only. Devices keep their own permissions in [AudioFX](audio.md), [VideoFX](video.md) and [MIDIFX](midi.md).

```ts
import { MEFXTime } from "@syndromatic/syncloudos/fx/media";
```

## At a glance

| | |
| --- | --- |
| Prefix | `MEFX` |
| Entry | `@syndromatic/syncloudos/fx/media` |
| Hook | `useSynWareMedia`, from `@syndromatic/syncloudos/sdk` |
| Permissions | None |
| Analogue | Core Media (`CMTime`, `CMTimeRange`, `CMTimebase`, `CMSampleBuffer`, `CMBlockBuffer`, `CMBufferQueue`, `CMFormatDescription`) |

## What the entry exports

| Area | Symbols |
| --- | --- |
| Time | `MEFXTime`, `MEFXTimeValue`, `MEFXTimeJSON`, `MEFXSpecialTimeKind`, `MEFXRounding`, `MEFXComparison` |
| Ranges and mapping | `MEFXTimeRange`, `MEFXTimeMapping` |
| Clocks | `MEFXClock`, `MEFXClockReading`, `MEFXTimebase`, `MEFXTimebaseOptions`, `MEFXTimebaseScheduler`, `MEFXTimebaseSnapshot` |
| Memory | `MEFXBlockBuffer`, `MEFXBlockBufferOptions`, `MEFXBlockCopyOptions`, `MEFXBlockSegmentInput` |
| Description | `MEFXFormatDescription`, `MEFXFormatDescriptionInit`, `MEFXMetadata`, `MEFXMetadataValue`, `MEFXMetadataPrimitive`, `snapshotMEFXMetadata` |
| Samples | `MEFXSampleTimingInfo`, `MEFXSampleTimingInfoInit`, `MEFXSampleBuffer`, `MEFXSampleBufferInit`, `MEFXSampleBufferState`, `MEFXSampleAttachments`, `MEFXSampleAttachmentsInit`, `MEFXSampleDiscontinuity`, `MEFXDropHint` |
| Queues | `MEFXBufferQueue` and its option, snapshot and result types |

The session client types `MEFXMediaClient` and `MEFXClockLease` are exported from `@syndromatic/syncloudos/sdk`.

## Exact time

### `MEFXTime`

An immutable time value. Construct it through a static factory. The constructor is private.

A finite time has four parts: a `bigint` `value`, an integer `timescale` (units per second, from 1 to 2,147,483,647), an `epoch` (a `bigint` naming the timeline, default `0n`) and a `rounded` flag that records whether the value has ever been rounded. `MEFXTime.finite(3n, 2)` is three halves of a second. Values and epochs are limited to 256 decimal digits.

Four special values exist: `invalid`, `indefinite`, `positiveInfinity` and `negativeInfinity`. They behave as in Core Media: any arithmetic with `invalid` gives `invalid`, any arithmetic with `indefinite` gives `indefinite`, and infinities order at the ends of the line.

| Member | Type or signature | Description |
| --- | --- | --- |
| `value` | `MEFXTimeValue` | The underlying discriminated value, either `{ kind: "finite", value, timescale, epoch, rounded }` or `{ kind }` for a special time. |
| static `finite` | `(value: bigint, timescale: number, epoch?: bigint, rounded?: boolean) => MEFXTime` | Builds a finite time. Throws `TypeError` for a non-`bigint` and `RangeError` for a timescale outside 1 to 2,147,483,647. |
| static `fromSeconds` | `(seconds: number, preferredScale: number, rounding: MEFXRounding) => MEFXTime` | Converts a number of seconds. The result is marked rounded when the conversion was inexact. Throws `RangeError` for non-finite input or a value too large to convert exactly. |
| static `fromJSON` | `(value: unknown) => MEFXTime` | Restores a time from its JSON form and validates it. |
| static `invalid`, `indefinite`, `positiveInfinity`, `negativeInfinity` | `MEFXTime` | The special values. |
| `compare` | `(other: MEFXTime) => MEFXComparison` | Returns -1, 0 or 1, or `"unordered"` when either side is `invalid` or `indefinite` or when two finite times have different epochs. |
| `convertScale` | `(timescale: number, rounding: MEFXRounding) => MEFXTime` | Re-expresses the time on another timescale, rounding when the result is not exact. Special times return themselves. |
| `addDuration` | `(duration: MEFXTime) => MEFXTime` | Adds a duration, which must have epoch `0n`. The result keeps the receiver's epoch and is exact. Throws `RangeError` when the exact result needs a timescale above the limit. |
| `subtract` | `(other: MEFXTime) => MEFXTime` | Subtracts a time. Two finite times must share an epoch, and the result is a duration with epoch `0n`. |
| `toSeconds` | `() => number` | The value as seconds. Throws `RangeError` for special times. |
| `toMicroseconds` | `(rounding: MEFXRounding) => bigint` | The value in microseconds, rounded as requested. |
| `toJSON` | `() => MEFXTimeJSON` | A structure with strings for the `bigint` parts, so a time survives `JSON.stringify`. |

`MEFXRounding` is `"toward-zero"`, `"floor"`, `"ceil"` or `"nearest-even"`. `MEFXComparison` is `-1 | 0 | 1 | "unordered"`. `MEFXTimeValue` and `MEFXTimeJSON` describe the two shapes above, and `MEFXSpecialTimeKind` is `"invalid" | "indefinite" | "positive-infinity" | "negative-infinity"`.

```ts
import { MEFXTime } from "@syndromatic/syncloudos/fx/media";

const frame = MEFXTime.finite(1n, 30); // 1/30 s
let position = MEFXTime.finite(0n, 30);
for (let index = 0; index < 300; index += 1) position = position.addDuration(frame);

export const exactlyTenSeconds = position.compare(MEFXTime.finite(10n, 1)) === 0; // true
export const asText = JSON.stringify(position.toJSON());
export const restored = MEFXTime.fromJSON(JSON.parse(asText));
export const microseconds = MEFXTime.fromSeconds(1.5, 1000, "nearest-even").toMicroseconds("floor"); // 1500000n
```

### `MEFXTimeRange`

A span from a `start` for a `duration`. Both must be finite. The duration needs epoch `0n` and cannot be negative. The range is half open: it includes its start and excludes its end.

```text
new MEFXTimeRange(start: MEFXTime, duration: MEFXTime)
```

| Member | Type | Description |
| --- | --- | --- |
| `start`, `duration` | `MEFXTime` | The values you passed. |
| `end` | `MEFXTime` | `start` plus `duration`, computed exactly. |
| `empty` | `boolean` | True when the duration is zero. |
| `contains(position)` | `boolean` | True when `start <= position < end`. An empty range contains nothing. |
| `intersection(other)` | `MEFXTimeRange` | The overlap. When the ranges do not overlap, the result is an empty range at the later start. |
| `union(other)` | `MEFXTimeRange \| null` | The combined range when the two touch or overlap, otherwise `null`. |
| `boundingUnion(other)` | `MEFXTimeRange` | The smallest range that covers both, including any gap between them. |

The methods throw `RangeError` when the two ranges have different epochs.

### `MEFXTimeMapping`

A linear map from a source range to a target range. Use it to translate between timelines, for example a clip's local time and its position in a composition, or a retimed section that plays at half speed.

```text
new MEFXTimeMapping(source: MEFXTimeRange, target: MEFXTimeRange)
```

| Member | Description |
| --- | --- |
| `source`, `target` | The two ranges. |
| `map(position)` | Maps a time in the source range to the target range, scaling exactly. A position outside the source range extrapolates along the same line. Throws `RangeError` when the source duration is zero, or when the position's epoch differs from the source start. |
| `inverted()` | The mapping with source and target swapped. Throws `RangeError` when the target duration is zero. |

```ts
import { MEFXTime, MEFXTimeMapping, MEFXTimeRange } from "@syndromatic/syncloudos/fx/media";

// A 4 second clip that plays at half speed, starting 10 seconds into the composition.
const clip = new MEFXTimeRange(MEFXTime.finite(0n, 1), MEFXTime.finite(4n, 1));
const placed = new MEFXTimeRange(MEFXTime.finite(10n, 1), MEFXTime.finite(8n, 1));
const mapping = new MEFXTimeMapping(clip, placed);

export const compositionTime = mapping.map(MEFXTime.finite(1n, 1)).toSeconds(); // 12
export const clipTime = mapping.inverted().map(MEFXTime.finite(14n, 1)).toSeconds(); // 2
```

## Clocks and timebases

### `MEFXClock` and `MEFXClockReading`

`MEFXClock` is the read-only contract every clock meets.

| Member | Description |
| --- | --- |
| `now()` | Returns an `MEFXClockReading`. |
| `subscribeDiscontinuities(listener)` | Calls the listener when the clock jumps, for example after a device change or a seek. Returns a function that unsubscribes. |

A reading has four fields.

| Field | Type | Description |
| --- | --- | --- |
| `position` | `MEFXTime` | The current position on the clock's timeline. |
| `domain` | `string` | A name for the timeline, such as `"timebase:..."`. Positions from different domains do not compare meaningfully. |
| `generation` | `number` | Increases by one at each discontinuity. A change tells you earlier positions no longer apply. |
| `uncertaintySeconds` | `number` | How far the reading might be off, in seconds. |

The session's monotonic clock counts in microseconds. `useSynWareMedia().observeClock()` returns a lease on it.

### `MEFXTimebase`

A clock derived from another clock. It maps the source through an anchor and a rate: media position equals the media anchor plus the source time elapsed since the source anchor, multiplied by the rate. Change the rate to play faster or slower, set it to zero to pause, and seek to jump. A timebase can itself be a source, so chains of up to 16 levels are possible, for example a clock for a whole document with a child timebase for each clip.

```text
new MEFXTimebase(source: MEFXClock, options?: MEFXTimebaseOptions)
```

Application code obtains a timebase from `useSynWareMedia().createTimebase()`, which releases it when the component unmounts. The constructor is public for tests and custom hosts. It throws `TypeError` when the source lacks the clock methods and `RangeError` beyond 16 levels of nesting.

| Member | Type or signature | Description |
| --- | --- | --- |
| `source` | `MEFXClock` | The clock it follows. |
| `options` | `MEFXTimebaseOptions` | The options it was built with. |
| `now()` | `MEFXClockReading` | The current media position. The domain is `timebase:` followed by the source's domain. |
| `snapshot()` | `MEFXTimebaseSnapshot` | The anchors, rate and generation, for saving or inspecting state. |
| `setRate(numerator, denominator?)` | `void` | Sets the rate as a `bigint` fraction, for example `setRate(1n, 2n)` for half speed. A negative denominator flips the sign. The position stays continuous through the change. Pending `scheduleAt` callbacks are cancelled. |
| `pause()` | `void` | The same as `setRate(0n, 1n)`. |
| `seek(position)` | `void` | Jumps to a finite position. The generation increases, pending callbacks are cancelled, and discontinuity listeners are notified. |
| `scheduleAt(position, callback, signal?)` | `() => void` | Calls `callback` when the timebase reaches `position`. Returns a cancel function. Throws `NotSupportedError` without a `scheduler` option, and `InvalidStateError` while paused. A seek, a rate change or a source discontinuity cancels the callback without running it. |
| `subscribeDiscontinuities(listener)` | `() => void` | Notifies on `seek` and on discontinuities of the source. |
| `dispose()` | `void` | Cancels scheduled callbacks and unsubscribes from the source. Later calls throw an `AbortError`. |
| static `maximumHierarchyDepth` | `16` | The deepest allowed chain of timebases. |

`MEFXTimebaseOptions`:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `mediaAnchor` | `MEFXTime` | 0 seconds | The media position at the moment of creation. Must be finite. |
| `rateNumerator` | `bigint` | `1n` | The rate's numerator. |
| `rateDenominator` | `bigint` | `1n` | The rate's denominator. Cannot be zero. |
| `scheduler` | `MEFXTimebaseScheduler` | none | A `{ setTimeout, clearTimeout }` pair that `scheduleAt` uses. In an application the session's timebase supplies the browser timers. |

`MEFXTimebaseSnapshot` has `sourceAnchor` (a reading), `mediaAnchor`, `rateNumerator`, `rateDenominator` and `generation`. `MEFXTimebaseScheduler` is the timer pair: `setTimeout(callback, delayMs)` returns a handle and `clearTimeout(handle)` cancels it.

```tsx
import { useEffect, useState } from "react";
import { MEFXTime } from "@syndromatic/syncloudos/fx/media";
import { useSynWareMedia } from "@syndromatic/syncloudos/sdk";

export function Stopwatch() {
  const media = useSynWareMedia();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timebase = media.createTimebase();
    const unsubscribe = timebase.subscribeDiscontinuities(() => setSeconds(timebase.now().position.toSeconds()));
    const interval = window.setInterval(() => setSeconds(timebase.now().position.toSeconds()), 100);
    timebase.setRate(2n, 1n); // runs at double speed
    timebase.scheduleAt(MEFXTime.finite(10n, 1), () => timebase.pause());
    return () => {
      window.clearInterval(interval);
      unsubscribe();
      timebase.dispose();
    };
  }, [media]);

  return <output>{seconds.toFixed(1)} s</output>;
}
```

## Memory

### `MEFXBlockBuffer`

An immutable, owned run of bytes, used as the payload of a sample buffer. The block copies its input when you create it, so later changes to your array do not affect it. A block can hold several segments (for example a header and a body) and present them as one contiguous range without joining them.

```text
new MEFXBlockBuffer(input: MEFXBlockSegmentInput | readonly MEFXBlockSegmentInput[], options?: MEFXBlockBufferOptions)
```

A segment is a `Uint8Array`, or `{ bytes, offset?, length? }` to take part of one. The total must not exceed 2,147,483,647 bytes. In an application, prefer `useSynWareMedia().copyBlock(bytes)`, which counts the memory against the application's budget (64 MiB by default).

| Member | Type or signature | Description |
| --- | --- | --- |
| `byteLength` | `number` | The size of the view. |
| `closed` | `boolean` | True after `close()`. |
| `copyTo(target, options?)` | `number` | Copies bytes into a `Uint8Array` and returns the count. `MEFXBlockCopyOptions` has `sourceOffset`, `targetOffset` and `length`, all defaulting to the natural range. Throws `RangeError` when a range does not fit. |
| `slice(start?, end?)` | `MEFXBlockBuffer` | A new block that views part of the same backing store without copying. Closing every view releases the store. |
| `transfer(accept)` | `T` or `Promise<T>` | Hands ownership away. It passes a new view to `accept`, and when `accept` returns (or its promise resolves) it closes this block. If `accept` throws, the original stays open. |
| `close()` | `void` | Releases this view. Idempotent. Once the last view closes, the memory is released and `onBackingRelease` runs. |

`MEFXBlockBufferOptions` has one field, `onBackingRelease`, a callback that runs when the shared backing store is finally freed. Use it to return memory to a pool.

Every method except `close()` throws an `Error` on a closed block.

```ts
import { MEFXBlockBuffer } from "@syndromatic/syncloudos/fx/media";

const header = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
const body = new Uint8Array(1024);
const block = new MEFXBlockBuffer([header, { bytes: body, offset: 0, length: 512 }]);

const firstFour = new Uint8Array(4);
block.copyTo(firstFour); // 52 49 46 46
const tail = block.slice(4); // views the body without copying
tail.close();
block.close();
```

## Describing media

### `MEFXFormatDescription`

Says what a run of samples contains. It has a `mediaType` (for example `"audio"` or `"video"`), a `codec` identifier, a `version` and an `extensions` map of structured metadata. The description is immutable and can be compared for equality, so a consumer can tell when the format of an incoming stream changes.

```text
new MEFXFormatDescription(init: MEFXFormatDescriptionInit)
```

| Member | Description |
| --- | --- |
| `mediaType`, `codec` | Portable identifiers: 1 to 128 characters that start with a letter or digit, followed by letters, digits and `. _ + / -`. The constructor throws `TypeError` otherwise. |
| `version` | An integer from 1 to 2,147,483,647. Default 1. |
| `extensions` | A frozen, validated metadata snapshot. |
| `equals(other)` | True when type, codec, version and extensions all match. |
| `toJSON()` | A plain copy. |

### Metadata

`MEFXMetadataValue` is JSON-shaped data: strings, finite numbers, booleans, `null`, arrays and objects of those. `MEFXMetadataPrimitive` is the scalar part, and `MEFXMetadata` is an object of values.

`snapshotMEFXMetadata(value?, name?)` validates a value and returns a frozen deep copy. It rejects cycles, symbols, accessors, sparse arrays, non-plain objects and non-finite numbers with `TypeError`, nesting deeper than 32 levels or encoded size above 16 KiB with `RangeError`. Object keys come out sorted, so equal metadata compares equal.

### `MEFXSampleTimingInfo`

The timing of one sample or a run of samples.

```text
new MEFXSampleTimingInfo({ presentationTime, decodeTime?, duration? })
```

| Member | Type | Description |
| --- | --- | --- |
| `presentationTime` | `MEFXTime` | When to present the sample. Required and finite. |
| `decodeTime` | `MEFXTime \| null` | When to decode it, for codecs that reorder frames. Must share the presentation time's epoch. |
| `duration` | `MEFXTime \| null` | How long the sample lasts. Cannot be negative and needs epoch `0n`. |
| `advancedBySamples(count)` | `MEFXSampleTimingInfo` | The timing of the sample `count` places later, given that each sample lasts `duration`. Throws `RangeError` without a duration. |

`MEFXSampleTimingInfoInit` is the constructor argument.

## Sample buffers

### `MEFXSampleBuffer`

A block of encoded or decoded media with the description and timing needed to use it. One sample buffer holds one or many samples, for example a single video frame or a thousand audio frames.

```text
new MEFXSampleBuffer(init: MEFXSampleBufferInit)
```

`MEFXSampleBufferInit`:

| Field | Type | Description |
| --- | --- | --- |
| `payload` | `MEFXBlockBuffer` | The bytes. Must be open. The buffer takes its own view. |
| `format` | `MEFXFormatDescription` | The format. |
| `sampleCount` | `number` | A positive integer. |
| `sampleSizes` | `readonly number[]` | Either one size that applies to every sample, or one size per sample. The total cannot exceed the payload. |
| `timings` | `readonly MEFXSampleTimingInfo[]` | Either one entry (each later sample is `duration` further on, so `duration` is required when `sampleCount` is above 1) or one per sample. |
| `attachments` | `MEFXSampleAttachmentsInit \| undefined` | Optional flags. |
| `readiness` | `PromiseLike<void> \| undefined` | When present, the buffer starts `"pending"` and becomes `"ready"` or `"failed"` when the promise settles. |

The constructor throws `TypeError` and `RangeError` for any mismatch.

| Member | Type or signature | Description |
| --- | --- | --- |
| `format` | `MEFXFormatDescription` | The format. |
| `sampleCount` | `number` | The number of samples. |
| `attachments` | `MEFXSampleAttachments` | The frozen flags. |
| `state` | `MEFXSampleBufferState` | `"pending"`, `"ready"`, `"failed"` or `"invalidated"`. |
| `ready` | `Promise<void>` | Resolves when the buffer is ready, and rejects when it fails or is invalidated first. |
| `byteLength` | `number` | The payload size. Throws once the payload has been released. |
| `sampleSizeAt(index)` | `number` | The byte size of one sample. |
| `sampleByteRangeAt(index)` | `{ offset, length }` | Where one sample lies in the payload. |
| `timingAt(index)` | `MEFXSampleTimingInfo` | The timing of one sample, derived from the single entry when only one was given. |
| `sampleBlock(index)` | `MEFXBlockBuffer` | A view of one sample's bytes. Close it when done. |
| `invalidate(reason?)` | `void` | Marks the buffer unusable and releases the payload. A pending `ready` rejects with the reason. |
| `close()` | `void` | The same as `invalidate` with a "closed" reason. |

An index outside `0 <= index < sampleCount` throws `RangeError`. A buffer whose `state` is `"failed"` or `"invalidated"` has released its payload.

### `MEFXSampleAttachments` and `MEFXSampleAttachmentsInit`

Optional facts about the samples, read from `buffer.attachments`.

| Field | Type | Description |
| --- | --- | --- |
| `sync` | `boolean \| undefined` | True when decoding can start at this sample. |
| `keyframe` | `boolean \| undefined` | True for a keyframe. |
| `discontinuity` | `MEFXSampleDiscontinuity \| undefined` | Marks a break with the previous sample. |
| `dropHint` | `MEFXDropHint \| undefined` | `"none"`, `"droppable"` or `"discard"`, telling a consumer under pressure what it may skip. |
| `extensions` | `MEFXMetadata` | Free-form metadata. |

`MEFXSampleDiscontinuity` has a `reason` (1 to 256 characters) and an optional `generation` (a non-negative integer). `MEFXSampleAttachmentsInit` accepts the same fields, with `discontinuity` allowed to be `null`.

## Queues

### `MEFXBufferQueue<T>`

A bounded queue with backpressure. A producer enqueues items, a consumer dequeues them, and the queue enforces limits on item count, total bytes and, optionally, total duration. It suits the boundary between a decoder and a renderer, or a capture source and an encoder.

```text
new MEFXBufferQueue<T>(options: MEFXBufferQueueOptions<T>)
```

The queue owns whatever it holds. Because items in this framework often hold resources (a block buffer, a video frame), the queue asks you how to measure, transfer and close them. In an application, create queues with `useSynWareMedia().createQueue(options)`, which disposes them on unmount.

`MEFXBufferQueueOptions<T>`:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `maxCount` | `number` | required | The most items held. A positive integer. |
| `maxBytes` | `number` | required | The most bytes held. |
| `maxDuration` | `MEFXTime \| null` | none | The most total duration held. Requires `duration`. |
| `ordering` | `"insertion" \| "presentation"` | `"insertion"` | `"presentation"` keeps items sorted by presentation time and requires `presentationTime`. |
| `overflow` | `"wait" \| "reject" \| "drop-oldest"` | `"wait"` | What happens when an item does not fit. See below. |
| `byteCost` | `(value: T) => number` | required | The size of an item. |
| `duration` | `(value: T) => MEFXTime \| null \| undefined` | none | The duration of an item. Required for duration limits. |
| `presentationTime` | `(value: T) => MEFXTime` | none | The time used for presentation ordering. |
| `transfer` | `<R>(value: T, accept: (owned: T) => R) => R` | required | Moves ownership into the queue. The sender must be consumed only if `accept` returns normally. |
| `close` | `(value: T) => void` | required | Releases an item the queue drops, resets or disposes. |

The constructor throws `TypeError` for a missing callback or a combination that lacks what it needs.

Overflow policies:

- `"wait"`: `enqueue` returns a promise that resolves when space is available. Producers are served in order.
- `"reject"`: `enqueue` rejects immediately with a budget error naming the limit that failed (count, bytes or duration).
- `"drop-oldest"`: the queue removes the oldest items until the new one fits, and reports them in the result's `dropped` list so you can release them. Dropped items are handed back to you, not closed.

An item that could never fit, even into an empty queue, always rejects.

| Member | Type or signature | Description |
| --- | --- | --- |
| `configuration` | `MEFXBufferQueueConfiguration` | The resolved limits and policies. |
| `generation` | `number` | Increases at each `reset` and at `dispose`. |
| `snapshot()` | `MEFXBufferQueueSnapshot` | The current fill. |
| `enqueue(value, options?)` | `Promise<MEFXBufferQueueEnqueueResult<T>>` | Adds an item. Rejects on a disposed or ended queue, on an aborted signal, or when the queue is reset while waiting. |
| `dequeue(options?)` | `Promise<T \| null>` | Takes the next item, waiting when the queue is empty. Resolves `null` after `end()` once the queue drains. |
| `end()` | `void` | Signals that no more items will come. Waiting producers reject, and consumers drain the remaining items and then receive `null`. |
| `reset(reason?)` | `void` | Discards every item (closing each), rejects waiting producers and consumers, and starts a new generation. The queue can be used again. Use it when a seek makes the queued media stale. |
| `dispose(reason?)` | `void` | Like `reset`, and the queue accepts nothing afterwards. |

Queue callbacks (`byteCost`, `transfer`, `close` and the rest) must not call back into the same queue. Doing so throws.

`MEFXBufferQueueConfiguration` has `maxCount`, `maxBytes`, `maxDuration`, `ordering` and `overflow`. `MEFXBufferQueueEnqueueOptions` and `MEFXBufferQueueDequeueOptions` each hold an optional `signal`. `MEFXBufferQueueEnqueueResult` has `accepted: true`, `dropped` and `generation`. `MEFXBufferQueueSnapshot` has:

| Field | Description |
| --- | --- |
| `generation` | The current generation. |
| `count`, `retainedBytes` | How many items and bytes are held. |
| `retainedDuration` | An exact `{ numerator, denominator }` fraction of seconds, or `null` without duration limits. |
| `ended`, `disposed` | Lifecycle flags. |
| `pendingEnqueues`, `pendingDequeues` | How many producers and consumers are waiting. |

`MEFXBufferQueueDurationSnapshot` is the fraction type, `MEFXBufferQueueOrdering` and `MEFXBufferQueueOverflowPolicy` are the two option unions.

```tsx
import { useEffect } from "react";
import {
  MEFXFormatDescription,
  MEFXSampleBuffer,
  MEFXSampleTimingInfo,
  MEFXTime,
} from "@syndromatic/syncloudos/fx/media";
import { useSynWareMedia } from "@syndromatic/syncloudos/sdk";

export function Pipeline() {
  const media = useSynWareMedia();

  useEffect(() => {
    const controller = new AbortController();
    const queue = media.createQueue<MEFXSampleBuffer>({
      maxCount: 8,
      maxBytes: 4 * 1024 * 1024,
      overflow: "drop-oldest",
      byteCost: (buffer) => buffer.byteLength,
      transfer: (buffer, accept) => accept(buffer),
      close: (buffer) => buffer.close(),
    }, controller.signal);

    const format = new MEFXFormatDescription({ mediaType: "audio", codec: "pcm-f32" });
    const timing = new MEFXSampleTimingInfo({
      presentationTime: MEFXTime.finite(0n, 48_000),
      duration: MEFXTime.finite(1n, 48_000),
    });

    async function produce() {
      const payload = media.copyBlock(new Uint8Array(4800 * 4));
      const buffer = new MEFXSampleBuffer({ payload, format, sampleCount: 4800, sampleSizes: [4], timings: [timing] });
      payload.close(); // the sample buffer holds its own view
      const { dropped } = await queue.enqueue(buffer);
      for (const late of dropped) late.close();
    }

    async function consume() {
      for (;;) {
        const next = await queue.dequeue({ signal: controller.signal });
        if (next === null) return;
        console.log(next.sampleCount, next.timingAt(0).presentationTime.toSeconds());
        next.close();
      }
    }

    void produce();
    consume().catch(() => undefined);
    return () => {
      controller.abort();
      queue.dispose();
    };
  }, [media]);

  return null;
}
```

## The session client

`useSynWareMedia()` returns an `MEFXMediaClient`. Constructing the hook requests nothing. Each method acquires a resource that lasts until you release it, until an `AbortSignal` you pass fires, or until the component unmounts. The optional signal narrows a resource's lifetime, never extends it.

| Method | Returns | Description |
| --- | --- | --- |
| `copyBlock(bytes, signal?)` | `MEFXBlockBuffer` | Copies bytes into a block that counts against the application's memory budget. Budget defaults are 64 MiB of bytes, 64 live handles, 16 sessions and 8 worker jobs. Throws `TypeError` for a non-`Uint8Array` and a budget error when the limit is reached. |
| `createQueue(options, signal?)` | `MEFXBufferQueue<T>` | A queue that the session disposes with your component. |
| `observeClock(signal?)` | `MEFXClockLease` | A read-only lease on the session's monotonic clock, with `now()`, `subscribeDiscontinuities()` and `dispose()`. |
| `createTimebase(options?, signal?)` | `MEFXTimebase` | A timebase over the session clock, ready with browser timers for `scheduleAt`. |

Resources released early also give their budget back. Call `dispose()` or `close()` as soon as you are done, so long-lived components stay inside their limits.

## Working with the other frameworks

- [AudioFX](audio.md) converts between sample counts and MediaFX time with `toMediaTime` and `fromMediaTime`,.
- [VideoFX](video.md) frames and encoded chunks carry `MEFXTime` timestamps and durations.

Use one timebase as the shared clock for every output that should stay aligned, and derive per-stream timebases from it when a stream needs its own rate or offset.

## Errors

| Situation | Error |
| --- | --- |
| Wrong argument type, unknown or malformed data | `TypeError` |
| A value outside its range, a mismatched epoch, a timescale over the limit | `RangeError` |
| A closed block, an invalidated sample buffer or a queue misuse | `Error` |
| A disposed timebase or clock, an aborted signal | `DOMException` named `AbortError` |
| A queue over its limit with `"reject"` | `Error` naming the limit |
| `scheduleAt` on a paused timebase | `DOMException` named `InvalidStateError` |
| `scheduleAt` without a scheduler | `DOMException` named `NotSupportedError` |

## Related

- [FX overview](README.md)
- [AudioFX](audio.md), [VideoFX](video.md), [MIDIFX](midi.md)
- [SynWare SDK](../synware-sdk.md)
