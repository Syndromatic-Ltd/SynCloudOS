# FX frameworks

The FX frameworks are the TypeScript libraries SynCloudOS apps use for graphics, animation, media, sensors, devices and system services. Reach for them whenever your app needs more than views and controls: drawing, sound, the camera, location, search, cryptography or background work. Each one is built on standard web platform primitives, with immutable values and explicit lifetimes. Many follow the shape of an Apple framework of the same purpose, which helps if you are porting code from those platforms.

Every public type carries its framework's prefix, so a name tells you where it belongs.

| Framework | Prefix | Import | Covers |
| --- | --- | --- | --- |
| [AnimationFX](animation.md) | `AFX` | `fx/animation` | Layers, implicit and explicit animations, springs, particles, transactions |
| [GraphicsFX](graphics.md) | `GFX` | `fx/graphics` | Paths, colour, gradients, bitmap and PDF contexts, geometry |
| [ImageFX](image.md) | `IFX` | `fx/image` | Filter graphs, RAW decoding, image analysis, tiled rendering |
| [TextFX](text.md) | `TFX` | `fx/text` | Fonts, attributed strings, typesetting, glyph drawing |
| [AudioFX](audio.md) | `AUFX` | `fx/audio` | Audio graphs, players, recording, files, analysis, speech synthesis |
| [HapticsFX](haptics.md) | `HFX` | `fx/haptics` | Haptic patterns and playback |
| [MotionFX](motion.md) | `MFX` | `fx/motion` | Device motion and attitude |
| [MediaFX](media.md) | `MEFX` | `fx/media` | Rational time, timebases, sample buffers |
| [VideoFX](video.md) | `VFX` | `fx/video`, `fx/video/webm` | Frames, codecs, capture, containers |
| [MIDIFX](midi.md) | `MIFX` | `fx/midi` | MIDI 2.0 packets, parsing and scheduling |
| [BluetoothFX](bluetooth.md) | `BTFX` | `fx/bluetooth` | Bluetooth Low Energy central role and GATT |
| [NFCFX](nfc.md) | `NFX` | `fx/nfc` | Reading NDEF tags in the foreground |
| [SpeechFX](speech.md) | `SPFX` | `fx/speech` | Speech recognition from supplied audio (no browser backend yet) |
| [ContactsFX](contacts.md) | `CNFX` | `fx/contacts` | Picking contacts, one request at a time |
| [PassFX](pass.md) | `PKFX` | `fx/pass` | Payment requests and authorisation (no browser presentation yet) |
| [XRFX](xr.md) | `XRFX` | `fx/xr` | Augmented-reality sessions, frames, anchors and raycasts |
| [LocationFX](location.md) | `LFX` | `fx/location` | Position, course and authorisation |
| [LuminaFX](lumina.md) | `LUFX` | `fx/lumina` | On-device indexing and search |
| [CompressionFX](compression.md) | `CPFX` | `fx/compression` | Streaming compression through input and output filters |
| [NetworkFX](network.md) | `NWFX` | `fx/network` | Network path monitoring |
| [CryptoFX](crypto.md) | `CRFX` | `fx/crypto` | Hashes, HMAC, HKDF, AES-GCM, NIST curves and Curve25519 over Foundation bytes |
| [DispatchFX](dispatch.md) | `DFX` | `fx/dispatch` | Queues, QoS, work items, groups, semaphores, timers and sources |

Every import path is relative to `@syndromatic/syncloudos/`, for example `@syndromatic/syncloudos/fx/audio`.

## Where each framework is documented

Each framework has a main page with an overview and a reference with examples. The three largest are split across several pages.

| Framework | Pages |
| --- | --- |
| AnimationFX | [Overview, timing, animations and transactions](animation.md), [Layers](animation/layers.md), [Effects and rendering](animation/effects.md) |
| GraphicsFX | [Geometry, colour, transforms and paths](graphics.md), [Paint and images](graphics/paint-and-images.md), [Drawing contexts](graphics/contexts.md), [PDF](graphics/pdf.md) |
| ImageFX | [Images, contexts and sessions](image.md), [The filter catalogue](image/filters.md), [Analysis and RAW](image/analysis-and-raw.md), [Kernels and graphs](image/kernels-and-graphs.md), [Shaders](image/shaders.md) |
| The others | One page each, linked in the table above |

