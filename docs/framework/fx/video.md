# VideoFX

VideoFX (`VFX`) is the web-native analogue of Video Toolbox and the video half of AVFoundation. It decodes and encodes video, holds decoded frames with exact MediaFX timing, processes frames with graphics and image filters, reads and writes container files, captures from cameras and displays, and presents frames on a shared clock.

The framework is built around three ideas.

- **Frames have owners.** A `VFXFrame` is a decoded picture that you own and must close. Closing releases its memory or its GPU surface. `clone()` gives you another owner and `transfer()` hands ownership to someone else.
- **Every stage is bounded.** Decoders, encoders, queues and containers have limits on pending work and memory. Going over a limit fails with `QuotaExceededError`, and an unbounded pipeline is a bug the framework refuses to let you build.
- **Ask before you commit.** Codec support varies by browser and device, so you query the exact configuration first and receive either an accepted, normalised configuration or a reason it is not supported.

Compression and container code plug in through backends. The framework's own classes (`VFXDecoder`, `VFXEncoder`, `VFXContainerReader`, `VFXContainerWriter`) hold the state machines, limits and ownership rules, and a backend does the codec or format work. In an application, the session supplies WebCodecs-based backends, so you write code against the session's decoder and encoder sessions. The portable classes work with any backend you supply, including a fake in a test.

```ts
import { VFXVideoFormat, VFXPixelBuffer } from "@syndromatic/syncloudos/fx/video";
```

## At a glance

| | |
| --- | --- |
| Prefix | `VFX` |
| Entries | `@syndromatic/syncloudos/fx/video` and `@syndromatic/syncloudos/fx/video/webm` |
| Hooks | `useVideo` for capture, and `useSCOS().video` for decoding, encoding, processing and presentation |
| Permissions | `video.capture.camera` and `video.capture.display` for capture. Decoding, encoding and processing need none. |
| Analogue | Video Toolbox (`VTDecompressionSession`, `VTCompressionSession`), AVFoundation capture and asset writing, Core Video (`CVPixelBuffer`, `CVPixelBufferPool`) |

## What the entries export

| Area | Symbols |
| --- | --- |
| Formats and pixels | `VFXVideoFormat`, `VFXPixelFormat`, `VFXYUVMatrix`, `VFXPlaneLayout`, `VFXPixelAspectRatio`, `VFXPixelBuffer`, `VFXPixelBufferPool` and its option and diagnostics types |
| Frames | `VFXFrame`, `VFXFrameInit` |
| Encoded data | `VFXEncodedChunk`, `VFXEncodedChunkInit`, `VFXEncodedChunkType`, `VFXWebCodecsTiming` |
| Decoding | `VFXDecoder`, `VFXDecoderBackend`, `VFXDecoderOptions`, `VFXDecoderState`, `VFXCodecCapabilities` and the decoder configuration and capability types |
| Encoding | `VFXEncoder`, `VFXEncoderCapabilities`, `normalizeVFXEncoderConfig`, `VFXEncoderBackend` and the encoder configuration, capability, metadata and state types |
| Processing | `VFXFrameProcessor`, `VFXFrameProcessingGraph` and the process option, result and diagnostics types |
| Containers | `VFXContainerWriter`, `VFXContainerReader`, `VFXContainerBackend` and the track, capability, read and write types |
| Presentation | `VFXPresentationCoordinator` and its option, context, result and diagnostics types |
| Capture and session | `VFXVideoClient`, `VFXCaptureSession`, `VFXDecoderSession`, `VFXEncoderSession`, `VFXFrameProcessorSession` and the capture request and settings types |
| WebM (`fx/video/webm`) | `VFXWebMContainerBackend` |

## Formats, pixels and frames

### `VFXVideoFormat`

Describes how a frame's pixels are laid out. It is immutable, and the constructor computes the byte layout of every plane.

