# HapticsFX

HapticsFX (`HFX`) is the web-native analogue of Core Haptics. It describes tactile feedback as data: named presets for common feedback, and patterns of transient taps and continuous vibrations with intensity, sharpness, envelopes and audio. It plays those patterns through an engine that reports what the device can actually do, so an application can adapt instead of guessing.

Feedback gets a portable description that designers can author, store and exchange, including the AHAP interchange format that Core Haptics uses. Playback gets a controllable transport with pause, seek, looping, rate and dynamic parameter changes. Applications get an honest capability report, because browsers differ widely: many have no vibration hardware, and where the Vibration API exists it offers timed pulses without amplitude control.

HapticsFX runs in two places. The value types (`HFXHapticPattern`, `HFXHapticParameterCurve`, `HFXHapticPatternCodec` and the plain interfaces) are a library that runs anywhere JavaScript runs, including tests and workers. Playback goes through the mounted SynWare session: `useSynWareHaptics()` returns an `HFXHapticSession` that the host creates for your component, so the host can enforce permissions, honour the user's feedback settings and release everything when the component unmounts.

```ts
import { HFXHapticPattern } from "@syndromatic/syncloudos/fx/haptics";
```

## At a glance

| | |
| --- | --- |
| Prefix | `HFX` |
| Entry | `@syndromatic/syncloudos/fx/haptics` |
| Hook | `useSynWareHaptics`, from `@syndromatic/syncloudos/sdk` |
| Permission | `haptics.play` in the manifest `permissions` list |
| Analogue | Core Haptics (`CHHapticEngine`, `CHHapticPattern`, `CHHapticAdvancedPatternPlayer`, AHAP) |

## What the entry exports

| Area | Symbols |
| --- | --- |
| Presets | `HFXFeedbackPresetName`, `HFXFeedbackRequest`, `HFXFeedbackOptions` |
| Pattern data | `HFXHapticEvent`, `HFXHapticPattern`, `HFXHapticParameterID`, `HFXHapticParameterCurve`, `HFXHapticDynamicParameter` |
| Session and playback | `HFXHapticClient`, `HFXHapticSession`, `HFXHapticPatternPlayer`, `HFXHapticAdvancedPatternPlayer` |
| Lifecycle | `HFXHapticLifecycleEvent`, `HFXHapticPlaybackConfiguration`, `HFXHapticObservation` |
| Audio resources | `HFXAudioResource` |
| Capabilities | `HFXHapticCapabilities` |
| Files | `HFXHapticPatternCodec` |
| Hosting and tests | `HFXHapticEngine`, `HFXHapticPort` |

## Quick start: preset feedback

Presets are the simplest way to give feedback. `trigger()` accepts one of eleven names and returns a promise. Passing `false`, `null` or `undefined` is accepted and does nothing, which lets you write `session.trigger(enabled && "selection")` without a branch.

```tsx
import { useState } from "react";
import { useSynWareHaptics } from "@syndromatic/syncloudos/sdk";

export function SaveButton() {
  const haptics = useSynWareHaptics();
  const [saved, setSaved] = useState(false);

  const onClick = async () => {
    setSaved(true);
    await haptics.trigger("success");
  };

  return (
    <button type="button" onClick={onClick}>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
```

Declare the permission in the manifest, or the hook throws when the component mounts.

```json
{
  "permissions": ["haptics.play"]
}
```

### `HFXFeedbackPresetName`

A string union of the preset names. The browser host plays each preset as a short vibration sequence. Durations are in milliseconds and intensities are in the range 0 to 1.

| Name | Vibration sequence (duration at intensity) | Intended use |
| --- | --- | --- |
| `"success"` | 30 ms at 0.5, then 40 ms at 1 after a 60 ms delay | An action completed |
| `"warning"` | 40 ms at 0.8, then 40 ms at 0.6 after a 100 ms delay | Something needs attention |
| `"error"` | 40 ms at 0.7, 40 ms at 0.7, 40 ms at 0.9, 50 ms at 0.6, each after a 40 ms delay | An action failed |
| `"light"` | 15 ms at 0.4 | A light tap |
| `"medium"` | 25 ms at 0.7 | A standard tap |
| `"heavy"` | 35 ms at 1 | A firm tap |
| `"soft"` | 40 ms at 0.5 | A rounded, cushioned tap |
| `"rigid"` | 10 ms at 1 | A crisp tap |
| `"selection"` | 8 ms at 0.3 | A selection change |
| `"nudge"` | 80 ms at 0.8, then 50 ms at 0.3 after an 80 ms delay | A prompt to look at the screen |
| `"buzz"` | 1000 ms at 1 | A long alert |

### `HFXFeedbackRequest`

`HFXFeedbackPresetName | false | null | undefined`. The argument type of `trigger()`. A falsy value is a no-op. Any other string throws `TypeError("Unknown feedback preset.")`.

### `HFXFeedbackOptions`

The optional second argument of `trigger()`. The engine reads only own data properties named `intensity` and `audio`. An unknown key, or a property defined with a getter, throws a `TypeError`, so options cannot carry host authority or override host policy. A property whose value is `undefined` is ignored.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `intensity` | `number` | Host default | Scales the vibration, from 0 (none) to 1 (full). A value outside 0 to 1, or a non-finite value, throws a `RangeError`. |
| `audio` | `boolean \| "desktop" \| "fallback" \| "always" \| "debug" \| "off"` | `"desktop"` | Whether a sound accompanies the vibration. Any other value throws a `TypeError`. |

The audio modes behave as follows in the browser host. All of them stay silent when the user has switched button sounds off.

| Value | Behaviour |
| --- | --- |
| `true`, `"always"` | Always plays the sound. |
| `false`, `"off"` | Never plays the sound. |
| `"desktop"` | Plays the sound on desktop-style devices (no touch points and a fine pointer), and wherever vibration is unavailable. |
| `"fallback"` | Plays the sound only where vibration is unavailable. |
| `"debug"` | Plays the sound only when the host runs in debug mode. |

### Preset feedback with options

```tsx
import { useSynWareHaptics } from "@syndromatic/syncloudos/sdk";
import type { HFXFeedbackOptions, HFXFeedbackPresetName } from "@syndromatic/syncloudos/fx/haptics";

const quiet: HFXFeedbackOptions = { intensity: 0.4, audio: "off" };

export function Stepper() {
  const haptics = useSynWareHaptics();

  const tick = (name: HFXFeedbackPresetName) => {
    haptics.trigger(name, quiet).catch((error: unknown) => {
      console.warn("Feedback was refused", error);
    });
  };

  return (
    <div role="group" aria-label="Quantity">
      <button type="button" onClick={() => tick("light")}>Less</button>
      <button type="button" onClick={() => tick("rigid")}>More</button>
    </div>
  );
}
```

## Describing patterns

A pattern is an immutable list of events and an optional list of parameter curves. You build one anywhere, with no host, and hand it to a player.

### `HFXHapticEvent`

