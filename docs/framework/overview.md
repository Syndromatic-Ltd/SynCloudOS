# Overview

SynCloudOS is an application framework for the web, shaped after Cocoa. It gives a browser the platform layer a desktop environment provides: a runtime with a formal lifecycle, a kit of controls and controllers, twenty-two FX frameworks, a windowing system, and an application bundle format. You write TypeScript and React while the framework supplies the platform.

## The layers

```text
┌──────────────────────────────────────────────────────────────────────┐
│  SynWare applications         .app bundles built on the SDK          │
├──────────────────────────────────────────────────────────────────────┤
│  Webspring shell              Board launcher, stage, quick switch    │
├──────────────────────────────────────────────────────────────────────┤
│  NSE application kit          controls, controllers, data views,     │
│                               text views, windows, menus, Atmo theme │
├──────────────────────────────────────────────────────────────────────┤
│  FX frameworks                22 TypeScript analogues of Apple Core  │
│                               and system frameworks                  │
├──────────────────────────────────────────────────────────────────────┤
│  SynCloudOS runtime           statechart, commands, responders,      │
│                               undo, documents, windows, authorisation│
├──────────────────────────────────────────────────────────────────────┤
│  Foundation                   bytes, ranges, collections, formatters │
└──────────────────────────────────────────────────────────────────────┘
```

[Foundation](foundation.md) supplies immutable data and collection values shared by NSE, FX and the runtime. It has no React, view or runtime dependency so it runs in web workers as well as UI threads, and shares the `NSE` prefix with NSE just as Foundation and AppKit share `NS` in Cocoa.

The runtime is the kernel. Each runtime owns its store, services and queues, so several runtimes can share one page. It tracks the application lifecycle in a statechart, routes key events through a responder chain, dispatches typed commands, keeps undo history, persists documents and manages windows. Its [authorisation services](authorization.md) keep bundle entitlements, site configuration profiles, named administrative rights and per-app privacy choices separate, while device consent belongs to each FX framework backed by one runtime privacy store.

FX is a set of twenty-two TypeScript frameworks shaped after Apple's Core and system frameworks: AnimationFX (Core Animation), GraphicsFX (Quartz 2D), ImageFX (Core Image), TextFX (Core Text), AudioFX (AVAudioEngine), HapticsFX (Core Haptics), MotionFX (Core Motion), MediaFX (Core Media), VideoFX (Video Toolbox and AVFoundation), MIDIFX (Core MIDI), BluetoothFX (Core Bluetooth), NFCFX (Core NFC), SpeechFX (Speech), ContactsFX (Contacts), PassFX (PassKit), XRFX (ARKit sessions), LocationFX (Core Location), LuminaFX (Core Spotlight), CompressionFX (Compression), NetworkFX (Network), CryptoFX (CryptoKit) and DispatchFX (Dispatch). See the [FX frameworks](fx/README.md).

NSE is the application kit and plays the role of AppKit: you write `NSEButton` where a Mac developer writes `NSButton`. NSE draws its appearance from a theme, with [Atmo](appearance.md) as the default material theme.

Webspring is the shell. It presents the Board launcher (a paged icon grid inspired by iOS Springboard), hosts the application stage, provides the app switcher and notifications, and runs the sign-in gate.

SynWare is the application model. A SynWare is a `.app` bundle that declares itself with a manifest and receives a scoped session from the host, so everything it needs from the platform arrives through that session.

## Conventions

The same handful of rules holds across every layer, so learning one area teaches you the others.

The host owns the runtime. Your application never holds the runtime, a store or a registry, because it receives small client objects that expose one capability each, such as commands, documents, windows or audio. That keeps applications portable between hosts and lets the host enforce policy.

Missing capabilities are values. When you look up a service through `useService`, an absent or denied service comes back as `{ available: false, client: null, denial }` so you can check `available` and render the matching state.

Work is cancellable. Long operations accept an `AbortSignal`, and the mounted session carries a signal that aborts when the application closes so passing `app.signal` to your own async work releases it cleanly.

Everything you acquire, you release. Registrations return handles with `dispose()`, hooks release their resources on unmount, and runtimes, audio engines, decoders and layers follow the same rule, verified by leak tests.

Values are immutable. Snapshots, geometry, colours and controller state are frozen, so you change state by asking the owner and reading the next snapshot.