```text
new VFXVideoFormat({ codedWidth, codedHeight, pixelFormat, colourSpace, alpha?, planeStrides?, cleanAperture?, pixelAspectRatio? })
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `codedWidth`, `codedHeight` | `number` | required | Dimensions in pixels, each 1 to 16,384. |
| `pixelFormat` | `VFXPixelFormat` | required | `"rgba8"`, `"bgra8"` (packed, 4 bytes per pixel), `"i420"` (three planes, half resolution chroma) or `"nv12"` (a luma plane and an interleaved chroma plane). |
| `colourSpace` | `GFXColourSpace` | required | `"srgb"`, `"linear-srgb"` or `"display-p3"`. The grayscale space is not allowed for colour frames. |
| `alpha` | `"straight" \| "premultiplied" \| "opaque"` | `"straight"` for RGB, `"opaque"` for planar | Planar YUV formats carry no alpha. |
| `planeStrides` | `number[]` | tightly packed | Bytes per row for each plane, when rows carry padding. Each must be at least the plane's active row bytes. |
| `cleanAperture` | `GFXRect` | the whole frame | The visible region in coded pixels. Must lie inside the coded size. |
| `pixelAspectRatio` | `{ numerator, denominator }` | 1:1 | For non-square pixels. Each value 1 to 1,000,000. |

| Member | Description |
| --- | --- |
| The constructor fields | Exposed as properties, plus `yuvMatrix` (`"bt709-full"` for planar formats, `null` for RGB). |
| `planeLayouts` | One `VFXPlaneLayout` per plane: `index`, `width`, `height`, `offset`, `bytesPerRow`, `rowBytes` (active bytes) and `byteLength`. |
| `byteLength` | The total size of a frame in this format. A format is limited to 256 MiB. |
| `equals(other)` | True when every field and stride matches. |

Chroma planes round up, so a 5 by 5 `i420` frame has 3 by 3 chroma planes.

### `VFXPixelBuffer`

Reference-counted pixel storage in a given format. Several buffers can share one backing store, and the store is freed when the last one closes.

```text
new VFXPixelBuffer(format: VFXVideoFormat, data?: Uint8Array)
```

The constructor copies `data`, which must be exactly `format.byteLength` bytes. Without data it allocates zeroed storage.

| Member | Type or signature | Description |
| --- | --- | --- |
| static `fromGFXImage(image, options?)` | `VFXPixelBuffer` | Converts a [GraphicsFX](graphics.md) image to RGB or planar YUV. `options.pixelFormat` picks the target. Chroma is averaged over each 2 by 2 block. |
| `format` | `VFXVideoFormat` | The layout. |
| `byteLength` | `number` | The size in bytes. |
| `closed` | `boolean` | True after `close()` or `transfer()`. |
| `clone()` | `VFXPixelBuffer` | Another owner of the same storage, with no copy. |
| `transfer()` | `VFXPixelBuffer` | Moves ownership to a new object and closes this one. |
| `copyData()` | `Uint8Array` | A copy of all bytes. |
| `copyPlane(index)` | `Uint8Array` | A copy of one plane, including row padding. |
| `toGFXImage()` | `GFXImage` | Converts to an RGBA image, using BT.709 full-range for YUV. |
| `close()` | `void` | Releases this owner. Idempotent. |

Members other than `close` throw an `InvalidStateError` `DOMException` on a closed buffer.

### `VFXPixelBufferPool`

Recycles buffers of one format so a steady stream of frames does not churn memory.

```text
new VFXPixelBufferPool({ maximumBuffers?, maximumBytes? })
```

| Option | Default | Range |
| --- | --- | --- |
| `maximumBuffers` | 16 | 1 to 4,096 |
| `maximumBytes` | 64 MiB | 1 byte to 512 MiB |

`acquire(format, data?)` returns a buffer that is zeroed (or filled from `data`), reusing a released store of an equal format when one exists. When the pool is at its limits it throws `QuotaExceededError`. Closing the last owner of a buffer returns its store to the pool. `diagnostics()` reports `allocatedBuffers`, `availableBuffers`, `liveHandles`, `retainedBytes`, `allocationCount`, `reuseCount` and `disposed`. `dispose()` frees idle stores, and busy stores are freed as they are released.

```ts
import { VFXPixelBufferPool, VFXVideoFormat } from "@syndromatic/syncloudos/fx/video";

const format = new VFXVideoFormat({ codedWidth: 1280, codedHeight: 720, pixelFormat: "nv12", colourSpace: "srgb" });
const pool = new VFXPixelBufferPool({ maximumBuffers: 6 });

export function nextBuffer() {
  const buffer = pool.acquire(format); // reused after the first few frames
  return buffer; // the caller closes it, which returns it to the pool
}