A plain object describing one event. Times are in seconds, measured from the start of the pattern. `HFXHapticPattern` validates every field when it is constructed. All fields except `type` and `relativeTime` are optional.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `type` | `"transient" \| "continuous" \| "audio" \| "audioContinuous"` | Required | `transient` is a short tap, `continuous` a sustained vibration, `audio` plays a registered audio resource, `audioContinuous` synthesises a tone. |
| `relativeTime` | `number` | Required | Start time in seconds from the start of the pattern. Finite and at least 0. |
| `duration` | `number` | Unset | Length in seconds. Finite and at least 0. `relativeTime + duration` must not exceed 3600. When you create a player, a transient event without a duration receives 0.008 s, and an `audio` event without a duration receives the length of its resource. `audioContinuous` requires a duration above 0. |
| `intensity` | `number` | 0.5 at playback | Strength from 0 to 1. For audio events this is the volume. |
| `sharpness` | `number` | Unset | Character of the haptic from 0 (dull) to 1 (crisp). Where the host lacks sharpness control, the value is accepted and ignored. |
| `attackTime` | `number` | Unset | Envelope attack in seconds, 0 to 1. |
| `decayTime` | `number` | Unset | Envelope decay in seconds, 0 to 1. |
| `releaseTime` | `number` | Unset | Envelope release in seconds, 0 to 1. The release extends the event beyond its `duration` and counts towards `HFXHapticPattern.duration` unless `sustained` is `false`. |
| `sustained` | `boolean` | Unset | When `false`, the event ends at `duration` and no release stage follows. |
| `audioUseVolumeEnvelope` | `boolean` | Unset | For `audio` events only: applies the envelope fields to the resource's volume. Other event types throw a `TypeError`. |
| `audioBrightness` | `number` | Unset | Tone brightness from 0 to 1. Audio event types only. |
| `audioLoop` | `boolean` | Unset | Loops the audio resource. Audio event types only. |
| `audioPan` | `number` | Unset | Stereo position from -1 (left) to 1 (right). Audio event types only. |
| `audioPitch` | `number` | Unset | Pitch offset from -1 to 1. Audio event types only. |
| `name` | `string` | Unset | A label for your own use. It has no effect on playback and the AHAP encoder rejects it. |
| `audioResource` | `string` | Unset | The `id` of an `HFXAudioResource` registered with the session. Required for `audio` events and forbidden on `audioContinuous` events. |

### `HFXHapticPattern`

An immutable, frozen pattern. The constructor copies and freezes each event and sorts the events by `relativeTime` (events with equal times keep their order). It also freezes the curve list.

```text
new HFXHapticPattern(events: readonly HFXHapticEvent[], curves?: readonly HFXHapticParameterCurve[])
```

| Member | Type or signature | Description |
| --- | --- | --- |
| `events` | `readonly HFXHapticEvent[]` | Frozen copies of the events, sorted by start time. |
| `curves` | `readonly HFXHapticParameterCurve[]` | The parameter curves, in the order you supplied. Defaults to an empty list. |
| `duration` | `number` | The end of the last event in seconds, including release time where the event has a release stage. It is 0 for an empty pattern. |

The constructor throws in these cases.

| Condition | Error |
| --- | --- |
| More than 4096 events or more than 128 curves, or `events` is not an array | `RangeError("Pattern exceeds limits.")` |
| Unknown `type`, a non-finite or negative `relativeTime` or `duration`, or an event that ends after 3600 s | `RangeError("Invalid event time or type.")` |
| `intensity`, `sharpness`, `audioBrightness`, `attackTime`, `decayTime` or `releaseTime` outside 0 to 1 | `RangeError("Invalid event parameter.")` |
| `audioPan` or `audioPitch` outside -1 to 1, or set on a haptic event | `RangeError("Invalid audio pan/pitch parameter.")` |
| A non-boolean `sustained`, `audioLoop` or `audioUseVolumeEnvelope`, an audio-only field on a haptic event, or `audioUseVolumeEnvelope` on an event that is not `audio` | `TypeError` |
| An `audioContinuous` event without a positive duration, or with an `audioResource` | `TypeError("Synthesized audio requires duration and no waveform resource.")` |
| An `audio` event without an `audioResource` | `TypeError("Audio event requires an owned resource.")` |
| A pattern whose envelope-extended duration exceeds 3600 s | `RangeError("Pattern envelope exceeds duration limit.")` |

The constructor checks only structure and ranges. It does not check that an `audioResource` id exists. The session checks that when you create a player.

```ts
import { HFXHapticPattern } from "@syndromatic/syncloudos/fx/haptics";

export function makeHeartbeat(): HFXHapticPattern {
  return new HFXHapticPattern([
    { type: "transient", relativeTime: 0, intensity: 1, sharpness: 0.6 },
    { type: "transient", relativeTime: 0.18, intensity: 0.7, sharpness: 0.4 },
    { type: "continuous", relativeTime: 0.3, duration: 0.4, intensity: 0.3, sharpness: 0.1, releaseTime: 0.1 },
  ]);
}

export const heartbeat = makeHeartbeat();
console.log(heartbeat.events.length); // 3
console.log(heartbeat.duration); // 0.8 (0.3 + 0.4 + 0.1 release)
```

### `HFXHapticParameterID`

A string union naming the values a curve or a dynamic parameter can change. Each name has a value range.

| ID | Applies to | Value range |
| --- | --- | --- |
| `"intensity"` | Haptic strength, as a multiplier of each event's intensity | 0 to 1 |
| `"audioVolume"` | Audio volume, as a multiplier of each audio event's intensity | 0 to 1 |
| `"sharpness"` | Haptic sharpness, added to each event's sharpness and clamped to 0 to 1 | -1 to 1 |
| `"audioPan"` | Stereo position | -1 to 1 |
| `"audioPitch"` | Pitch | -1 to 1 |
| `"audioBrightness"` | Tone brightness | -1 to 1 |
| `"hapticAttackTime"`, `"hapticDecayTime"`, `"hapticReleaseTime"` | Haptic envelope stages, added to each event's value and clamped to 0 to 1 | -1 to 1 |
| `"audioAttackTime"`, `"audioDecayTime"`, `"audioReleaseTime"` | Audio envelope stages | -1 to 1 |

### `HFXHapticParameterCurve`

A piecewise linear curve that changes one parameter over the length of a pattern. Give the curve to a pattern, and the player applies it during playback. The instance is frozen.

```text
new HFXHapticParameterCurve(
  parameterID: HFXHapticParameterID,
  points: readonly Readonly<{ time: number; value: number }>[],
  relativeTime?: number,
)
```

`relativeTime` defaults to 0. It shifts the whole curve: a point at `time: 0.5` in a curve with `relativeTime: 2` takes effect 2.5 s into the pattern. The constructor throws `RangeError("Invalid parameter curve.")` for an unknown ID, a `relativeTime` outside 0 to 3600, or a list with fewer than 1 or more than 4096 points. It throws `RangeError("Invalid curve point.")` when a point has a negative or non-finite time, ends after 3600 s (`time + relativeTime`), repeats or goes back in time (times must strictly increase), or holds a value outside the range for its parameter.

