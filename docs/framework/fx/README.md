# FX frameworks

The FX frameworks are TypeScript libraries shaped after Apple's frameworks, expressed as immutable values, explicit lifetimes and standard web platform primitives.

Each framework has a short prefix that appears on every public type, so a name tells you where it belongs.

| Framework | Prefix | Analogue | Import | Covers |
| --- | --- | --- | --- | --- |
| [AnimationFX](animation.md) | `AFX` | Core Animation | `fx/animation` | Layers, implicit and explicit animations, springs, particles, transactions |
| [GraphicsFX](graphics.md) | `GFX` | Quartz 2D | `fx/graphics` | Paths, colour, gradients, bitmap and PDF contexts, geometry |
| [ImageFX](image.md) | `IFX` | Core Image | `fx/image` | Filter graphs, RAW decoding, image analysis, tiled rendering |
| [TextFX](text.md) | `TFX` | Core Text | `fx/text` | Fonts, attributed strings, typesetting, glyph drawing |
| [AudioFX](audio.md) | `AUFX` | AVAudioEngine | `fx/audio` | Audio graphs, players, recording, files and analysis |
| [HapticsFX](haptics.md) | `HFX` | Core Haptics | `fx/haptics` | Haptic patterns and playback |
| [MotionFX](motion.md) | `MFX` | Core Motion | `fx/motion` | Device motion and attitude |
| [MediaFX](media.md) | `MEFX` | Core Media | `fx/media` | Rational time, timebases, sample buffers |
| [VideoFX](video.md) | `VFX` | Video Toolbox and AVFoundation | `fx/video`, `fx/video/webm` | Frames, codecs, capture, containers |
| [MIDIFX](midi.md) | `MIFX` | Core MIDI | `fx/midi` | MIDI 2.0 packets, parsing and scheduling |
| [BluetoothFX](bluetooth.md) | `BTFX` | Core Bluetooth | `fx/bluetooth` | Central-role GATT |
| [NFCFX](nfc.md) | `NFX` | Core NFC | `fx/nfc` | Foreground NDEF |
| [SpeechFX](speech.md) | `SPFX` | Speech | `fx/speech` | Browser recognition |
| [ContactsFX](contacts.md) | `CNFX` | Contacts | `fx/contacts` | Per-request contact picker |
| [PassFX](pass.md) | `PKFX` | PassKit | `fx/pass` | Payment Request authorisation |
| [XRFX](xr.md) | `XRFX` | ARKit sessions | `fx/xr` | WebXR poses and tracked anchors |
| [LocationFX](location.md) | `LFX` | Core Location | `fx/location` | Position, course and authorisation |
| [LuminaFX](lumina.md) | `LUFX` | Core Spotlight | `fx/lumina` | On-device indexing and search |
| [CompressionFX](compression.md) | `CPFX` | Compression | `fx/compression` | Apple's input/output closure filters |
| [NetworkFX](network.md) | `NWFX` | Network | `fx/network` | Scoped path monitoring and browser connection hints |
| [CryptoFX](crypto.md) | `CRFX` | CryptoKit | `fx/crypto` | Typed SHA/HMAC/HKDF, AES.GCM, P256/P384/P521 and Curve25519 with Foundation bytes |
| [DispatchFX](dispatch.md) | `DFX` | Dispatch | `fx/dispatch` | Time, QoS queues, work items, groups, semaphores, specifics and execution preconditions |

## Where each framework is documented

Every framework has a main page with an overview, an exports table and a class-by-class reference with runnable examples. The three largest split into further pages.

| Framework | Pages |
| --- | --- |
| AnimationFX | [Overview, timing, animations and transactions](animation.md), [Layers](animation/layers.md), [Effects and rendering](animation/effects.md) |
| GraphicsFX | [Geometry, colour, transforms and paths](graphics.md), [Paint and images](graphics/paint-and-images.md), [Drawing contexts](graphics/contexts.md), [PDF](graphics/pdf.md) |
| ImageFX | [Core: images, contexts and sessions](image.md), [The 203 filters](image/filters.md), [Analysis and RAW](image/analysis-and-raw.md), [Kernels and graphs](image/kernels-and-graphs.md) |
| The others | One page each, linked in the table above |

## Two ways to use them

**As libraries.** Value types and pure computations import directly from their entry and run anywhere JavaScript runs, including tests and workers. Colours, paths, time values, audio formats, haptic patterns and filter graphs need no host.

```ts
import { offsetRect } from "@syndromatic/syncloudos/fx/graphics";

const moved = offsetRect({ x: 2, y: 3, width: 4, height: 5 }, 10, 20);
```

CompressionFX is also a direct library: its input/output filters use read/write closures without a mounted session or permission. Its internal codec implementation lives in [Foundation](../foundation.md), beneath FX. Each framework keeps Apple's own algorithm enum.

**Through the session.** Anything that touches a device, the page or the user's attention comes from the mounted SynWare session. Cameras, microphones, speakers, sensors, location, layers bound to elements and decoded resources belong to the application's lifetime, so the host can enforce permissions, honour the user's settings and release everything when the application closes.

| Hook | Client | Permission |
| --- | --- | --- |
| `useAnimations` | Layers bound to page elements, canvas renderers | None |
| `useImages` | Decoded image resources | None |
| `useTextLayout` | Text measurement and fonts | None |
| `useAudio` | Audio engines and sessions | `audio.play`, `audio.record` |
| `useHaptics` | Haptic engine | `haptics.play` |
| `useMotion` | Motion manager | `motion.read` |
| `useMedia` | Media clocks | None |
| `useVideo` | Capture, decode, encode | `video.capture.camera` and related |
| `useMIDI` | MIDI access | `midi.access` |
| `useBluetooth` | Central manager | `bluetooth.access` |
| `useNFC` | NDEF session factory | `nfc.read`, `nfc.write` |
| `useSpeech` | Recognizer | `speech.recognize` |
| `useContacts` | Contact store and picker | `contacts.select` |
| `usePayment` | Payment controller factory | `payment.request` |
| `useXR` | WebXR session | `xr.session` |
| `useLocation` | Location manager | `location.read`, `location.request` |
| `useLumina` | Search index | `lumina.query` |

Declare the permissions an application needs in its manifest `permissions` list. A denied capability arrives as an ordinary result the application can explain to the user.

## Shared conventions

- **Immutable values.** Colours, rectangles, times, paths and buffers are frozen. Operations return new values.
- **Explicit lifetimes.** Anything that owns a resource has a `dispose()` or `close()`. The session releases what an application forgets when it closes.
- **Cancellation.** Long operations accept an `AbortSignal` and stop promptly when it fires.
- **Reduced motion and feedback settings.** Animation and haptics follow the user's system preferences without extra code.
- **Capability queries.** Browsers differ, so the frameworks report what a host supports, for example codec capabilities in VideoFX or authorisation in LocationFX, and never guess.

## Scaffolding an example

In a checkout of the framework repository, `npm run synware:create -- <directory> <app-id> --fx animation,audio` scaffolds a bundle with a working call into each framework you name. See the [SDK tooling notes](../synware-sdk.md#tooling).