export const stats = () => pool.diagnostics();
```

### `VFXFrame`

A decoded picture with its timing. Frames come in two storage kinds:

- **`"pixels"`** frames hold a `VFXPixelBuffer`. You can read and convert them.
- **`"video-surface"`** frames hold a browser `VideoFrame` that stays on the GPU. Nothing reads the pixels back, so this is the fast path when the frame is only going to be drawn.

```text
new VFXFrame({ pixels: VFXPixelBuffer, timing: MEFXSampleTimingInfo })
```

The constructor takes its own reference to the pixels, so you can close yours. `timing` is a [MediaFX](media.md) `MEFXSampleTimingInfo`, which carries exact presentation time and duration.

| Member | Type or signature | Description |
| --- | --- | --- |
| `timing` | `MEFXSampleTimingInfo` | Presentation time, decode time and duration. |
| `storageKind` | `"pixels" \| "video-surface"` | How the frame is stored. |
| `format` | `VFXVideoFormat` | The pixel layout. Throws `NotSupportedError` for a video-surface frame. |
| `closed` | `boolean` | True after `close()` or `transfer()`. |
| `clone()` | `VFXFrame` | Another owner. |
| `transfer()` | `VFXFrame` | Moves ownership and closes this frame. |
| `withVideoFrame(callback)` | `T` | Lends the browser `VideoFrame` to a synchronous callback, for example a WebGL or WebGPU texture upload. The callback must finish synchronously and must not keep the surface. Throws `NotSupportedError` on a pixel frame. |
| `copyPixelBuffer()` | `VFXPixelBuffer` | A new owner of the pixels. |
| `toGFXImage()` | `GFXImage` | An RGBA image of the frame. Requires pixel storage. |
| `close()` | `void` | Releases the frame. |
| static `fromOwned(pixels, timing)` | `VFXFrame` | A frame that takes ownership of the buffer you pass without an extra reference. |
| static `fromVideoFrame(surface, timing)` | `VFXFrame` | Wraps a clone of a browser `VideoFrame`. |

A decoder hands you frames that you must close. Closing a frame twice is safe.

## Encoded data

### `VFXEncodedChunk`

One compressed unit: a keyframe or a delta frame, with its bytes and timing. It is immutable, and the constructor copies the data.

```text
new VFXEncodedChunk({ type: "key" | "delta", data: Uint8Array, timing: MEFXSampleTimingInfo, discardPaddingNanoseconds? })
```

| Member | Description |
| --- | --- |
| `type` | `"key"` (decodable on its own) or `"delta"` (depends on earlier chunks). |
| `timing` | The chunk's `MEFXSampleTimingInfo`. |
| `byteLength` | The size of the data. |
| `copyData()` | A copy of the bytes. |
| `copyWithNewTiming(timing)` | A chunk with the same data and new timing. The bytes are shared, since they are immutable, so retiming costs nothing. |
| `webCodecsTiming()` | `{ timestampMicroseconds, durationMicroseconds, rounded }`, the timing converted to the microsecond integers WebCodecs uses. `rounded` is true when the conversion was inexact. Throws for times with a non-zero epoch. |
| `discardPaddingNanoseconds` | Trailing padding to discard, from 0 to one second. Meaningful for audio packets in WebM. |

`VFXEncodedChunkInit`, `VFXEncodedChunkType` and `VFXWebCodecsTiming` are the associated types.

## Decoding

### `VFXCodecCapabilities` and decoder configuration

```text
VFXCodecCapabilities.queryDecoder(input: VFXDecoderConfigInput, probe: VFXCodecCapabilityProbe): Promise<VFXDecoderCapability>
```

`VFXDecoderConfigInput`:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `codec` | `string` | required | A WebCodecs codec string such as `"vp8"`, `"vp09.00.40.08"`, `"avc1.64001f"` or `"av01.0.08M.08"`. At most 256 characters. |
| `codedWidth`, `codedHeight` | `number` | required | Each 1 to 16,384. |
| `hardwareAcceleration` | `"no-preference" \| "prefer-hardware" \| "prefer-software"` | `"no-preference"` | A preference, not a guarantee. |
| `optimizeForLatency` | `boolean` | `false` | Ask the decoder to emit frames as soon as it can. |

The result, `VFXDecoderCapability`, is `{ supported: true, config }` with the normalised configuration (which the probe may have adjusted), or `{ supported: false, config, reason }`. Pass the returned `config` to the decoder. In an application, `app.video.queryDecoder(input)` runs the probe for you.

### `VFXDecoder`

Wraps a `VFXDecoderBackend` with a strict lifecycle and bounded queues.

```text
new VFXDecoder({ backend, output, error?, maximumPendingOutputs?, maximumDecodeQueueSize? })
```

| Option | Default | Meaning |
| --- | --- | --- |
| `backend` | required | The codec implementation. |
| `output` | required | Called with each decoded frame, which you own and must close. May return a promise to apply backpressure. |
| `error` | none | Called once when the decoder fails. |
| `maximumPendingOutputs` | 8 | The most `output` promises outstanding. |
| `maximumDecodeQueueSize` | 32 | The most chunks queued in the backend. |

| Member | Description |
| --- | --- |
| `state` | `"unconfigured"`, `"configured"`, `"draining"`, `"failed"` or `"disposed"`. |
| `generation` | Increases at each `reset()`. Frames from an earlier generation are closed and never delivered. |
| `pendingOutputCount` | How many `output` promises are unsettled. |
| `configure(input)` | Configures from a `VFXDecoderConfigInput`. Only valid when unconfigured. |
| `decode(chunk)` | Queues a chunk. The first chunk after configuring or resetting must be a keyframe (`DataError` otherwise). Throws `QuotaExceededError` when the queue is full. |
| `flush()` | Resolves when every queued chunk has been decoded and every `output` promise has settled. The decoder then needs a keyframe again, matching WebCodecs. |
| `reset()` | Cancels pending work, closes undelivered frames and returns to `"unconfigured"`. |
| `dispose()` | Releases the backend. Idempotent. |

A failure in the backend, in `output` or a pending-output overflow moves the decoder to `"failed"`, closes undelivered frames and calls `error`. Reset the decoder to reuse it.

```tsx
import { useEffect, useRef } from "react";
import { useSCOS } from "@syndromatic/syncloudos/sdk";
import { VFXEncodedChunk, type VFXFrame } from "@syndromatic/syncloudos/fx/video";