| Member | Type or signature | Description |
| --- | --- | --- |
| `parameterID` | `HFXHapticParameterID` | The parameter the curve controls. |
| `controlPoints` | `readonly { time: number; value: number }[]` | Frozen copies of the points. Point times are in seconds from the curve's own start. |
| `relativeTime` | `number` | The curve's offset from the start of the pattern, in seconds. |
| `valueAt(time)` | `(time: number) => number` | Returns the curve's value at a pattern time in seconds. It subtracts `relativeTime`, interpolates linearly between neighbouring points, and holds the first value before the first point and the last value after the last point. |

### `HFXHapticDynamicParameter`

A single live parameter change that you send to a running player or session.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `parameterID` | `HFXHapticParameterID` | Required | The parameter to change. |
| `value` | `number` | Required | The new value, within the range for that parameter. |
| `relativeTime` | `number` | Required | Delay in seconds from now. Use 0 to apply the change immediately. Finite and at least 0. |

### A pattern with curves

```ts
import { HFXHapticParameterCurve, HFXHapticPattern } from "@syndromatic/syncloudos/fx/haptics";

export function makeSwell(): HFXHapticPattern {
  const fadeIn = new HFXHapticParameterCurve("intensity", [
    { time: 0, value: 0.1 },
    { time: 1, value: 1 },
    { time: 1.5, value: 0.2 },
  ]);
  const brighten = new HFXHapticParameterCurve("sharpness", [
    { time: 0, value: 0 },
    { time: 1, value: 0.5 },
  ], 0.25);

  return new HFXHapticPattern(
    [{ type: "continuous", relativeTime: 0, duration: 1.5, intensity: 1 }],
    [fadeIn, brighten],
  );
}

const swell = makeSwell();
console.log(swell.curves[0]?.valueAt(0.5)); // 0.55
console.log(swell.curves[1]?.valueAt(0)); // 0 (held before the first point)
```

## Sessions

### `HFXHapticClient`

The mounted application's authority for creating engines. Applications rarely use it directly, because `useSynWareHaptics()` creates and disposes an engine for each component.

| Member | Type or signature | Description |
| --- | --- | --- |
| `createEngine(signal?)` | `(signal?: AbortSignal) => HFXHapticSession` | Creates an independently disposable session. Throws a `DOMException` named `SecurityError` when the manifest does not declare `haptics.play`, and throws when the application has already closed. Aborting the signal disposes the session. A host allows up to 128 live sessions and throws `RangeError("Haptic session budget exceeded.")` beyond that. |

### `HFXHapticSession`

The engine authority that an application receives. It exposes playback and inspection and leaves out host policy such as the user's vibration and button sound switches, which the host applies to every session for you. A session is a live resource: dispose it when you are done. The session that `useSynWareHaptics()` returns is disposed for you when the component unmounts.

| Member | Type or signature | Description |
| --- | --- | --- |
| `currentTime` | `readonly number` | The host clock in seconds. Use it for relative timing only. |
| `isSupported` | `readonly boolean` | `true` when the device can produce haptic output. It is `false` after disposal, and in browsers without the Vibration API (audio events can still play there). |
| `capabilities` | `readonly HFXHapticCapabilities` | A frozen snapshot of what the host can do. Read it again after `start()` or `reset()`, because audio state changes. |
| `observe(listener)` | `(listener: (event: HFXHapticLifecycleEvent) => void) => HFXHapticObservation` | Subscribes to lifecycle events. Throws `RangeError` when `listener` is not a function or the session already has 128 observers. |
| `configurePlayback(configuration)` | `(configuration: HFXHapticPlaybackConfiguration) => void` | Restricts pattern playback. Fields you omit keep their previous values. |
| `start()` | `() => Promise<void>` | Prepares output (for audio, this asks the host to resume audio output) and marks the session running, which emits `started` if it was not already running. Call it from a user gesture when `capabilities.audioState` is `"permission-required"`. |
| `stop()` | `() => void` | Stops every player (each calls its `completionHandler` with `"cancelled"`), cancels output, then emits `stopped` with reason `"requested"` if the session was running. Players stay usable and you can start them again. |
| `reset()` | `() => void` | Stops the session, unregisters every audio resource, cancels registrations still in flight, and emits `reset`. Resource handles you held become invalid. |
| `trigger(request, options?)` | `(request: HFXFeedbackRequest, options?: HFXFeedbackOptions) => Promise<void>` | Plays a preset. See the presets section for validation. |
| `registerAudioResource(buffer, signal?)` | `(buffer: AUFXAudioPCMBuffer, signal?: AbortSignal) => Promise<HFXAudioResource>` | Copies PCM audio into the session for use in `audio` events. |
| `unregisterAudioResource(resource)` | `(resource: HFXAudioResource) => void` | Releases a resource. Throws `Error("Audio resource is not owned by this engine.")` for a resource this session did not create or has already released. |
| `makePlayer(pattern)` | `(pattern: HFXHapticPattern) => HFXHapticPatternPlayer` | Creates a player for a pattern. It returns the same object as `makeAdvancedPlayer`, typed as the basic contract. |
| `makeAdvancedPlayer(pattern)` | `(pattern: HFXHapticPattern) => HFXHapticAdvancedPatternPlayer` | Creates a player with pause, seek, looping, rate and mute. |
| `dispose()` | `() => void` | Ends the session: emits `stopped` with reason `"disposed"` if it was running, cancels output, releases audio resources and drops observers. Idempotent. |

After disposal, `trigger`, `start`, `reset`, `observe`, `configurePlayback`, the player factories and the resource methods throw `Error("Haptic engine is disposed.")`. `stop()` and `dispose()` do nothing. `isSupported` is `false` and `capabilities.state` is `"disposed"`.

`makeAdvancedPlayer` (and `makePlayer`) throw in these cases.

| Condition | Error |
| --- | --- |
| The session already owns 128 players | `RangeError("Haptic player limit exceeded.")` |
| An `audio` event names a resource this session has not registered | `Error("Audio resource is not registered with this engine.")` |
| The host cannot play structured events | `Error` naming the missing host operation |

### The session in a component

`useSynWareHaptics()` creates the session after the component commits (in a layout effect), never asks the browser for any permission, and disposes it on unmount. Each component that calls the hook owns its own session.

Before the session exists, the object the hook returns is safe to read. `isSupported` is `false`, `currentTime` is 0, and `capabilities` reports `state: "unavailable"` with the reason "The component haptic owner is not mounted." Calling an action such as `trigger` before mount throws that message as an `Error`. `stop()` and `dispose()` do nothing. Create players and observe events inside effects and handlers, which run after mount.

The next example checks capabilities and falls back to a visual cue.

```tsx
import { useEffect, useState } from "react";
import { useSynWareHaptics } from "@syndromatic/syncloudos/sdk";

export function ConnectionBadge({ online }: { online: boolean }) {
  const haptics = useSynWareHaptics();
  const [canVibrate, setCanVibrate] = useState(false);

  useEffect(() => {
    setCanVibrate(haptics.isSupported);
  }, [haptics]);

  useEffect(() => {
    void haptics.trigger(online ? "success" : "warning", { audio: "fallback" });
  }, [haptics, online]);

  return (
    <span role="status" data-haptics={canVibrate ? "vibration" : "silent"}>
      {online ? "Online" : "Offline"}
    </span>
  );
}
```

