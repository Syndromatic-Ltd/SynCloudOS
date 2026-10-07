# AudioFX

AudioFX (`AUFX`) is the web-native analogue of AVAudioEngine. It models sound as a graph of nodes joined by connections. Players and live inputs produce audio, effects and mixers process it, and an engine renders the result to the speakers or to a buffer. Everything that touches a device sits behind the mounted session, and everything else is deterministic, portable code that runs in tests and workers.

Three ideas organise the framework.

- **A graph, not a chain.** You attach nodes to an engine and connect them. Connections carry a channel map, so a mono player can feed a stereo mixer, and the engine rejects cycles and duplicate edges when you make the connection.
- **One renderer for live and offline.** Live output runs the graph in an AudioWorklet, and offline rendering runs the same processing code on the main thread in blocks of 128 frames. A graph sounds the same when you play it and when you render it to a file.
- **Explicit ownership.** Engines, sessions, files, recorders and taps all have a `dispose()`. The session releases whatever a component forgets when it unmounts.

Times in the public API are seconds and positions are frames. Sample data is 32-bit floating point in the range -1 to 1.

```ts
import { AUFXAudioFormat, AUFXAudioPCMBuffer } from "@syndromatic/syncloudos/fx/audio";
```

## At a glance

| | |
| --- | --- |
| Prefix | `AUFX` |
| Entry | `@syndromatic/syncloudos/fx/audio` |
| Hook | `useSynWareAudio`, from `@syndromatic/syncloudos/sdk` |
| Permissions | `audio.play` to make sound, `audio.record` to capture from a microphone |
| Analogue | AVAudioEngine (`AVAudioEngine`, `AVAudioNode`, `AVAudioPlayerNode`, `AVAudioFile`, `AVAudioSession`, `AVAudioConverter`) |

## What the entry exports

| Area | Symbols |
| --- | --- |
| Data | `AUFXAudioFormat`, `AUFXAudioPCMBuffer`, `AUFXAudioTime`, `AUFXAudioConverter` |
| Media time | `toMediaTime`, `fromMediaTime`, `AUFXRationalSampleRate`, `AUFXMediaTimeOptions`, `AUFXFromMediaTimeOptions` |
| Clock observation | `AUFXClockObservation`, `AUFXClockDomain`, `AUFXClockObservationInit` |
| Graph | `AUFXAudioEngine`, `AUFXAudioNode`, `AUFXAudioConnection`, `AUFXAudioConnectionOptions`, `AUFXAudioChannelMap`, `normalizeAUFXAudioChannelMap`, `AUFXAudioTap` |
| Sources | `AUFXAudioPlayerNode`, `AUFXAudioSchedule`, `AUFXAudioScheduleResult`, `AUFXAudioInputNode`, `AUFXAudioInputNodeState`, `AUFXAudioInputSourceFormat` |
| Processing | `AUFXAudioMixerNode`, `AUFXAudioEffectNode`, `AUFXAudioEffect`, `AUFXAudioTimePitchNode`, `AUFXAudioTimePitchOptions`, `AUFXAudioProcessor`, `AUFXAudioParameter` |
| Analysis | `AUFXAudioAnalyser` |
| Files and streams | `AUFXAudioFile`, `AUFXAudioChunkStream`, `AUFXAudioChunk`, `AUFXAudioChunkStreamOptions`, and the codec, open and export types |
| Capture | `AUFXAudioSession`, `AUFXAudioSessionState`, `AUFXAudioRoute`, `AUFXAudioDevice`, `AUFXAudioRecorder`, `AUFXAudioRecorderOptions`, `AUFXAudioRecorderState`, `AUFXAudioRecording` |

## Formats, buffers and time

### `AUFXAudioFormat`

A description of PCM audio. It is immutable.

```text
new AUFXAudioFormat(sampleRate: number, channelCount: number, isInterleaved = false)
```

| Member | Description |
| --- | --- |
| `sampleRate` | Frames per second, from 1 to 384,000. |
| `channelCount` | An integer from 1 to 32. |
| `isInterleaved` | True when samples alternate by channel in memory. The default is planar. The choice affects storage only, never how you index samples. |
| `isEqual(other)` | True when all three fields match. Nodes and buffers require equal formats where their documentation says so. |

The constructor throws `RangeError` for values outside those ranges.

### `AUFXAudioPCMBuffer`

A bounded run of floating point samples.

```text
new AUFXAudioPCMBuffer(format: AUFXAudioFormat, frameCapacity: number)
```

The capacity is fixed at creation, and `frameCapacity * channelCount` cannot exceed 16,777,216 samples. The buffer starts with a `frameLength` of 0, so **set `frameLength` before you write samples**. Reads and writes are limited to frames below `frameLength`.

| Member | Type or signature | Description |
| --- | --- | --- |
| `format` | `AUFXAudioFormat` | The format. |
| `frameCapacity` | `number` | The most frames the buffer can hold. |
| `frameLength` | `number` | The frames in use. Settable from 0 up to `frameCapacity`. |
| `getSample(channel, frame)` | `number` | Reads one sample. Throws `RangeError` for an index out of bounds. |
| `setSample(channel, frame, sample)` | `void` | Writes one sample. The sample must be finite. |
| `copy()` | `AUFXAudioPCMBuffer` | A deep copy. |

### `AUFXAudioTime`

A position in frames on a timeline with a known rate.