export function useVP8Decoder(onFrame: (frame: VFXFrame) => void) {
  const app = useSCOS();
  const decoder = useRef<ReturnType<typeof app.video.createDecoder> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const capability = await app.video.queryDecoder({ codec: "vp8", codedWidth: 640, codedHeight: 360 }, controller.signal);
      if (!capability.supported) return console.warn("No VP8 decoder:", capability.reason);
      const session = app.video.createDecoder({ output: onFrame, error: (error) => console.error(error) }, controller.signal);
      session.configure(capability.config);
      decoder.current = session;
    })();
    return () => {
      controller.abort();
      decoder.current?.dispose();
      decoder.current = null;
    };
  }, [app, onFrame]);

  return (chunk: VFXEncodedChunk) => decoder.current?.decode(chunk);
}
```

`VFXDecoderSession` is the session-owned form: it has the same `state`, `generation`, `pendingOutputCount`, `configure`, `decode`, `flush`, `reset` and `dispose`. `VFXMountedDecoderOptions` adds `outputStorage` (`"pixels"` or `"video-surface"`) so a GPU consumer can keep frames on the GPU. The host bounds the pixel workload of decoders it configures (192 MiB of frame data by default), and going over it fails with `QuotaExceededError`.

## Encoding

### `VFXEncoderCapabilities` and `normalizeVFXEncoderConfig`

`normalizeVFXEncoderConfig(input)` validates and completes an encoder configuration. `VFXEncoderCapabilities.queryEncoder(input, probe)` runs the probe and returns a `VFXEncoderCapability`: `{ supported: true, config }` or `{ supported: false, config, reason }`.

`VFXEncoderConfigInput`:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `codec` | `string` | required | A codec string. |
| `codedWidth`, `codedHeight` | `number` | required | Each 1 to 16,384. Must match every frame you encode. |
| `bitrate` | `number` | required | Bits per second, an integer from 1 to 2,147,483,647. |
| `framerate` | `number` | required | Frames per second, from 0.001 to 1000. |
| `hardwareAcceleration` | as for decoding | `"no-preference"` | A preference. |
| `latencyMode` | `"quality" \| "realtime"` | `"quality"` | `"realtime"` favours low delay. |
| `alpha` | `"discard" \| "keep"` | `"discard"` | Whether to keep the alpha channel. |
| `scalabilityMode` | `string` | none | A WebCodecs scalability mode such as `"L1T2"`. |

`VFXEncoderConfig` is the normalised result, with `scalabilityMode` as `null` when unset. The input type takes `undefined` for an unset mode and rejects `null`, so leave the field out when you pass a normalised configuration back to `configure`, as the recorder example below does.

### `VFXEncoder`

```text
new VFXEncoder({ backend, output, error?, maximumPendingOutputs?, maximumEncodeQueueSize? })
```

The options mirror the decoder's. `output` receives each `VFXEncodedChunk` and a `VFXEncoderOutputMetadata` with a `decoderConfig` (the codec, size and optional description bytes a decoder needs, or a container track needs) and an optional `colourSpace`.

| Member | Description |
| --- | --- |
| `state` | `"unconfigured"`, `"configuring"`, `"configured"`, `"draining"`, `"failed"` or `"disposed"`. |
| `generation`, `pendingOutputCount` | As for the decoder. |
| `config` | The active `VFXEncoderConfig`, or `null`. |
| `configure(input)` | Asynchronous. Configuring an already configured encoder first drains its queued frames. |
| `encode(frame, options?)` | Queues a frame. The encoder takes its own reference, so you can close your frame straight away. `options.keyFrame: true` forces a keyframe. Throws `DataError` when the frame size differs from the configuration and `QuotaExceededError` when the queue is full. |
| `flush()` | Resolves when every queued frame has been encoded and delivered. |
| `reset()`, `dispose()` | As for the decoder. |

`VFXEncoderSession` and `VFXMountedEncoderOptions` are the session forms. `VFXEncoderBackend`, `VFXEncoderBackendCallbacks`, `VFXEncoderCapabilityProbe`, `VFXEncoderState`, `VFXEncoderLatencyMode`, `VFXEncoderAlphaMode`, `VFXEncoderHardwareAcceleration`, `VFXEncoderFrameOptions`, `VFXEncoderDecoderConfig`, `VFXEncoderOutputMetadata` and `VFXEncoderOptions` describe the plug points.

```tsx
import { useSCOS } from "@syndromatic/syncloudos/sdk";
import type { VFXEncodedChunk, VFXFrame } from "@syndromatic/syncloudos/fx/video";