## Playing patterns

### `HFXHapticPatternPlayer`

The basic playback contract. A player belongs to the session that created it and plays one pattern.

| Member | Type or signature | Description |
| --- | --- | --- |
| `start(delay?)` | `(delay?: number) => void` | Starts playback after `delay` seconds (default 0). Throws `RangeError("Invalid player timing.")` for a negative or non-finite delay. |
| `stop()` | `() => void` | Stops playback and cancels pending output. |
| `sendParameters(parameters)` | `(parameters: readonly HFXHapticDynamicParameter[]) => void` | Applies live parameter changes. |
| `dispose()` | `() => void` | Stops the player and releases it from the session. |

### `HFXHapticAdvancedPatternPlayer`

The full transport, and the object `makeAdvancedPlayer()` returns. It schedules each event on a timer, follows the session's clock, and reports how playback ended through `completionHandler`. Each player plays one pattern, so create one player per pattern. The constructor is public because the engine builds players with it. Applications use `makePlayer` or `makeAdvancedPlayer` on a session.

```text
new HFXHapticAdvancedPatternPlayer(engine: HFXHapticEngine, pattern: HFXHapticPattern)
```

| Member | Type or signature | Description |
| --- | --- | --- |
| `pattern` | `readonly HFXHapticPattern` | The pattern being played. When a session made the player, this is a resolved copy: transient events without a duration carry 0.008 s and audio events without a duration carry their resource's length, so its `duration` can differ from the pattern you passed. |
| `loopEnabled` | `boolean` | Default `false`. When `true`, playback wraps to the start each time it reaches `loopEnd` and never completes on its own. |
| `loopEnd` | `number` | The loop boundary in seconds. Defaults to `pattern.duration`. Must be above 0 and at most `pattern.duration`, or the setter throws `RangeError("Invalid loop end.")`. |
| `playbackRate` | `number` | Speed multiplier, default 1. Must be above 0 and at most 4, or the setter throws `RangeError("Invalid playback rate.")`. Setting it while playing pauses and resumes from the current position. |
| `isMuted` | `boolean` | Default `false`. Setting `true` cancels current output immediately and suppresses events and parameter updates. The timeline keeps running, so unmuting rejoins playback in time. |
| `completionHandler` | `((reason: "completed" \| "cancelled" \| "error") => void) \| undefined` | Called once when playback ends. `"completed"` means the pattern reached its end, `"cancelled"` means `stop()` or `dispose()`, and `"error"` means the host failed to play an event or parameter. Exceptions from the handler are swallowed. |
| `start(delay?)` | `(delay?: number) => void` | Starts playback after `delay` seconds (default 0) from the current start offset, which is the start of the pattern unless you called `seek` or `pause`. Calling it on a running player cancels pending output and schedules playback again from that offset. Throws `RangeError("Invalid player timing.")` for a negative or non-finite delay, `Error("Haptic player is disposed.")` after disposal, and `Error("Haptic engine is disposed.")` after the session ends. |
| `stop()` | `() => void` | Ends playback, resets the offset to the start, cancels output and calls `completionHandler("cancelled")`. It does nothing on a player that is not in a started state. |
| `pause()` | `() => void` | Records the current position, cancels pending output and scheduled parameter changes, and holds the position. It does not call `completionHandler`. The session treats a paused player as active, so it does not report `players-finished`. Does nothing when the player is not running. |
| `resume()` | `() => void` | Continues from the paused position. On a stopped or never-started player it starts playback. |
| `seek(offset)` | `(offset: number) => void` | Moves the start offset to `offset` seconds. Must be finite and within 0 to `pattern.duration`, or it throws `RangeError("Invalid seek offset.")`. On a running player playback restarts from there. On an idle player the next `start()` begins there. Continuous and audio events that span the offset resume part-way through. |
| `sendParameters(parameters)` | `(parameters: readonly HFXHapticDynamicParameter[]) => void` | Applies parameter changes. A `relativeTime` of 0 applies the change immediately. A value you send stays in force, overriding the pattern's curves for that parameter, until you dispose the player. A positive `relativeTime` schedules the change that many seconds from now, in real time (the playback rate does not scale it). Scheduled changes are cancelled when the player stops, pauses, seeks or restarts. Throws `RangeError` when the list has more than 128 entries or an entry is invalid, `Error("Dynamic parameters are unavailable on this host.")` when the host cannot change parameters live, and `Error("Haptic player is disposed.")` after disposal. Values you send override the pattern's curves for the same parameter. |
| `dispose()` | `() => void` | Stops the player (calling `completionHandler("cancelled")` if it was playing), clears parameter overrides and releases the player from the session. Idempotent. Every later call to `start` or `sendParameters` throws. |

Timing behaviour to rely on:

- Events are scheduled in seconds from the start offset and divided by `playbackRate`, so a rate of 2 plays the pattern in half the time.
- An event that begins before the start offset is skipped, except continuous and audio events that are still sounding at the offset, which play their remainder.
- With `loopEnabled`, events after `loopEnd` are skipped and continuous events are cut at `loopEnd`.
- Parameter curves apply for the whole pattern. Where the host supports live parameters, the player samples the curves about every 16 ms and sends the values. Where it does not, the player folds each curve's `intensity` (or `audioVolume` for audio events) as a multiplier and `sharpness` as an offset into the event when the event starts.
- Playback ends with `completionHandler("error")` if the host throws while playing an event or applying a parameter.

### Playing a pattern with a completion handler

```ts
import { HFXHapticPattern } from "@syndromatic/syncloudos/fx/haptics";
import type { HFXHapticSession } from "@syndromatic/syncloudos/fx/haptics";

export function playOnce(session: HFXHapticSession, pattern: HFXHapticPattern): Promise<"completed" | "cancelled" | "error"> {
  return new Promise(resolve => {
    const player = session.makeAdvancedPlayer(pattern);
    player.completionHandler = reason => {
      player.dispose();
      resolve(reason);
    };
    player.start();
  });
}

export const tap = new HFXHapticPattern([{ type: "transient", relativeTime: 0, intensity: 0.8 }]);
```

The handler disposes the player after it reports. Disposing a finished player is safe and releases its slot in the session (a session holds up to 128 players).

### Pause, seek, rate and loop