## Two ways to use them

**As libraries.** Value types and pure computations import straight from their entry and run anywhere JavaScript runs, including tests and workers. Colours, paths, time values, audio formats, haptic patterns and filter graphs need no host.

```ts
import { offsetRect } from "@syndromatic/syncloudos/fx/graphics";

const moved = offsetRect({ x: 2, y: 3, width: 4, height: 5 }, 10, 20);
```

CompressionFX, CryptoFX and DispatchFX's value types work the same way: no mounted session and no permission. CompressionFX's codecs live in [Foundation](../foundation.md), which is also where one-shot `NSEData` compression comes from.

**Through the session.** Anything that touches a device, the page or the user's attention belongs to the mounted SynWare session. Cameras, microphones, speakers, sensors, location, layers bound to elements and decoded resources live as long as the application does, so the host can enforce permissions, respect the user's settings and release everything when the app closes. In React components, these hooks from `@syndromatic/syncloudos/sdk` give you the session-bound object:

| Hook | Returns | Entitlements |
| --- | --- | --- |
| `useAnimations` | Layers bound to page elements, canvas renderers | None |
| `useImages` | Decoded image resources | None |
| `useTextLayout` | Text measurement and fonts | None |
| `useAudio` | Audio engines and sessions | `audio.play`, `audio.record` |
| `useSpeechSynthesizer` | `AUFXSpeechSynthesizer` | `audio.speech` |
| `useHaptics` | Haptic engine | `haptics.play` |
| `useMotion` | Motion manager | `motion.read` |
| `useMedia` | Media clocks | None |
| `useVideo` | Capture, decode, encode | `video.capture.camera`, `video.capture.display`, `video.capture.element` |
| `useVideoPresentation` | Picture-in-picture and playback-route detection | `video.pictureInPicture`, `video.route` |
| `useMIDI` | MIDI access | `midi.access`, `midi.sysex` |
| `useBluetooth` | `BTFXCentralManager` | `bluetooth.access` |
| `useNFC` | `NFXNDEFReaderSession` | `nfc.read`, `nfc.write` |
| `useSpeech` | `SPFXSpeechRecognizer` | `speech.recognize` |
| `useContacts` | `CNFXContactStore`; pick contacts with an NSE-presented picker | `contacts.select` |
| `usePayment(request)` | `PKFXPaymentAuthorizationController` | `payment.request` |
| `useXR` | `XRFXSession` | `xr.session` |
| `useLocation` | `LFXLocationManager` | `location.read`, `location.request` |
| `useLumina` | Search index | `lumina.query`, `lumina.index` |
| `useNetwork` | `NWFXPathMonitor` | `network.read` |

Objects returned by these hooks belong to the component: they survive React StrictMode's effect replay and are released when the component unmounts. Declare the entitlements your app needs in its manifest `entitlements` list. A denied capability arrives as an ordinary result or error that your app can explain to the user.

## Shared conventions

- **Immutable values.** Colours, rectangles, times, paths and buffers are frozen. Operations return new values.
- **Explicit lifetimes.** Objects that own a resource have a `dispose()`, `close()`, `cancel()` or `invalidate()` method, or are released by the hook that created them. The session releases anything an app forgets when it closes.
- **Cancellation.** Long-running session operations take an `AbortSignal` where the framework's API calls for one; frameworks built around delegates and completion handlers (such as NFCFX and CryptoFX) do not.
- **System preferences.** Animation and haptics follow the user's reduced-motion and feedback settings without extra code.
- **Capability reporting.** Browsers differ, so the frameworks report what the host supports (codec capabilities in VideoFX, authorisation in LocationFX) and fail clearly rather than guess.

## Scaffolding an example

In a checkout of the framework repository, `npm run synware:create -- src/SynWare/Example.app --fx animation,audio` creates a bundle with a working call into each framework you name. See the [SDK tooling notes](../synware-sdk.md#tooling).