export function useRecorder() {
  const app = useSCOS();

  return async function record(frames: AsyncIterable<VFXFrame>, onChunk: (chunk: VFXEncodedChunk) => void) {
    const capability = await app.video.queryEncoder({
      codec: "vp8",
      codedWidth: 640,
      codedHeight: 360,
      bitrate: 1_500_000,
      framerate: 30,
      latencyMode: "realtime",
    });
    if (!capability.supported) throw new Error(`VP8 encoding is unavailable: ${capability.reason}`);

    const encoder = app.video.createEncoder({ output: (chunk) => onChunk(chunk) });
    try {
      const { scalabilityMode, ...config } = capability.config;
      await encoder.configure(scalabilityMode === null ? config : { ...config, scalabilityMode });
      let index = 0;
      for await (const frame of frames) {
        encoder.encode(frame, { keyFrame: index % 60 === 0 });
        frame.close();
        index += 1;
      }
      await encoder.flush();
    } finally {
      encoder.dispose();
    }
  };
}
```

## Processing frames

### `VFXFrameProcessor`

Runs graphics and image filters over frames.

```text
new VFXFrameProcessor({ backend?, maximumRetainedBytes? })
```

`backend` is an ImageFX render backend (the default renders on the CPU). `maximumRetainedBytes` caps the working memory of one operation, default 256 MiB, up to 1 GiB. An operation that would exceed it throws `QuotaExceededError`. In an application, `app.video.createFrameProcessor()` returns the same operations as a `VFXFrameProcessorSession`, and the session releases it when your application closes.

| Method | Description |
| --- | --- |
| `process(frame, graph, options?)` | Applies a `VFXFrameProcessingGraph` (a chain of [ImageFX](image.md) filters) and returns `{ frame, diagnostics }`. |
| `processTiled(frame, graph, options?)` | The same for large frames, rendering in tiles to bound memory. Options add `tileSize` and `budgets`. |
| `draw(frame, draw, options?)` | Draws over a frame with a [GraphicsFX](graphics.md) bitmap context. The callback receives a `GFXBitmapContext` with the frame already painted in it. |
| `drawText(frame, line, options)` | Draws a [TextFX](text.md) `TFXLine` over a frame at `options.origin` in `options.colour`. |
| `dispose()` | Releases the processor. |

Common options (`VFXFrameProcessOptions`): `ownership` (`"copy"`, the default, keeps the input frame open, and `"transfer"` closes it once processing has read it), `signal` and `interpolation` (`"nearest"` or `"linear"`). Output frames have the input's format and timing, so the result drops into an encoder or presentation queue unchanged.

`VFXFrameProcessResult` holds the new `frame` (which you own) and `diagnostics`: the `backend` used (`"cpu"`, `"worker-cpu"`, `"accelerated"`, `"graphics-cpu"` or `"text-cpu"`), `copyCount`, `sourceBytes`, `outputBytes`, `peakRetainedBytes` and, where they apply, `glyphCount` and `tileCount`.

Processing needs a frame with pixel storage. A `"video-surface"` frame from a GPU decoder must be decoded with `outputStorage: "pixels"` to be processed.

### `VFXFrameProcessingGraph`

Describes an ImageFX filter chain to apply to a frame's image.

```text
new VFXFrameProcessingGraph(build: (source: IFXImage) => IFXImage)
VFXFrameProcessingGraph.identity()
```

`build` receives the frame as an `IFXImage` and returns the filtered result. It runs once per frame. `materialize(source)` runs the builder, and it throws when the builder does not return an `IFXImage`.

```ts
import { GFXColour, GFXPath } from "@syndromatic/syncloudos/fx/graphics";
import { VFXFrameProcessor, type VFXFrame } from "@syndromatic/syncloudos/fx/video";

const processor = new VFXFrameProcessor({ maximumRetainedBytes: 128 * 1024 * 1024 });