```tsx
import { useEffect, useRef, useState } from "react";
import { useSynWareHaptics } from "@syndromatic/syncloudos/sdk";
import { HFXHapticParameterCurve, HFXHapticPattern } from "@syndromatic/syncloudos/fx/haptics";
import type { HFXHapticAdvancedPatternPlayer } from "@syndromatic/syncloudos/fx/haptics";

const pattern = new HFXHapticPattern(
  [
    { type: "continuous", relativeTime: 0, duration: 2, intensity: 0.6 },
    { type: "transient", relativeTime: 2, intensity: 1 },
  ],
  [new HFXHapticParameterCurve("intensity", [{ time: 0, value: 0.2 }, { time: 2, value: 1 }])],
);

export function PatternDeck() {
  const haptics = useSynWareHaptics();
  const player = useRef<HFXHapticAdvancedPatternPlayer | null>(null);
  const [state, setState] = useState("idle");

  useEffect(() => {
    const next = haptics.makeAdvancedPlayer(pattern);
    next.loopEnabled = true;
    next.completionHandler = reason => setState(reason);
    player.current = next;
    return () => {
      next.dispose();
      player.current = null;
    };
  }, [haptics]);

  return (
    <div>
      <button type="button" onClick={() => { player.current?.start(); setState("playing"); }}>Play</button>
      <button type="button" onClick={() => { player.current?.pause(); setState("paused"); }}>Pause</button>
      <button type="button" onClick={() => player.current?.resume()}>Resume</button>
      <button type="button" onClick={() => player.current?.seek(1)}>Seek to 1 s</button>
      <button type="button" onClick={() => { if (player.current) player.current.playbackRate = 2; }}>Double speed</button>
      <button type="button" onClick={() => player.current?.stop()}>Stop</button>
      <output>{state}</output>
    </div>
  );
}
```

### Sending parameters while a pattern plays

`sendParameters` needs a host that supports live parameters. Check `capabilities.dynamicParameters` first, and note that a scheduled change belongs to the player's current run.

```ts
import { HFXHapticPattern } from "@syndromatic/syncloudos/fx/haptics";
import type { HFXHapticSession } from "@syndromatic/syncloudos/fx/haptics";

export function rampDown(session: HFXHapticSession): () => void {
  const player = session.makeAdvancedPlayer(
    new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 3, intensity: 1 }]),
  );
  player.start();

  if (session.capabilities.dynamicParameters) {
    try {
      player.sendParameters([
        { parameterID: "intensity", value: 0.6, relativeTime: 1 },
        { parameterID: "intensity", value: 0.2, relativeTime: 2 },
      ]);
    } catch (error) {
      console.warn("Live parameters were refused", error);
    }
  }

  return () => player.dispose();
}
```

## Lifecycle events and playback policy

A session reports what it is doing through lifecycle events, and you can restrict what its patterns play.

### `HFXHapticLifecycleEvent`

A discriminated union of frozen event objects.

| `type` | Extra field | When it fires |
| --- | --- | --- |
| `"started"` | None | The session became running: `start()` resolved, or a player started while the session was idle. It fires once per run. |
| `"stopped"` | `reason: "requested" \| "auto-shutdown" \| "disposed"` | A running session stopped. `"requested"` follows `stop()` or `reset()`, `"auto-shutdown"` follows the last player finishing while `autoShutdown` is set, and `"disposed"` follows `dispose()`. |
| `"players-finished"` | None | The last active player finished, stopped or was disposed. |
| `"reset"` | None | `reset()` completed. |

### `HFXHapticPlaybackConfiguration`

Extra restrictions for structured patterns played through players. They never override host settings: if the user has switched vibration or button sounds off, those events stay silent whatever you configure. They do not affect `trigger()` presets.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `audioOnly` | `boolean` | `false` | Skips haptic events and cancels haptic output. |
| `hapticsOnly` | `boolean` | `false` | Skips audio events and cancels audio output. |
| `autoShutdown` | `boolean` | `false` | Stops the session when the last active player finishes. |

`configurePlayback` merges your fields into the current configuration. It throws `TypeError("Invalid session playback configuration.")` for an unknown key or a non-boolean value, and `Error("Audio-only and haptics-only policies conflict.")` when the merged result sets both `audioOnly` and `hapticsOnly`.

### `HFXHapticObservation`

The handle that `observe()` returns.

| Member | Type or signature | Description |
| --- | --- | --- |
| `dispose()` | `() => void` | Removes the listener. Idempotent. |

Observers run in registration order. An exception thrown by one observer is swallowed, so it cannot prevent others from running or interrupt teardown.

```tsx
import { useEffect, useState } from "react";
import { useSynWareHaptics } from "@syndromatic/syncloudos/sdk";
import { HFXHapticPattern } from "@syndromatic/syncloudos/fx/haptics";
import type { HFXHapticLifecycleEvent } from "@syndromatic/syncloudos/fx/haptics";

const pulse = new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 0.3, intensity: 0.7 }]);

export function PulseStatus() {
  const haptics = useSynWareHaptics();
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    haptics.configurePlayback({ autoShutdown: true });
    const observation = haptics.observe((event: HFXHapticLifecycleEvent) => {
      const label = event.type === "stopped" ? `stopped (${event.reason})` : event.type;
      setLog(entries => [...entries, label]);
    });
    return () => observation.dispose();
  }, [haptics]);

  const play = () => {
    const player = haptics.makePlayer(pulse);
    player.start();
  };

  return (
    <div>
      <button type="button" onClick={play}>Pulse</button>
      <ol>{log.map((entry, index) => <li key={index}>{entry}</li>)}</ol>
    </div>
  );
}
```

With `autoShutdown` enabled the log for one pulse reads `started`, `players-finished`, `stopped (auto-shutdown)`.

## Audio in patterns

`audio` events play PCM sound that you register with the session, and `audioContinuous` events synthesise a tone without a resource. Audio is subject to the host's audio availability and the user's button sound setting.

### `HFXAudioResource`

A frozen handle to audio that a session holds.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | The identifier to place in `HFXHapticEvent.audioResource`. It is valid only for the session that created it. |
| `duration` | `number` | The length in seconds, computed as frames divided by sample rate. |

`registerAudioResource(buffer, signal?)` on the session follows these rules.

- It takes a copy of the buffer, so later edits to your `AUFXAudioPCMBuffer` do not affect the resource. The buffer must contain at least one frame, so set `frameLength` before you register it.
- A session holds up to 64 resources. Registering beyond that, or on a host without audio support, rejects with an `Error`. The browser host also limits the total retained audio and rejects a registration that exceeds it with a `RangeError`.
- If the signal is already aborted, or aborts during registration, the promise rejects with the signal's reason and the host releases the audio.
- If `reset()` runs during registration, or the session is disposed, the promise rejects with an `Error` and the host releases the audio.
- Call `unregisterAudioResource(resource)` when you no longer need the sound. `reset()` and `dispose()` release every remaining resource.
- Playback of an audio event fails with `completionHandler("error")` when its resource has been unregistered, so keep a resource registered for as long as any player that uses it can run.

### Registering audio and playing it