Naming carries meaning. Each FX framework uses a short prefix on its public types (`AFX`, `GFX`, `IFX`, `TFX`, `AUFX`, `HFX`, `MFX`, `MEFX`, `VFX`, `MIFX`, `BTFX`, `NFX`, `SPFX`, `CNFX`, `PKFX`, `XRFX`, `LFX`, `LUFX`, `CPFX`, `NWFX`, `CRFX` and `DFX`), NSE types start with `NSE`, and SDK hooks use capability names such as `useStrings` and `useAppearance`.

Presentation adapts to the host. Every SynWare declares which presentations it supports (`desktop`, `tablet` or `mobile`), the host chooses the active presentation, and your application reads the traits of its current surface (size class, safe areas, pointer type and reduced motion) through `useSCOS().presentation`.

Accessibility is part of the contract. Every pointer interaction has a keyboard path and a touch path, while controls expose labels, roles and focus behaviour and follow reduced motion, reduced transparency and forced colours settings.

## The package

Everything ships in one package, `@syndromatic/syncloudos`, with explicit subpath entries so deep imports are rejected.

### Application development

| Entry | Contents |
| --- | --- |
| package root | `SCOS`, `useSCOS`, reactive hooks, `define*` declarations, application classes and app SDK types |
| `sdk` | Scoped clients and hooks, routing, manifest validation, document and command types |
| `sdk/testing` | `createSynWare`, `createSynWareTestHost`, a deterministic test host and denial-first fakes |
| `sdk/animation-host` | Scheduler and surface types for custom AnimationFX render hosts |
| `foundation` | [Foundation](foundation.md): immutable data, collections, ranges, formatters and preferences |
| `nse` | The complete NSE surface: controls, controllers, data views, colour, layout and appearance |
| `nse/controls` | The control and chrome subset for focused imports |
| `nse/text` | Portable text, owners, editing sessions, text views, input and geometry cooperation |
| `nse/content` | Portable attributed content values |
| `nse/theme` | Theme contract hooks, colour names and `NSETheme` types |
| `nse/appearance` | The appearance provider, slots and material lighting |
| `nse/themes/atmo` | The Atmo theme definition |
| `nse/layout`, `nse/scroll`, `nse/page`, `nse/system-ui` | Focused presentation entries |
| `nse/styles.css` | Base NSE styles |
| `nse/themes/atmo/styles.css` | Theme styles and resources |
| `typography` | `defineFontDeclaration`, the Node-safe [managed fonts](managed-fonts.md) declaration |

### FX frameworks

| Entry | Framework |
| --- | --- |
| `fx/animation` | AnimationFX |
| `fx/graphics` | GraphicsFX, including PDF |
| `fx/image` | ImageFX |
| `fx/text` | TextFX |
| `fx/audio` | AudioFX |
| `fx/haptics` | HapticsFX |
| `fx/motion` | MotionFX |
| `fx/media` | MediaFX |
| `fx/video`, `fx/video/webm` | VideoFX and its WebM container backend |
| `fx/midi` | MIDIFX |
| `fx/bluetooth` | BluetoothFX |
| `fx/nfc` | NFCFX |
| `fx/speech` | SpeechFX |
| `fx/contacts` | ContactsFX |
| `fx/pass` | PassFX |
| `fx/xr` | XRFX |
| `fx/location` | LocationFX |
| `fx/lumina` | LuminaFX |
| `fx/compression` | CompressionFX |
| `fx/network` | NetworkFX |
| `fx/crypto` | CryptoFX |
| `fx/dispatch` | DispatchFX |

### Hosting and tooling

| Entry | Contents |
| --- | --- |
| `webspring` | `defineWebspring`, the Board launcher and the shell types |
| `webspring/styles.css` | Webspring shell styles |
| `chronosphere` | `Chronosphere`, the version archive any application presents, with its Vortex and grid views and `VortexEffect` |
| `chronosphere/styles.css` | Chronosphere styles |
| `browser` | `mountSynCloudOS`, the browser host |
| `browser/styles.css` | Layout and chrome styles for the shell and application stage |
| `auth` | `createHttpAuthentication` and the sign-in types |
| `authentication-services` | Optional [passkey controllers, providers and requests](authentication-services.md) for an application's own server |
| `auth/passkey` | Optional passkey provider composition for system sign-in beside OIDC/local providers |
| `server/auth` | The Worker-side authentication handler and stores |
| `vite` | The Vite plugin that discovers bundles and the shell |

## What to read next

- [Getting started](getting-started.md) builds a site end to end.
- [SynWare SDK](synware-sdk.md) covers application development.
- [Authorisation](authorization.md) explains entitlements, site access, named rights and privacy.
- [NSE controls](nse-controls.md) catalogues the control set.
- [FX frameworks](fx/README.md) documents the twenty-two FX frameworks one by one.