export function addWatermarkBar(frame: VFXFrame): VFXFrame {
  const { frame: marked } = processor.draw(frame, (context) => {
    context.fillPath(GFXPath.rect({ x: 0, y: frame.format.codedHeight - 24, width: frame.format.codedWidth, height: 24 }), GFXColour.rgba(0, 0, 0, 0.5));
  });
  return marked; // the caller owns and closes it
}
```

## Containers

A container file wraps compressed video (and audio) with timing. The reader and writer classes hold the limits and the state machine, and a `VFXContainerBackend` knows one format.

### `VFXContainerWriter`

Writes chunks to a byte sink through a backend.

```text
new VFXContainerWriter({ backend, sink, track, maximumBufferedBytes?, signal? })
```

| Option | Description |
| --- | --- |
| `backend` | The format, for example `new VFXWebMContainerBackend()`. |
| `sink` | Where bytes go: `write(bytes)`, and optional `close()` and `abort(reason)`. Wrap a `WritableStream` or a file handle. |
| `track` | A `VFXContainerTrack`. See below. |
| `maximumBufferedBytes` | The most input the writer will hold, default 8 MiB, from 256 bytes to 512 MiB. |
| `signal` | An `AbortSignal` that aborts the export. |

The constructor throws `NotSupportedError` when the backend cannot write the track.

| Member | Description |
| --- | --- |
| `write(chunk)` | Queues a chunk and returns a promise that settles when its bytes are in the sink. Throws `QuotaExceededError` when the buffered input would exceed the limit. Writes run in order. |
| `close()` | Writes the file's trailer and closes the sink. |
| `state` | `"open"`, `"closing"`, `"closed"` or `"aborted"`. |
| `container` | The backend's container name. |
| `diagnostics` | `{ peakBufferedBytes, reservedInputBytes, fragmentsWritten, bytesWritten }`. |

A failure in the sink or the backend aborts the writer, calls the sink's `abort`, and rejects the operation that failed.

**Tracks.** A `VFXVideoContainerTrack` has `kind: "video"`, `id` (1 to 126), `codec`, `codedWidth`, `codedHeight`, `timescale` (units per second, up to a billion) and an optional codec `description`. A `VFXAudioContainerTrack` has `kind: "audio"`, `id`, `codec`, `sampleRate` (48,000), `channelCount` (1 or 2), `preSkip` (0 to 65,535) and `timescale`. `VFXContainerTrack` is their union.

### `VFXContainerReader`

Reads a whole container into chunks.

```text
new VFXContainerReader({ backend, maximumBufferedBytes?, maximumElementBytes?, maximumChunks?, signal? })
reader.read(input: Uint8Array | AsyncIterable<Uint8Array>): Promise<VFXContainerReadResult>
```

| Option | Default | Range |
| --- | --- | --- |
| `maximumBufferedBytes` | 8 MiB | 32 bytes to 512 MiB |
| `maximumElementBytes` | 4 MiB | 32 bytes to 512 MiB, at most `maximumBufferedBytes` |
| `maximumChunks` | 65,536 | 1 to 1,048,576 |

`read` accepts bytes in memory or an async iterable (a `ReadableStream` is one), so a large file streams through. The result holds the `container` name, the `track`, the `chunks` (`VFXEncodedChunk`s with timing) and a `seekIndex` of `{ timestampMicroseconds, byteOffset }` points. Malformed or oversized input fails and never allocates without bound.

`VFXContainerBackend` (`container`, `capabilities`, `supports(track, operation)`, `createWriter(track)`) and `VFXContainerReadableBackend` (adds `createReader(limits)`) are the backend interfaces. `VFXContainerCapability` reports what a backend can do for a codec: `read`, `write`, `streaming`, `seekIndex` and `provenance`. The remaining types are `VFXContainerBackendWriter`, `VFXContainerBackendReadSession`, `VFXContainerByteSink`, `VFXContainerReadLimits`, `VFXContainerReadResult`, `VFXContainerSeekPoint`, `VFXContainerReaderOptions`, `VFXContainerWriterOptions`, `VFXContainerWriterState` and `VFXContainerWriterDiagnostics`.

### WebM

`@syndromatic/syncloudos/fx/video/webm` exports `VFXWebMContainerBackend`, a restricted WebM implementation for the reader and writer.

- It reads and writes VP8, VP9 profile 0 at eight bits, and Opus audio.
- VP9 needs a four-field codec string such as `vp09.00.40.08`, because profile, level and bit depth are stored in the file. Input that lacks those fields, uses another profile or names an invalid level is rejected, never guessed.
- It handles one track with a one-microsecond timecode (`timescale: 1_000_000`) and bounded packet and element sizes. It is a purpose-built reader and writer for files that VideoFX produces, and it is not a general WebM parser.
- Container support is independent of what the host can decode. Query the decoder capability before you play a file.

```ts
import { VFXContainerWriter, type VFXEncodedChunk } from "@syndromatic/syncloudos/fx/video";
import { VFXWebMContainerBackend } from "@syndromatic/syncloudos/fx/video/webm";