```ts
import { AUFXAudioFormat, AUFXAudioPCMBuffer } from "@syndromatic/syncloudos/fx/audio";
import { HFXHapticPattern } from "@syndromatic/syncloudos/fx/haptics";
import type { HFXHapticAdvancedPatternPlayer, HFXHapticSession } from "@syndromatic/syncloudos/fx/haptics";

function makeClick(): AUFXAudioPCMBuffer {
  const format = new AUFXAudioFormat(44100, 1);
  const frames = 2205; // 50 ms
  const buffer = new AUFXAudioPCMBuffer(format, frames);
  buffer.frameLength = frames;
  for (let frame = 0; frame < frames; frame++) {
    const envelope = 1 - frame / frames;
    buffer.setSample(0, frame, Math.sin((2 * Math.PI * 880 * frame) / format.sampleRate) * envelope * 0.5);
  }
  return buffer;
}

export async function playClick(session: HFXHapticSession, signal?: AbortSignal): Promise<HFXHapticAdvancedPatternPlayer> {
  await session.start();
  const resource = await session.registerAudioResource(makeClick(), signal);
  const pattern = new HFXHapticPattern([
    { type: "transient", relativeTime: 0, intensity: 0.8 },
    { type: "audio", relativeTime: 0, audioResource: resource.id, intensity: 0.7, audioPan: -0.2 },
  ]);
  const player = session.makeAdvancedPlayer(pattern);
  player.completionHandler = () => {
    player.dispose();
    session.unregisterAudioResource(resource);
  };
  player.start();
  return player;
}
```

### Cancellation and teardown during registration

```ts
import { AUFXAudioFormat, AUFXAudioPCMBuffer } from "@syndromatic/syncloudos/fx/audio";
import type { HFXAudioResource, HFXHapticSession } from "@syndromatic/syncloudos/fx/haptics";

export async function tryRegister(session: HFXHapticSession, timeoutMs: number): Promise<HFXAudioResource | null> {
  const format = new AUFXAudioFormat(48000, 1);
  const buffer = new AUFXAudioPCMBuffer(format, 480);
  buffer.frameLength = 480;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await session.registerAudioResource(buffer, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return null; // timed out: the host released the audio
    if (error instanceof Error) console.warn(error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

## Capabilities and permissions

### `HFXHapticCapabilities`

A frozen snapshot from `session.capabilities`. Read it before you rely on a feature.

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `"available" \| "unavailable" \| "disposed"` | `"available"` when the device can produce haptic output, `"unavailable"` when it cannot, `"disposed"` after `dispose()`. |
| `timing` | `boolean` | `true` when haptic output is available. |
| `amplitude` | `boolean` | `true` when the host controls vibration strength directly. |
| `sharpness` | `boolean` | `true` when the host controls sharpness. |
| `audio` | `boolean` | `true` when `audioState` is `"available"`. |
| `audioState` | `"available" \| "permission-required" \| "unavailable" \| "disposed"` | `"permission-required"` means the browser has not yet allowed audio (call `start()` from a user gesture). `"unavailable"` means audio output could not be prepared. |
| `dynamicParameters` | `boolean` | `true` when live parameter changes and curves reach the host as parameters. |
| `fidelity.timing` | `"precise" \| "approximate" \| "unavailable"` | How closely events match their scheduled times. |
| `fidelity.amplitude` | `"precise" \| "timing-approximation" \| "unavailable"` | `"timing-approximation"` means intensity is expressed by changing pulse timing. |
| `fidelity.sharpness` | `"precise" \| "unavailable"` | Whether sharpness has any effect. |
| `fidelity.audio` | `"available" \| "permission-required" \| "unavailable" \| "disposed"` | The same value as `audioState`. |
| `fidelity.dynamicParameters` | `"precise" \| "timing-approximation" \| "unavailable"` | How faithfully live parameters are honoured. |
| `reason` | `string \| null` | A short explanation when the host is unavailable or degraded, such as "Haptic degradation: sharpness control is unavailable." It is `null` when nothing is degraded. |

The browser host reports the following. Vibration reaches the device only where the browser provides the Vibration API, and the API accepts pulse durations without amplitude or sharpness control.

| Situation | What the host reports |
| --- | --- |
| Browser with the Vibration API | `state: "available"`, `timing` `"approximate"`, `amplitude` and `sharpness` `false`, `fidelity.amplitude` `"timing-approximation"`, `fidelity.sharpness` `"unavailable"`, and `dynamicParameters` `true` with `"timing-approximation"` fidelity. |
| Browser without the Vibration API | `state: "unavailable"`, `isSupported` `false`, with the reason "Haptic actuator is unavailable; audio playback remains available." when audio can play. |
| Component not yet mounted | `state: "unavailable"`, with the reason "The component haptic owner is not mounted." |
| Disposed session | `state: "disposed"`, with the reason "Haptic engine is disposed." |

Where haptic hardware is missing, NSE controls that request feedback fall back to audio through the same engines. In your own code, do the same: check `isSupported` and provide an equivalent visual or audible cue.

### Permissions and denial

Declare `haptics.play` in the manifest `permissions` list. The permission is checked when a session is created, which happens after the component mounts. Without it, `createEngine` throws a `DOMException` with name `SecurityError` and the message "SynWare capability haptics.play must be declared." Because `useSynWareHaptics()` creates its session in a layout effect, the exception surfaces as a render error at mount, so declare the permission before you ship a component that uses the hook. If the application is closing, session creation rethrows the owner's abort reason instead.

The hook never prompts the user. The user's vibration and button sound switches, and the browser's audio policy, remain in force for every session. A pattern never turns on feedback that the user has turned off.

## Files: `HFXHapticPatternCodec`

Reads and writes patterns as text so designers can ship them as files. The class holds only static methods and you never construct it. Two formats are available: the native HFX JSON format, which preserves every field, and AHAP 1.0, the Core Haptics interchange format.

| Member | Type or signature | Description |
| --- | --- | --- |
| `encode(pattern)` (static) | `(pattern: HFXHapticPattern) => string` | Serialises to JSON of the form `{ "version": 1, "events": [...], "curves": [...] }`. It preserves every event field, including `name`. |
| `decode(text)` (static) | `(text: string) => HFXHapticPattern` | Parses HFX JSON and builds a validated pattern. Throws `RangeError("Pattern file exceeds limit.")` above 1,048,576 characters, a `SyntaxError` for invalid JSON, `TypeError("Invalid pattern file.")` when `version` is not 1 or `events` and `curves` are not arrays, and any error `HFXHapticPattern` or `HFXHapticParameterCurve` raise for invalid content. |
| `encodeAHAP(pattern)` (static) | `(pattern: HFXHapticPattern) => string` | Serialises to AHAP 1.0 JSON. It throws `TypeError` when any event has a `name`, because AHAP has no portable field for it. Use `encode` to keep names. |
| `decodeAHAP(text)` (static) | `(text: string) => HFXHapticPattern` | Parses AHAP 1.0. Throws `RangeError("AHAP file exceeds limit.")` above 1,048,576 characters, `TypeError("Invalid or unsupported AHAP version/pattern.")` for a version other than 1 or more than 4224 pattern entries, and a `TypeError` for an event field, event type, event parameter, dynamic parameter or pattern entry it cannot represent. It rejects unsupported content instead of dropping it. |

AHAP maps as follows.

| HFX | AHAP |
| --- | --- |
| `transient`, `continuous`, `audio`, `audioContinuous` | `HapticTransient`, `HapticContinuous`, `AudioCustom`, `AudioContinuous` |
| `relativeTime`, `duration` | `Time`, `EventDuration` |
| `audioResource`, `audioLoop`, `audioUseVolumeEnvelope` | `EventWaveformPath`, `EventWaveformLoopEnabled`, `EventWaveformUseVolumeEnvelope` |
| `intensity` | Event parameter `HapticIntensity`, or `AudioVolume` on audio events |
| `sharpness` | `HapticSharpness` |
| `attackTime`, `decayTime`, `releaseTime`, `sustained` | `AttackTime`, `DecayTime`, `ReleaseTime`, `Sustained` (1 or 0) |
| `audioBrightness`, `audioPan`, `audioPitch` | `AudioBrightness`, `AudioPan`, `AudioPitch` |
| Curve parameter IDs | `HapticIntensityControl`, `HapticSharpnessControl`, `AudioVolumeControl`, `AudioPanControl`, `AudioPitchControl`, `AudioBrightnessControl`, `HapticAttackTimeControl`, `HapticDecayTimeControl`, `HapticReleaseTimeControl`, `AudioAttackTimeControl`, `AudioDecayTimeControl`, `AudioReleaseTimeControl` |
| Curve `relativeTime`, points | `ParameterCurve.Time`, `ParameterCurveControlPoints` |

`decodeAHAP` also accepts a single `Parameter` entry and turns it into a one-point curve.

### Round trip through files

```ts
import { HFXHapticPattern, HFXHapticPatternCodec } from "@syndromatic/syncloudos/fx/haptics";