```text
new AUFXAudioTime(sampleTime: number, sampleRate: number)
```

`sampleTime` must be a non-negative safe integer and `sampleRate` a positive finite number.

| Member | Description |
| --- | --- |
| `sampleTime`, `sampleRate` | The values you passed. |
| `seconds` | `sampleTime / sampleRate`. |
| `static fromSeconds(seconds, sampleRate)` | Rounds to the nearest frame. |

### `toMediaTime` and `fromMediaTime`

These convert between sample positions and [MediaFX](media.md) time, so audio can share a timebase with video and MIDI.

```text
toMediaTime(audioTime: AUFXAudioTime, options?: AUFXMediaTimeOptions): MEFXTime
fromMediaTime(mediaTime: MEFXTime, sampleRate: number, options?: AUFXFromMediaTimeOptions): AUFXAudioTime
```

`toMediaTime` is exact: `n` frames at 48,000 Hz become the rational time `n / 48000`. `fromMediaTime` refuses to round silently. It throws `RangeError` when the media time does not fall on a whole frame, unless you pass `rounding` (`"floor"`, `"ceil"`, `"toward-zero"` or `"nearest-even"`). It accepts only finite times with epoch 0.

Fractional sample rates such as 44,100/1.001 need `exactSampleRate: { numerator, denominator }` in the options, and the ratio must equal the rate you pass. `AUFXRationalSampleRate` is that pair, `AUFXMediaTimeOptions` holds `exactSampleRate`, and `AUFXFromMediaTimeOptions` adds `rounding`.

```ts
import { AUFXAudioTime, fromMediaTime, toMediaTime } from "@syndromatic/syncloudos/fx/audio";

const audio = new AUFXAudioTime(24_000, 48_000);
const media = toMediaTime(audio); // 24000/48000 s, exactly half a second
export const seconds = media.toSeconds(); // 0.5

export const back = fromMediaTime(media, 44_100, { rounding: "nearest-even" }); // 22050 frames at 44.1 kHz
```

### `AUFXClockObservation`

A point that ties a sample position to a named clock, for code that needs to align audio with other streams.