export async function writeWebM(chunks: AsyncIterable<VFXEncodedChunk>, width: number, height: number) {
  const parts: Uint8Array[] = [];
  const writer = new VFXContainerWriter({
    backend: new VFXWebMContainerBackend(),
    sink: { write: (bytes) => { parts.push(bytes.slice()); } },
    track: { id: 1, kind: "video", codec: "vp8", codedWidth: width, codedHeight: height, timescale: 1_000_000 },
  });
  for await (const chunk of chunks) await writer.write(chunk);
  await writer.close();
  return new Blob(parts as BlobPart[], { type: "video/webm" });
}
```

## Presenting frames

### `VFXPresentationCoordinator`

Schedules decoded frames for display against a clock. Create one with `app.video.createPresentationCoordinator(options)`.

`VFXPresentationCoordinatorOptions`:

| Option | Description |
| --- | --- |
| `mode` | `"media"` presents against a [MediaFX](media.md) timebase alone, with no audio graph or audio permission. `"audio"` (the default) also follows an audio engine and needs `audioEngine`, with `audioPlayers` to choose players when the graph has more than one. |
| `timebase` | The `MEFXTimebase` that provides the clock. Control playback through the coordinator while it owns the timebase. |
| `toleranceSeconds` | How early or late a frame may be and still present. |
| `maximumQueuedFrames` | The waiting-frame bound. One more frame may be borrowed by `present`. |
| `present(frame, context)` | Called to draw a frame. The frame is lent until the returned promise settles, and the coordinator then closes it. Check `context.signal` before publishing asynchronous output. |

| Member | Description |
| --- | --- |
| `enqueue(frame)` | Queues a frame and returns `"queued"`, or `"queue-full"` when the bound is reached (you keep ownership then). |
| `tick()` | Decides what to do next and returns `{ action, reason?, skewSeconds? }`. Call it from your render loop. |
| `play()`, `pause()` | Start and stop the clock. |
| `setRate(numerator, denominator?)` | Sets the playback rate as a `bigint` fraction. |
| `seek(position)` | Jumps to a `MEFXTime` and discards frames that no longer apply. |
| `setLoop(loop)` | Loops between `{ start, end }`, or clears the loop with `null`. |
| `reanchorAudio()` | Re-anchors playback to the audio clock, and returns the new generation. |
| `end()` | Marks the end of the stream. |
| `diagnostics` | `{ generation, queuedFrames, inFlightFrames, audioTransportPending, droppedFrames, maximumAbsoluteSkewSeconds }`. |
| `dispose()` | Releases the coordinator and every queued frame. |

A `tick` result's `action` is `"idle"` (nothing queued), `"wait"` (the next frame is early), `"present"` (a frame was presented), `"drop"` (a late frame was discarded) or `"end-of-stream"`. When it does not present, `reason` explains why: `"frame-early"`, `"renderer-busy"`, `"paused"`, `"presentation-invalidated"`, `"loop-boundary"`, `"audio-unanchored"`, `"audio-discontinuity"` or `"audio-transport-pending"`. `skewSeconds` is measured when the frame is dispatched. It does not measure when the display or speaker actually shows it.

Media-only coordinators have their own session scope, so several independently clocked videos can play alongside decoder sessions.

`VFXPresentationAction`, `VFXPresentationContext` (`generation` and `signal`), `VFXPresentationDiagnostics`, `VFXPresentationEnqueueResult`, `VFXPresentationTickResult` and `VFXPresentationCoordinatorOptions` are the types.

```tsx
import { useEffect, useRef } from "react";
import { useSCOS } from "@syndromatic/syncloudos/sdk";
import type { VFXFrame } from "@syndromatic/syncloudos/fx/video";

export function VideoView({ frames }: { frames: AsyncIterable<VFXFrame> }) {
  const app = useSCOS();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timebase = app.media.createTimebase({}, controller.signal);
    const coordinator = app.video.createPresentationCoordinator({
      mode: "media",
      timebase,
      maximumQueuedFrames: 4,
      present: (frame, context) => {
        if (context.signal.aborted) return;
        const element = canvas.current;
        const image = frame.toGFXImage();
        if (element) {
          element.width = image.width;
          element.height = image.height;
          element.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(image.copyData()), image.width, image.height), 0, 0);
        }
      },
    }, controller.signal);

    void (async () => {
      for await (const frame of frames) {
        if (coordinator.enqueue(frame) === "queue-full") frame.close();
      }
      coordinator.end();
    })();

    let running = true;
    const loop = async () => {
      while (running) {
        await coordinator.tick();
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    };
    void coordinator.play().then(loop);

    return () => {
      running = false;
      controller.abort();
      coordinator.dispose();
    };
  }, [app, frames]);

  return <canvas ref={canvas} />;
}
```

## Capture

`useVideo()` returns a `VFXCaptureSession` bound to your component. Mounting it requests nothing. The camera and display prompts appear only from `requestCamera()` and `requestDisplay()`.

| Member | Description |
| --- | --- |
| `capabilities` | `{ camera, display, deviceEnumeration }`, what this browser supports. All false before mount. |
| `state` | `"idle"`, `"requesting"`, `"active"`, `"suspended"`, `"interrupted"`, `"denied"`, `"failed"`, `"unavailable"` or `"disposed"`. |
| `kind` | `"camera"`, `"display"` or `null`. |
| `settings` | The negotiated `VFXCaptureSettings`: `kind`, `deviceId`, `groupId`, `width`, `height`, `frameRate`, `aspectRatio`, `facingMode` and `displaySurface`, each `null` when the browser does not report it. |
| `enumerateDevices()` | Lists cameras as `{ id, groupId, kind: "camera", label }`. Labels are `null` until the user has granted access. |
| `requestCamera(request?)` | Starts a camera. The request may set `deviceId`, `width`, `height`, `frameRate` and `signal`. Resolves with the settings. Requires `video.capture.camera`. |
| `requestDisplay(request?)` | Starts screen, window or tab capture. Requires `video.capture.display`. |
| `suspend()`, `resume()` | Pause and continue capture. |
| `subscribe(listener)` | Calls the listener when state or settings change. |
| `dispose()` | Stops capture. |

A refusal by the user or by policy moves the session to `"denied"` and rejects the request. Explain it in your interface. The browser shows its own consent prompt and recording indicator, and the framework does not hide them.

```tsx
import { useEffect, useState } from "react";
import { useVideo } from "@syndromatic/syncloudos/sdk";