export function roundTrip(pattern: HFXHapticPattern): HFXHapticPattern {
  const text = HFXHapticPatternCodec.encode(pattern);
  return HFXHapticPatternCodec.decode(text);
}

export function importAHAP(text: string): HFXHapticPattern | null {
  try {
    return HFXHapticPatternCodec.decodeAHAP(text);
  } catch (error) {
    if (error instanceof SyntaxError) console.warn("The file is not valid JSON");
    else if (error instanceof RangeError) console.warn("The file exceeds a limit", error.message);
    else if (error instanceof TypeError) console.warn("The file uses a feature HapticsFX cannot represent", error.message);
    return null;
  }
}

const source = new HFXHapticPattern([{ type: "transient", relativeTime: 0, intensity: 1, name: "tap" }]);
console.log(HFXHapticPatternCodec.decode(HFXHapticPatternCodec.encode(source)).events[0]?.name); // "tap"
```

### AHAP audio events

AHAP names audio by a path. A decoded `audio` event keeps that path in `audioResource`, and `makeAdvancedPlayer` throws until the value is the `id` of a registered resource. Map the paths to resource ids before you make the player.

```ts
import { HFXHapticPattern, HFXHapticPatternCodec } from "@syndromatic/syncloudos/fx/haptics";
import type { HFXAudioResource, HFXHapticAdvancedPatternPlayer, HFXHapticSession } from "@syndromatic/syncloudos/fx/haptics";

export function bindAHAP(session: HFXHapticSession, ahap: string, resources: ReadonlyMap<string, HFXAudioResource>): HFXHapticAdvancedPatternPlayer {
  const decoded = HFXHapticPatternCodec.decodeAHAP(ahap);
  const bound = new HFXHapticPattern(
    decoded.events.map(event => {
      if (event.audioResource === undefined) return event;
      const resource = resources.get(event.audioResource);
      if (!resource) throw new Error(`No audio registered for ${event.audioResource}`);
      return { ...event, audioResource: resource.id };
    }),
    decoded.curves,
  );
  return session.makeAdvancedPlayer(bound);
}
```

## Hosting and tests

The remaining exports describe the engine that sessions wrap. Applications receive sessions and can ignore this section. Host authors and test authors use it to run the framework against their own output device.

### `HFXHapticEngine`

The engine that implements a session. It validates every request, tracks players, resources and observers, applies playback policy, and forwards work to an `HFXHapticPort`. The public methods of `HFXHapticSession` behave as the session table describes. A host constructs an engine with its port, and hands applications a session that exposes only the session members.

```text
new HFXHapticEngine(port: HFXHapticPort)
```

Session members that the engine also has: `currentTime`, `isSupported`, `capabilities`, `observe`, `configurePlayback`, `start`, `stop`, `reset`, `trigger`, `registerAudioResource`, `unregisterAudioResource`, `makePlayer`, `makeAdvancedPlayer` and `dispose`. `currentTime` uses the port's clock and falls back to `performance.now() / 1000`. The members below belong to the host side of the class.

| Member | Type or signature | Description |
| --- | --- | --- |
| `assertActive()` | `() => void` | Throws `Error("Haptic engine is disposed.")` after disposal. |
| `emit(event, delay?, offset?, rate?, originalDuration?)` | `(event: HFXHapticEvent, delay?: number, offset?: number, rate?: number, originalDuration?: number) => void` | Sends one event straight to the port outside any player. Delay and offset are in seconds and rate defaults to 1. Applies the audio-only, haptics-only and vibration switches. Throws when the port has no `event` operation. |
| `emitFromPlayer(player, event, delay?, offset?, rate?, originalDuration?)` | `(player: HFXHapticAdvancedPatternPlayer, event: HFXHapticEvent, ...) => void` | Sends an event on behalf of a player, through the port's `playerEvent`. Players call this. For an `audio` event it swaps the resource `id` for the port's own identifier. |
| `sendParameters(parameters, actuatorOwner?)` | `(parameters: readonly HFXHapticDynamicParameter[], actuatorOwner?: object) => void` | Validates up to 128 parameters and forwards them, to the player's owner when one is given. Throws `RangeError` for an invalid parameter or more than 128, and `Error` when the port has no `parameters` operation. |
| `playerDidStart(player)` | `(player: HFXHapticAdvancedPatternPlayer) => void` | Registers a player as active and emits `started` if the engine was idle. Players call this. |
| `playerDidFinish(player)` | `(player: HFXHapticAdvancedPatternPlayer) => void` | Removes the player from the active set. When it was the last one, emits `players-finished` and applies `autoShutdown`. Players call this. |
| `releasePlayer(player)` | `(player: HFXHapticAdvancedPatternPlayer) => void` | Removes a player from the engine's roster, which frees one of its 128 slots. `dispose()` on a player calls this. |
| `stopOutput(actuatorOwner?)` | `(actuatorOwner?: object) => void` | Cancels output for one player, or all direct output when no owner is given. Does nothing after disposal. |
| `cancel()` | `() => void` | Stops every player and cancels all port output. Does nothing after disposal. |
| `getVibrationEnabled()` | `() => boolean` | Returns the vibration switch (default `true`). |
| `setVibrationEnabled(enabled)` | `(enabled: boolean) => void` | When `false`, haptic events are dropped by the engine while audio events continue. Forwards the value to the port. |
| `setButtonSoundEnabled(enabled)` | `(enabled: boolean) => void` | Forwards the button sound switch to the port. |

`start()` awaits the port's `start` (if any) and emits `started`. `stop()` cancels output and emits `stopped` with reason `"requested"`. `reset()` unregisters every audio resource, cancels registrations in flight and emits `reset`. If the port throws during `stop` or `reset`, the engine finishes its own cleanup first and then rethrows the first failure. `dispose()` stops with reason `"disposed"`, marks the engine unusable, releases every resource and disposes the port, swallowing port failures so disposal always completes.

Limits: 128 players, 128 observers, 64 audio resources, 128 parameters per call.

### `HFXHapticPort`

The narrow host interface that an engine drives. A port is the only place where browser or device authority lives, so nothing of that authority reaches application options. Required members are `supported`, `trigger`, `cancel` and `dispose`. To create players, a port must also implement `playerEvent` and `playerCancel`. A port that advertises `parameters` must also implement `playerParameters`. `makeAdvancedPlayer` throws an `Error` naming the missing operation otherwise.

| Member | Type or signature | Description |
| --- | --- | --- |
| `supported` | `readonly boolean` | Whether haptic output is available. |
| `currentTime` | `readonly number \| undefined` | The port's clock in seconds. When absent, the engine uses `performance.now() / 1000`. |
| `audioState` | `"available" \| "permission-required" \| "unavailable" \| "disposed" \| undefined` | Audio availability. When absent, the engine reports `"available"` if the port can register audio and `"unavailable"` otherwise. |
| `capabilities` | `Readonly<{ amplitude: boolean; sharpness: boolean; timing?: "precise" \| "approximate"; amplitudeApproximation?: "timing"; dynamicParameters?: "precise" \| "timing-approximation" }> \| undefined` | Feature detail. Absent fields mean no amplitude, no sharpness, `"precise"` timing and `"precise"` dynamic parameters. |
| `trigger(request, options?)` | `(request: HFXFeedbackRequest, options?: HFXFeedbackOptions) => void \| Promise<void>` | Plays a preset. The engine has already validated the arguments. |
| `event` | `((event, delay?, offset?, rate?, originalDuration?) => void) \| undefined` | Plays an event outside a player. |
| `parameters` | `((parameters) => void) \| undefined` | Applies live parameters. Its presence is what makes `capabilities.dynamicParameters` true. |
| `playerEvent` | `((owner, event, delay?, offset?, rate?, originalDuration?) => void) \| undefined` | Plays an event on behalf of a player, identified by `owner`. Required for players. |
| `playerParameters` | `((owner, parameters) => void) \| undefined` | Applies live parameters for one player. |
| `playerStart` | `((owner) => void) \| undefined` | Notifies the port that a player started. |
| `registerAudioResource` | `((buffer, signal?) => Promise<string>) \| undefined` | Stores audio and returns the port's identifier for it. The engine passes a private copy. |
| `unregisterAudioResource` | `((resourceID: string) => void) \| undefined` | Releases stored audio. |
| `start` | `(() => Promise<void>) \| undefined` | Prepares the output, for example resuming audio. |
| `cancel()` | `() => void` | Cancels all current output. Required. |
| `playerCancel` | `((owner) => void) \| undefined` | Cancels one player's output. Required for players. |
| `dispose()` | `() => void` | Releases the port. Required. |
| `setVibrationEnabled` | `((enabled: boolean) => void) \| undefined` | Receives the vibration switch. |
| `setButtonSoundEnabled` | `((enabled: boolean) => void) \| undefined` | Receives the button sound switch. |
| `setPatternPlayback` | `((configuration: Readonly<{ audioOnly: boolean; hapticsOnly: boolean }>) => void) \| undefined` | Receives the merged playback policy after `configurePlayback`. |

### Testing patterns against a recording port

A port that records events lets you assert what a pattern would play, with no device.

```ts
import { HFXHapticEngine, HFXHapticPattern } from "@syndromatic/syncloudos/fx/haptics";
import type { HFXHapticEvent, HFXHapticPort } from "@syndromatic/syncloudos/fx/haptics";