| Field | Description |
| --- | --- |
| `samplePosition`, `sampleRate` | The position and its rate. `seconds` divides one by the other. |
| `domain` | `"source"` (a file or stream position), `"render"` (the graph's render clock) or `"output"` (what the device is playing). |
| `hostAnchorSeconds` | The host clock reading at that position, or `null` when unknown. |
| `uncertaintySeconds` | How far the correlation might be off. |
| `discontinuityGeneration` | Increases when the position jumps, for example after a seek. |

`AUFXClockObservationInit` is the constructor argument with the same six fields.

## The engine and its graph

### `AUFXAudioEngine`

Owns a graph of nodes and renders it. It always contains a `mainMixerNode`, which is the graph's output.

```text
new AUFXAudioEngine(format: AUFXAudioFormat, output?: AUFXAudioGraphOutput, inputCapability?: object)
```

Construct an engine yourself for offline rendering, which needs no permission. For live sound, use `useSynWareAudio().createEngine(format)`, which supplies the output and disposes the engine when the component unmounts.

| Member | Type or signature | Description |
| --- | --- | --- |
| `format` | `AUFXAudioFormat` | The engine's format. |
| `mainMixerNode` | `AUFXAudioMixerNode` | The output node. Connect sources here. |
| `isRunning` | `boolean` | True while live output runs. |
| `lastError` | `unknown` | The error that stopped live output, or `null`. |
| `connections` | `readonly AUFXAudioConnection[]` | A snapshot of every connection. |
| `attach(node)` | `void` | Adds a node. A node belongs to one engine. A graph holds at most 128 nodes. |
| `detach(node)` | `void` | Removes a node and its connections. The main mixer cannot be detached. |
| `connect(source, destination, options?)` | `AUFXAudioConnection` | Joins two attached nodes. Options are `sourceBus`, `destinationBus` and `channelMap`. Throws on a duplicate edge or a cycle. |
| `disconnect(connection)` or `disconnect(source, destination?)` | `void` | Removes one connection, or every connection from `source` (to `destination` when given). |
| `installTap(node, callback)` | `AUFXAudioTap` | Calls `callback` with each rendered block from a node, for meters and visualisers. An engine allows 32 taps. Dispose the returned tap to remove it. |
| `start(signal?)` | `Promise<void>` | Starts live output. Needs a user gesture in most browsers. Throws if the engine has no output or is already running. |
| `stop()` | `void` | Stops live output. |
| `renderOffline(frames, signal?)` | `Promise<AUFXAudioPCMBuffer>` | Renders `frames` frames of the graph into one buffer. |
| `renderOfflineChunks(frames, options?)` | `AUFXAudioChunkStream` | Renders in chunks that you consume as an async iterable. |
| `createTimelineTransport(players?, signal?)` | transport | Coordinates play, pause, seek and rate across players with acknowledged timing. See below. |
| `observeOutputClock()` | `AUFXClockObservation \| null` | The device output position, when the output provides one. |
| `reset()` | `void` | Resets every node's state. |
| `dispose()` | `void` | Releases the engine. |

Mutating the graph while the engine renders offline throws, and mutating it while live is validated first, so a bad change leaves the running graph untouched.

**Offline limits.** `renderOffline` rejects more than 16,777,216 samples (frames times channels) and any graph whose work estimate exceeds its budget, with a `RangeError`. A graph that contains a live input cannot render offline and throws an error named `AUFXUnsupportedOfflineInputError`. `renderOfflineChunks` accepts `chunkFrames` (default and maximum 2,048 frames) and a `signal`. An engine has one active chunk stream at a time.

**Live output.** The engine builds a render plan from the graph and hands it to the AudioWorklet. Changes to node parameters, connections and schedules publish a new plan without an audible gap. The output obeys the master volume and the application's own volume, enabled state and suspension, so a graph can never override host policy.

```ts
import {
  AUFXAudioAnalyser,
  AUFXAudioEffectNode,
  AUFXAudioEngine,
  AUFXAudioFormat,
  AUFXAudioPCMBuffer,
  AUFXAudioPlayerNode,
} from "@syndromatic/syncloudos/fx/audio";

export async function renderPingWithEcho() {
  const format = new AUFXAudioFormat(48_000, 1);

  // A 0.1 s, 880 Hz tone.
  const ping = new AUFXAudioPCMBuffer(format, 4_800);
  ping.frameLength = 4_800;
  for (let frame = 0; frame < ping.frameLength; frame += 1) {
    const envelope = 1 - frame / ping.frameLength;
    ping.setSample(0, frame, 0.5 * envelope * Math.sin((2 * Math.PI * 880 * frame) / format.sampleRate));
  }

  const engine = new AUFXAudioEngine(format);
  const player = new AUFXAudioPlayerNode(format);
  const echo = new AUFXAudioEffectNode(format, { type: "delay", delayTime: 0.15, feedback: 0.4, wet: 0.5 });
  engine.attach(player);
  engine.attach(echo);
  engine.connect(player, echo);
  engine.connect(echo, engine.mainMixerNode);

  player.scheduleBuffer(ping, 0);
  player.play();

  try {
    const rendered = await engine.renderOffline(48_000); // one second
    return AUFXAudioAnalyser.level(rendered);
  } finally {
    engine.dispose();
  }
}
```

### `AUFXAudioNode`

The abstract base of every node. You rarely subclass it, but all nodes share its members.

| Member | Description |
| --- | --- |
| `format` | The node's `AUFXAudioFormat`. |
| `inputBusCount`, `outputBusCount` | How many buses the node accepts and offers. Most nodes have one of each. A mixer accepts 32 inputs, and sources have no inputs. |
| `processingCost` | A relative work estimate the engine sums to keep graphs inside its work budget. |
| `render(inputs, frames, startTime, signal?)` | Produces `frames` frames. The engine calls it, and you call it only in tests. |
| `reset()` | Clears internal state such as filter history. |
| `dispose()` | Resets the node. |

### `AUFXAudioConnection` and channel maps

A connection is an immutable edge between two nodes, created by `engine.connect`.

| Member | Description |
| --- | --- |
| `id` | A positive integer unique within the engine. |
| `source`, `destination` | The two nodes. |
| `sourceBus`, `destinationBus` | The bus indexes. |
| `sourceFormat`, `destinationFormat` | The formats of the two nodes. |
| `negotiatedFormat` | The destination format, which the signal is converted to. |
| `channelMap` | A matrix with one row per destination channel and one weight per source channel. |

Without an explicit map, the engine picks one. A mono source feeds every destination channel at full gain, a mono destination receives the average of the source channels, and otherwise channel `n` maps to channel `n` (the last source channel repeats when the destination has more). Supply your own `channelMap` to pan or swap channels. Every row must have one weight per source channel, with each weight finite and at most 16 in magnitude. `normalizeAUFXAudioChannelMap(sourceChannels, destinationChannels, map?)` returns the validated matrix, or the default when you omit it.

`AUFXAudioChannelMap` is the matrix type (`readonly (readonly number[])[]`) and `AUFXAudioConnectionOptions` describes the options object.

```ts
import { AUFXAudioEngine, AUFXAudioFormat, AUFXAudioPlayerNode } from "@syndromatic/syncloudos/fx/audio";

const stereo = new AUFXAudioFormat(48_000, 2);
const engine = new AUFXAudioEngine(stereo);
const mono = new AUFXAudioPlayerNode(stereo);
engine.attach(mono);

// Send the player to the left channel only, at 70 percent.
engine.connect(mono, engine.mainMixerNode, { channelMap: [[0.7, 0], [0, 0]] });
```

### `AUFXAudioTap`

The handle `installTap` returns. Its only method is `dispose()`.

## Sources

### `AUFXAudioPlayerNode`

Plays PCM buffers that you schedule. The node keeps its own copy of each scheduled buffer, so changing your array afterwards has no effect.

```text
new AUFXAudioPlayerNode(format: AUFXAudioFormat)
```

| Member | Type or signature | Description |
| --- | --- | --- |
| `scheduleBuffer(buffer, atTime?, loop?, completion?)` | `AUFXAudioSchedule` | Schedules a whole buffer. `atTime` is a position on the player's timeline in seconds and defaults to the current position. The buffer's format must equal the node's. |
| `scheduleSegment(buffer, startFrame, frameCount, atTime?, loop?, completion?)` | `AUFXAudioSchedule` | Schedules part of a buffer. |
| `play()`, `pause()` | `void` | Start and stop advancing the timeline. Scheduled audio plays when the timeline reaches it. |
| `stop()` | `void` | Pauses, rewinds to 0 and cancels every schedule. |
| `seek(seconds)` | `void` | Moves the timeline. Non-looping schedules that end before the new position are cancelled. |
| `currentTime` | `number` | The timeline position in seconds. |
| `playbackRate` | `number` | Speed as a multiplier above 0 and up to 4. Changes pitch as well. |
| `isPlaying` | `boolean` | True between `play()` and `pause()` or `stop()`. |
| `retainTimelineSchedules()` | `() => void` | Reserved for timeline transports. Returns a release function. |

A player accepts at most 256 schedules, and the retained samples across them cannot exceed 16,777,216. A schedule that would end before the current position and does not loop is rejected with `RangeError`.

`AUFXAudioSchedule` has `cancel()` and `completed`, a promise for an `AUFXAudioScheduleResult`: `{ status: "rendered", endSampleTime }` when the audio reached the graph output (the frame in the engine's timeline where it ended), or `{ status: "cancelled" }`. A completed schedule means the audio was rendered into the graph. It does not claim the listener has heard it. The optional `completion` callback receives the same result, and an exception in it cannot disturb rendering.

### `AUFXAudioInputNode`

A live microphone (or other capture) source. Obtain one from `session.createInputNode(format)`. It renders only in live engines, and an offline render throws `AUFXUnsupportedOfflineInputError`.

| Member | Description |
| --- | --- |
| `state` | `"active"`, `"muted"`, `"interrupted"` or `"disposed"` (`AUFXAudioInputNodeState`). |
| `sourceFormat` | The device's actual `{ sampleRate, channelCount }` (`AUFXAudioInputSourceFormat`), with `null` fields until known. |
| `subscribe(listener)` | Calls the listener when state changes. Returns an unsubscribe function. |
| `dispose()` | Releases the capture. |

An engine allows four live input nodes, and an input must come from a session created by the same mounted application.

## Processing nodes

### `AUFXAudioMixerNode`

Sums its inputs and applies a gain.

| Member | Description |
| --- | --- |
| `inputBusCount` | 32. |
| `volume` | An `AUFXAudioParameter` from 0 to 1, default 1. Automate it for fades. |
| `muted` | A boolean. |

Every engine has one main mixer. Create more to group sources, for example a music bus and an effects bus that you mute independently.

### `AUFXAudioEffectNode`

Applies one built-in effect. The effect is fixed when you construct the node, and it is frozen. Create a new node to change it.

```text
new AUFXAudioEffectNode(format: AUFXAudioFormat, effect: AUFXAudioEffect)
```

`AUFXAudioEffect` is a tagged union:

| `type` | Fields | Valid range |
| --- | --- | --- |
| `"delay"` | `delayTime`, `feedback`, `wet` | `delayTime` from one frame to 10 s, `feedback` from 0 up to but excluding 1, `wet` 0 to 1 |
| `"lowpass"`, `"highpass"` | `frequency` | Above 0 and below half the sample rate |
| `"bandpass"`, `"notch"` | `frequency`, `q?` | The same frequency range, `q` from 0.1 to 30 (default about 0.707) |
| `"equalizer"` | `bands: { frequency, gain, q }[]` | Up to 32 bands, `gain` -24 to 24 dB, `q` 0.1 to 30 |
| `"reverb"` | `decayTime`, `wet`, `damping?` | `decayTime` 0.1 to 20 s, `wet` 0 to 1, `damping` 0 to 0.99 (default 0.3) |
| `"compression"` | `threshold`, `ratio`, `attackTime?`, `releaseTime?`, `knee?`, `makeupGain?` | `threshold` above 0 up to 1 (linear amplitude), `ratio` 1 to 100, `attackTime` 0 to 1 s (0.003), `releaseTime` 0 to 5 s (0.25), `knee` 0 to 40 dB (6), `makeupGain` -24 to 24 dB (0) |

The constructor throws `RangeError` for any value outside its range, and for delay or reverb storage that would exceed the memory budget. `effect` returns the frozen effect. `reset()` clears the filter and delay state.

### `AUFXAudioTimePitchNode`

Shifts pitch without changing duration in a live graph, and can stretch time on a whole buffer.

```text
new AUFXAudioTimePitchNode(format: AUFXAudioFormat, options?: AUFXAudioTimePitchOptions)
```

| Option | Range | Default | Meaning |
| --- | --- | --- | --- |
| `pitchSemitones` | -12 to +12 | 0 | Pitch offset. |
| `timeScale` | 0.5 to 2 | 1 | Output duration divided by input duration, for `processBuffer` only. |

| Member | Description |
| --- | --- |
| `pitchSemitones`, `pitchRatio`, `timeScale` | The resolved settings. `pitchRatio` is `2 ** (semitones / 12)`. |
| `windowFrames` | The analysis window in frames. |
| `algorithmLatency`, `tailTime` | The delay the effect introduces, in seconds. Zero when the pitch is unchanged. |
| `processBuffer(input)` | Processes a finite buffer, applying both pitch and time scale. Returns a new buffer whose length reflects `timeScale`. The input format must equal the node's. |

A live graph runs at a fixed rate and cannot consume upstream audio at a different long-term rate without unbounded buffering, so a node with a `timeScale` other than 1 throws `RangeError` if you render it in a graph. Use `processBuffer` for time stretching.

### `AUFXAudioProcessor`

A custom finite impulse response (FIR) filter. You supply the coefficients, so you can build filters and convolutions that the built-in effects do not cover, and the framework keeps the work bounded: no arbitrary code runs in the audio thread.

```text
new AUFXAudioProcessor(format: AUFXAudioFormat, coefficients: readonly number[])
```

The kernel holds 1 to 512 finite coefficients, each at most 16 in magnitude. `coefficients` returns the frozen kernel, and `processingCost` equals its length.

```ts
import { AUFXAudioFormat, AUFXAudioProcessor } from "@syndromatic/syncloudos/fx/audio";

const format = new AUFXAudioFormat(48_000, 2);
// A 5-tap moving average, a gentle low-pass filter.
export const smoother = new AUFXAudioProcessor(format, [0.2, 0.2, 0.2, 0.2, 0.2]);
```

### `AUFXAudioParameter`

A value that can change over time, used for gains and other controls.

```text
new AUFXAudioParameter(initialValue = 1, minimum = 0, maximum = 1)
```

| Member | Description |
| --- | --- |
| `minimum`, `maximum` | The allowed range. |
| `value` | The value before any scheduled event. Setting it validates the range. |
| `setValueAtTime(value, seconds)` | Jumps to `value` at a time on the engine timeline. |
| `linearRampToValueAtTime(value, seconds)` | Ramps in a straight line from the previous event to `value` at `seconds`. |
| `cancelScheduledValues(seconds)` | Removes events at or after `seconds`. |
| `valueAt(seconds)` | The value at a time, for display or tests. |

A parameter holds up to 4,096 events. A second event at the same time replaces the first. Values must be finite and within range, and times must be finite and non-negative, or the call throws `RangeError`. A change to a parameter on an attached node reaches a running engine on its next plan.

```ts
import { AUFXAudioEngine, AUFXAudioFormat } from "@syndromatic/syncloudos/fx/audio";

const engine = new AUFXAudioEngine(new AUFXAudioFormat(48_000, 2));
const gain = engine.mainMixerNode.volume;

// Fade in over two seconds, then fade out between 10 and 12 seconds.
gain.setValueAtTime(0, 0);
gain.linearRampToValueAtTime(1, 2);
gain.setValueAtTime(1, 10);
gain.linearRampToValueAtTime(0, 12);
```

## Analysis

### `AUFXAudioAnalyser`

Static measurements on a buffer.

| Member | Description |
| --- | --- |
| `static level(buffer)` | Returns `{ peak, rms }` over all channels. The peak is the largest absolute sample and the RMS is the square root of the mean square. Both are linear, so convert to decibels with `20 * Math.log10(value)`. |
| `static spectrum(buffer, fftSize?, channel?)` | Returns `{ magnitudes, binWidth, fftSize }`. `magnitudes` holds `fftSize / 2 + 1` values from 0 Hz up to the Nyquist frequency, scaled so a full-scale sine reads about 1. `binWidth` is the spacing in Hz. The FFT size must be a power of two from 32 to 32,768 (default 1024), and the analysis applies a Hann window. Frames past the end of the buffer count as silence. |

Pair `spectrum` with `installTap` to draw a live visualiser.

```tsx
import { useEffect, useRef } from "react";
import { AUFXAudioAnalyser, type AUFXAudioEngine } from "@syndromatic/syncloudos/fx/audio";

export function Meter({ engine }: { engine: AUFXAudioEngine }) {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tap = engine.installTap(engine.mainMixerNode, (buffer) => {
      const { peak } = AUFXAudioAnalyser.level(buffer);
      if (bar.current) bar.current.style.width = `${Math.min(1, peak) * 100}%`;
    });
    return () => tap.dispose();
  }, [engine]);

  return <div style={{ background: "#333", height: 8 }}><div ref={bar} style={{ background: "#3c9", height: 8 }} /></div>;
}
```

## Converting audio

### `AUFXAudioConverter`

```text
AUFXAudioConverter.convert(source: AUFXAudioPCMBuffer, format: AUFXAudioFormat, signal?: AbortSignal): AUFXAudioPCMBuffer
```

Resamples with linear interpolation and maps channels: a stereo source downmixes to mono by averaging, and other channel counts repeat the last source channel. The output holds `round(frames * newRate / oldRate)` frames. The signal is checked every 1,024 frames. Use it for quick conversions such as adjusting a loaded sample to the engine's rate. For music-quality resampling, render through an engine with a high sample rate.

## Files

### `AUFXAudioFile`

An in-memory view of PCM audio with file-like reading, writing and WAV interchange. It never touches the file system. The host opens files through `useSynWareAudio().openFile()`, which decodes compressed formats and gives you an `AUFXAudioFile`.

```text
new AUFXAudioFile(buffer, mode?: "read" | "read-write", frameCapacity?, metadata?)
```

The constructor copies `buffer`. Mode `"read-write"` allows writing, and `frameCapacity` (default the buffer's length) sets the room for growth.

| Member | Type or signature | Description |
| --- | --- | --- |
| `fileFormat` | `AUFXAudioFormat` | The format on disk. |
| `processingFormat` | `AUFXAudioFormat` | The format of the samples you read and write. |
| `url` | `string \| null` | Where the file came from, when known. |
| `length` | `number` | Frames in the file. |
| `framePosition` | `number` | The read and write position. Settable. A jump advances the clock observation's discontinuity generation. |
| `isOpen` | `boolean` | False after `close()`. |
| `read(into, frameCount?)` | `number` | Reads into a buffer of the same format and returns the frames read. |
| `readFrames(count)` | `AUFXAudioPCMBuffer` | Reads into a new buffer, up to 16,777,216 frames. |
| `write(buffer)` | `void` | Writes at the position, growing the length. Throws on a read-only file, a format mismatch or exceeded capacity. |
| `observeClock()` | `AUFXClockObservation` | The source-domain position. |
| `toWAV()` | `ArrayBuffer` | Encodes 16-bit PCM WAV. |
| `close()`, `dispose()` | `void` | Releases the data. |
| static `encodeWAV(buffer)` | `ArrayBuffer` | A complete 16-bit PCM WAV file. |
| static `encodeWAVHeader(format, frameLength)` | `Uint8Array` | The 44-byte header alone, for streaming. |
| static `encodePCM16Chunk(buffer)` | `Uint8Array` | Interleaved 16-bit little-endian samples, for streaming. |
| static `decodeWAV(bytes)` | `AUFXAudioPCMBuffer` | Parses 16-bit PCM WAV of up to 64 MiB. Throws `TypeError` for other encodings and `RangeError` for truncated data. |

```ts
import { AUFXAudioFile, AUFXAudioFormat, AUFXAudioPCMBuffer } from "@syndromatic/syncloudos/fx/audio";

const format = new AUFXAudioFormat(44_100, 1);
const samples = new AUFXAudioPCMBuffer(format, 44_100);
samples.frameLength = 44_100;
for (let frame = 0; frame < samples.frameLength; frame += 1) {
  samples.setSample(0, frame, 0.25 * Math.sin((2 * Math.PI * 440 * frame) / format.sampleRate));
}

const wav = AUFXAudioFile.encodeWAV(samples);
const decoded = AUFXAudioFile.decodeWAV(wav);
export const sameLength = decoded.frameLength === samples.frameLength; // true
```

### Codec capabilities and export

The session client exposes host codec support and file export. These types describe them.

| Type | Meaning |
| --- | --- |
| `AUFXAudioFileCapabilities` | `{ decode, encode }`, each a list of `AUFXAudioCodecSupport` (`mimeType` and `provenance` of `"portable"` or `"observed-browser"`). |
| `AUFXAudioCodecConfiguration` | A codec request: `mimeType`, `codec`, `sampleRate`, `channelCount`, `bitrate?`. |
| `AUFXAudioCodecNegotiation` | A configuration plus `decode`, `encode` and `provenance` (`"portable"`, `"webcodecs-probe"` or `"unavailable"`). |
| `AUFXAudioFileOpenRequest` | `{ source, processingFormat? }`. Ask for a processing format to receive samples converted to it. |
| `AUFXAudioFileExportOptions` | `{ format: "wav" \| "opus-webm", bitrate? }`. |
| `AUFXAudioFileExport` | `{ data: Blob, mimeType, byteLength, fileType }`, for `"audio/wav"` or `"audio/webm"`. |
| `AUFXAudioStreamExportOptions` | `{ source: AUFXAudioChunkStream, sink: WritableStream<Uint8Array>, format: "opus-webm", bitrate? }`. Neither the input nor the output is held whole in memory. |
| `AUFXAudioStreamExport` | `{ mimeType: "audio/webm", fileType: "webm", byteLength }`. |

`exportFile(file, signal, { format })` writes WAV by default. On hosts with WebCodecs, `format: "opus-webm"` encodes 48 kHz mono or stereo PCM into audio-only WebM. The Opus path preserves the source length exactly, using the codec's pre-skip and final padding. `exportStream` does the same from a chunk stream to a writable stream, so an hour of audio can render and encode with bounded memory.

### `AUFXAudioChunkStream`

A single-consumer async iterable of PCM chunks. `engine.renderOfflineChunks()` returns one, and you can create your own from an async generator.

```text
new AUFXAudioChunkStream(factory: (signal: AbortSignal) => AsyncGenerator<AUFXAudioChunk>, signal?: AbortSignal)
```

| Member | Description |
| --- | --- |
| `[Symbol.asyncIterator]()` | Starts the stream. A second consumer throws an `InvalidStateError` `DOMException`. |
| `cancel(reason?)` | Aborts the generator's signal so it stops promptly. |

`AUFXAudioChunk` holds a `buffer` and an `observation` (an `AUFXClockObservation` that locates the chunk). `AUFXAudioChunkStreamOptions` has `chunkFrames` and `signal`.

```ts
import { AUFXAudioEngine, AUFXAudioFile, AUFXAudioFormat } from "@syndromatic/syncloudos/fx/audio";

export async function renderToWavParts(engine: AUFXAudioEngine, seconds: number) {
  const format = engine.format;
  const total = Math.round(seconds * format.sampleRate);
  const parts: Uint8Array[] = [AUFXAudioFile.encodeWAVHeader(format, total)];
  for await (const chunk of engine.renderOfflineChunks(total, { chunkFrames: 4096 })) {
    parts.push(AUFXAudioFile.encodePCM16Chunk(chunk.buffer));
  }
  return new Blob(parts as BlobPart[], { type: "audio/wav" });
}

export const mono = new AUFXAudioFormat(48_000, 1);
```

## Sessions and recording

### `AUFXAudioSession`

The application's capture and routing authority. It comes from `useSynWareAudio().createSession()`. Its constructor takes a host-private port, so applications never build one.

| Member | Type or signature | Description |
| --- | --- | --- |
| `state` | `AUFXAudioSessionState` | `"idle"`, `"requesting"`, `"authorized"`, `"recording"`, `"paused"`, `"interrupted"`, `"denied"`, `"unavailable"` or `"disposed"`. |
| `route` | `AUFXAudioRoute` | `desiredInput`, `actualInput`, `desiredOutput`, `actualOutput`, each a device ID or `null`. |
| `interruptionReason` | `AUFXAudioInterruptionReason \| null` | Why the session was interrupted: `"input-ended"`, `"input-device-removed"`, `"input-acquisition-failed"`, `"permission-denied"`, `"output-selection-failed"` or `"output-device-removed"`. |
| `capabilities` | `{ capture, inputSelection, outputSelection, mimeTypes }` | What the browser supports. `mimeTypes` lists recordable formats. |
| `requestRecordAuthorization(signal?)` | `Promise<void>` | Asks the user for microphone access. Rejects with a `NotAllowedError` `DOMException` when refused. Requires the `audio.record` permission. |
| `enumerateDevices(signal?)` | `Promise<readonly AUFXAudioDevice[]>` | Lists inputs and outputs (`id`, `kind`, `label`, `groupId`). Labels are empty until the user grants access. |
| `setPreferredInput(deviceId, signal?)`, `setPreferredOutput(deviceId, signal?)` | `Promise<void>` | Chooses a device. |
| `recoverRoute(options?, signal?)` | `Promise<AUFXAudioRouteRecoveryResult>` | Retries after an interruption. Options: `input` (`"none"` or `"if-authorized"`) and `output` (`"none"` or `"retry-desired"`). The result reports each side as `"not-requested"`, `"authorization-required"`, `"recovered"` or `"unavailable"`, with the current route and the interruption reason. |
| `createRecorder(options?)` | `AUFXAudioRecorder` | A recorder over the current input. |
| `createInputNode(format)` | `AUFXAudioInputNode` | A live input for an engine graph. |
| `subscribe(listener)` | `() => void` | Calls the listener when state or route changes. |
| `dispose()` | `void` | Releases capture and every recorder and input node. |

### `AUFXAudioRecorder`

Records encoded audio with bounded memory.

| Member | Type or signature | Description |
| --- | --- | --- |
| `state` | `AUFXAudioRecorderState` | `"ready"`, `"recording"`, `"paused"`, `"stopping"`, `"finished"`, `"error"` or `"cancelled"`. |
| `record(signal?)` | `void` | Starts. Throws unless the state is `"ready"`. Aborting the signal cancels the recording. |
| `pause()`, `resume()` | `void` | Pause and continue. |
| `stop()` | `Promise<AUFXAudioRecording>` | Ends the recording and resolves with the result. Calling it before `record()` rejects. |
| `result` | `Promise<AUFXAudioRecording>` | The same promise, available from the start. |
| `elapsedRecordingTime` | `number` | Seconds recorded so far, excluding pauses. |
| `cancel(reason?)`, `dispose()` | `void` | Abandons the recording. `result` rejects. |

`AUFXAudioRecorderOptions`:

| Option | Default | Maximum | Meaning |
| --- | --- | --- | --- |
| `mimeType` | the host's preferred type | | The container and codec, from `session.capabilities.mimeTypes`. |
| `maximumBytes` | 16 MiB | 64 MiB | Recording stops with an error beyond this. |
| `maximumChunks` | 4096 | 16,384 | The same for data chunks. |
| `maximumDuration` | 300 s | 3600 s | The recorder stops itself at this length. |

`AUFXAudioRecording` holds `data` (a `Blob`), `mimeType`, `byteLength`, `elapsedRecordingTime`, and, when the host can decode the result, `duration`, `frameCount`, `sampleRate` and `channelCount` (each `null` otherwise). A recording that captured no audio rejects with an error, and finalisation times out after 10 seconds.

```tsx
import { useEffect, useRef, useState } from "react";
import type { AUFXAudioRecorder, AUFXAudioSession } from "@syndromatic/syncloudos/fx/audio";
import { useSynWareAudio } from "@syndromatic/syncloudos/sdk";

export function VoiceMemo() {
  const audio = useSynWareAudio();
  const session = useRef<AUFXAudioSession | null>(null);
  const recorder = useRef<AUFXAudioRecorder | null>(null);
  const [status, setStatus] = useState("Idle");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function start() {
    session.current ??= audio.createSession();
    try {
      await session.current.requestRecordAuthorization();
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "Microphone refused" : "Microphone unavailable");
      return;
    }
    recorder.current = session.current.createRecorder({ maximumDuration: 60 });
    recorder.current.record();
    setStatus("Recording");
  }

  async function stop() {
    const active = recorder.current;
    if (!active) return;
    const recording = await active.stop();
    setUrl(URL.createObjectURL(recording.data));
    setStatus(`Saved ${recording.elapsedRecordingTime.toFixed(1)} s`);
  }

  return (
    <div>
      <button onClick={() => void start()}>Record</button>
      <button onClick={() => void stop()}>Stop</button>
      <p>{status}</p>
      {url ? <audio controls src={url} /> : null}
    </div>
  );
}
```

The manifest for this component declares both permissions it may use:

```ts
export default {
  schemaVersion: 1,
  id: "com.example.memo",
  version: "1.0.0",
  title: "Voice Memo",
  routes: [{ path: "/memo", primary: true }],
  permissions: ["audio.record"],
} as const;
```

## Timeline transports

`engine.createTimelineTransport(players?, signal?)` coordinates several players so that play, pause, seek and rate changes take effect together and are acknowledged by the renderer. It returns an object with a `signal` (aborted when the transport ends), `apply(command)` and `dispose()`.

A command is one of `{ kind: "play", rate }`, `{ kind: "pause" }`, `{ kind: "seek", positionSeconds }` or `{ kind: "rate", rate }`. `apply` returns a receipt (or a promise of one for live output) with the `version`, the `backend` (`"offline"` or `"audio-worklet"`), the `positionSeconds` and an `audioAnchor` observation. Rules and limits:

- Each selected player takes an exclusive lease. In a graph with more than one player you must list them explicitly.
- Rates are positive and at most 4. Reverse playback is not available.
- The graph must consist of players and mixers. Stateful effects and live inputs are not supported under a transport.
- Seek the players to a common position before you start, and wait for one transition to complete before you begin the next.
- An engine allows 8 transports. When live output stops, every transport is released.

Applications that only need to start and stop sounds can skip transports and use the sound handles below.

## In a SynWare

`useSynWareAudio()` returns an `AUFXAudioClient` that is scoped to the calling component. Everything acquired through it is released when the component unmounts.

| Member | Description |
| --- | --- |
| `createEngine(format, signal?)` | A live engine. Acquiring it does not start browser audio. `start()` does, and browsers want a user gesture for that. Requires `audio.play`. |
| `createSession(signal?)` | An `AUFXAudioSession` for capture and routing. |
| `fileCapabilities()` | The codecs the host can decode and encode. |
| `openFile(request, signal?)` | Opens and decodes a file into an `AUFXAudioFile`. |
| `exportFile(file, signal?, options?)` | Encodes an opened file as WAV or Opus in WebM. |
| `exportStream(options, signal?)` | Streams a chunk stream to a sink as Opus in WebM. |

For simple sound effects, the client also offers **sound handles**, which play a URL with no graph:

| Member | Description |
| --- | --- |
| `load(request, signal?)` | Loads a sound and returns a handle with an `id`. The request names a `source` and can set `loop` and `volume`. |
| `play(id)`, `pause(id)`, `stop(id)` | Control playback. `play` follows the browser's activation rules. |
| `setLoop(id, loop)`, `setVolume(id, volume)`, `setRate(id, rate)`, `setCurrentTime(id, time)` | Adjust a loaded sound. |
| `release(id, reason?)` | Releases a handle. |
| `suspend()`, `resume()` | Pause or resume all of this application's sounds. |

```tsx
import { useEffect, useRef } from "react";
import { AUFXAudioFormat, AUFXAudioPCMBuffer, AUFXAudioPlayerNode } from "@syndromatic/syncloudos/fx/audio";
import { useSynWareAudio } from "@syndromatic/syncloudos/sdk";

export function Beep() {
  const audio = useSynWareAudio();
  const started = useRef(false);

  useEffect(() => {
    const format = new AUFXAudioFormat(48_000, 1);
    const engine = audio.createEngine(format);
    const player = new AUFXAudioPlayerNode(format);
    engine.attach(player);
    engine.connect(player, engine.mainMixerNode);

    const tone = new AUFXAudioPCMBuffer(format, 24_000);
    tone.frameLength = 24_000;
    for (let frame = 0; frame < tone.frameLength; frame += 1) {
      tone.setSample(0, frame, 0.3 * Math.sin((2 * Math.PI * 660 * frame) / format.sampleRate));
    }
    const button = document.getElementById("beep");
    const onClick = async () => {
      if (!started.current) {
        await engine.start(); // browsers require a user gesture
        started.current = true;
      }
      player.seek(0);
      player.scheduleBuffer(tone, 0);
      player.play();
    };
    button?.addEventListener("click", onClick);
    return () => {
      button?.removeEventListener("click", onClick);
      engine.dispose();
    };
  }, [audio]);

  return <button id="beep">Beep</button>;
}
```

## Errors

| Situation | Error |
| --- | --- |
| A value outside its documented range, a graph limit exceeded, an index out of bounds | `RangeError` |
| A cycle, a duplicate connection, a node from another engine, an engine that is disposed, rendering or already running | `Error` |
| A wrong argument type, unsupported WAV encoding | `TypeError` |
| A missing permission or a capture handle from another application | `DOMException` named `SecurityError` |
| The user refused the microphone | `DOMException` named `NotAllowedError` |
| A signal aborted | The signal's reason, usually `AbortError` |
| A second consumer of a chunk stream, an invalid timeline transition | `DOMException` named `InvalidStateError` |
| Transport limits exceeded | `DOMException` named `QuotaExceededError` |
| Live input in an offline render | `Error` named `AUFXUnsupportedOfflineInputError` |

## Related

- [FX overview](README.md)
- [MediaFX](media.md), for time values and shared clocks
- [HapticsFX](haptics.md), which can play audio with a pattern
- [MIDIFX](midi.md)
- [Manifest reference](../synware-manifest.md), for the audio permissions