export function CameraButton() {
  const video = useVideo();
  const [status, setStatus] = useState("Idle");

  useEffect(() => video.subscribe(() => setStatus(video.state)), [video]);

  async function start() {
    if (!video.capabilities.camera) return setStatus("Camera unavailable");
    try {
      const settings = await video.requestCamera({ width: 1280, height: 720, frameRate: 30 });
      setStatus(`Camera active: ${settings.width ?? "?"} x ${settings.height ?? "?"}`);
    } catch {
      setStatus("Camera access was refused");
    }
  }

  return <button onClick={() => void start()}>{status}</button>;
}
```

The manifest for a component that captures declares the permission:

```ts
export default {
  schemaVersion: 1,
  bundleIdentifier: "com.example.camera",
  version: "1.0.0",
  displayName: "Camera",
  routes: [{ path: "/camera", primary: true }],
  permissions: ["video.capture.camera"],
} as const;
```

## The session client

`useSCOS().video` is the full `VFXVideoClient`. All of its resources are owned by your application and released when it closes.

| Method | Returns | Description |
| --- | --- | --- |
| `createCaptureSession(signal?)` | `VFXCaptureSession` | A capture session. `useVideo()` wraps one for a component. |
| `queryDecoder(input, signal?)` | `Promise<VFXDecoderCapability>` | Asks the host whether it can decode a configuration. |
| `createDecoder(options, signal?)` | `VFXDecoderSession` | A decoder with WebCodecs behind it. |
| `queryEncoder(input, signal?)` | `Promise<VFXEncoderCapability>` | Asks whether the host can encode a configuration. |
| `createEncoder(options, signal?)` | `VFXEncoderSession` | An encoder. |
| `createFrameProcessor(options?, signal?)` | `VFXFrameProcessorSession` | A frame processor. Options allow `maximumRetainedBytes`. |
| `createPresentationCoordinator(options, signal?)` | `VFXPresentationCoordinator` | A presentation coordinator. |

Encoder, processor, capture and combined audio and video presentation sessions share a scope of four. Media-only presentation coordinators have a separate scope of four. Going over a scope fails with `QuotaExceededError`, and closing the application releases every scope. These are the framework's limits. Whether a device can sustain that many hardware decoders is a separate question that varies by device.

## Errors

| Situation | Error |
| --- | --- |
| A wrong argument type or an unsupported format | `TypeError` |
| A dimension, rate or option outside its range | `RangeError` |
| A closed frame, buffer or writer, a call in the wrong state | `DOMException` named `InvalidStateError` |
| A queue, pool or memory limit exceeded | `DOMException` named `QuotaExceededError` |
| A non-keyframe first chunk, or a frame of the wrong size for an encoder | `DOMException` named `DataError` |
| A codec or container combination the backend cannot handle | `DOMException` named `NotSupportedError` |
| A capture permission missing from the manifest, or refused | `DOMException` named `SecurityError`, or a `"denied"` state |
| An aborted signal, a reset, a disposal | The signal's reason, usually `AbortError` |

## Accessibility and privacy

Camera and display capture show the browser's consent prompt and indicator. Stop capture when the interface that needs it closes. Provide captions or alternative text for recorded and played media.

## Related

- [FX overview](README.md)
- [MediaFX](media.md), for timing, timebases and queues
- [AudioFX](audio.md), for the audio side of presentation
- [GraphicsFX](graphics.md) and [ImageFX](image.md), for drawing on and filtering frames
- [TextFX](text.md), for text overlays
- [Manifest reference](../synware-manifest.md), for the capture permissions