export function recordPattern(pattern: HFXHapticPattern): Promise<readonly HFXHapticEvent[]> {
  const played: HFXHapticEvent[] = [];
  const port: HFXHapticPort = {
    supported: true,
    trigger: () => {},
    event: event => { played.push(event); },
    playerEvent: (_owner, event) => { played.push(event); },
    playerCancel: () => {},
    cancel: () => {},
    dispose: () => {},
  };

  const engine = new HFXHapticEngine(port);
  const player = engine.makeAdvancedPlayer(pattern);
  return new Promise(resolve => {
    player.completionHandler = () => {
      player.dispose();
      engine.dispose();
      resolve(played);
    };
    player.start();
  });
}

export const events = recordPattern(new HFXHapticPattern([{ type: "transient", relativeTime: 0, intensity: 1 }]));
```

## Errors and edge cases

| Situation | Behaviour |
| --- | --- |
| Manifest lacks `haptics.play` | The hook throws a `SecurityError` `DOMException` while the component mounts. |
| Action called before the component mounts | Throws `Error("The component haptic owner is not mounted.")`. `stop()` and `dispose()` do nothing. |
| Action called on a disposed session | Throws `Error("Haptic engine is disposed.")`. `stop()` and `dispose()` do nothing. |
| Device has no haptic hardware | `isSupported` is `false`. Presets and pattern haptic events do nothing, and audio events still play when audio is available. |
| Sharpness or amplitude requested on a host that lacks them | The value is accepted and ignored, and `capabilities.reason` says so. |
| `trigger` given an invalid preset, option key or option value | Rejects with `TypeError` or `RangeError` as described in the presets section. |
| Pattern built with an invalid event or curve | The constructor throws synchronously, and no player is created. |
| Audio event refers to an unregistered resource | `makePlayer` and `makeAdvancedPlayer` throw. |
| Host fails while a player runs, or an audio event's resource was unregistered | The player stops, cancels output and calls `completionHandler("error")`. |
| Two players want the vibration motor | The browser has one vibration actuator. The host gives it to the player that started most recently, so an older player's vibration is dropped while a newer one runs. Audio from both continues. |
| `pause()` on a player that is not running | Does nothing. |
| `stop()` on a player that never started | Does nothing, and `completionHandler` is not called. |

## Lifetimes and disposal

- A session belongs to the component that called `useSynWareHaptics()`. The hook disposes it on unmount, and the host disposes any session that outlives its application.
- Dispose each player you create when you finish with it. A session holds at most 128 players, and a disposed player is released immediately.
- A player's `completionHandler` runs once per run. `pause()` does not count as an end.
- `session.stop()` cancels output and leaves players usable. `session.reset()` also invalidates audio resources. `session.dispose()` ends everything, and the session cannot be used again.
- Observations, players and audio resources each have their own `dispose` or `unregister` call. Call them in an effect cleanup, in the reverse order to creation.
- Patterns, curves and events are immutable values with no lifetime of their own. Share them freely and keep them for as long as you like.

## Accessibility

Treat haptics as an enhancement. Every state that a haptic signals should also show in the interface. The user's feedback settings always win, so never depend on vibration to convey information, and give an alternative for devices where `isSupported` is `false`.

## Related

- [FX frameworks](README.md)
- [AudioFX](audio.md), for `AUFXAudioPCMBuffer` and `AUFXAudioFormat`, the types that carry audio you register as a resource
- [SynWare SDK](../synware-sdk.md)
- [SynWare manifest](../synware-manifest.md), for declaring `haptics.play`
- [NSE controls](../nse-controls.md), whose buttons and controls already request feedback for taps, pickups and drops
- [Testing SynWares](../testing-synware.md)
