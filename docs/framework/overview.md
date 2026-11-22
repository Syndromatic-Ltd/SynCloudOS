# Overview

SynCloudOS is an application framework for the web. It gives the browser the layer a desktop operating system normally provides: a runtime with a formal lifecycle, a kit of controls and controllers, twenty-two FX frameworks, a windowing system and an application bundle format. You write TypeScript and React on top of it.

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
│  FX frameworks                22 frameworks for graphics, media,     │
│                               devices, networking and concurrency    │
├──────────────────────────────────────────────────────────────────────┤
│  SynCloudOS runtime           statechart, commands, responders,      │
│                               undo, documents, windows, authorisation│
├──────────────────────────────────────────────────────────────────────┤
│  Foundation                   bytes, ranges, collections, formatters │
└──────────────────────────────────────────────────────────────────────┘
```

[Foundation](foundation.md) supplies the immutable data and collection values that NSE, FX and the runtime share. It has no React, view or runtime dependency, so it runs in web workers as well as on the main thread. Its types share the `NSE` prefix with the application kit.

The runtime is the kernel. Each runtime owns its store, services and queues, so several runtimes can share one page. It tracks the application lifecycle in a statechart, routes key events through a responder chain, dispatches typed commands, keeps undo history, persists documents and manages windows. Its [authorisation services](authorization.md) keep bundle entitlements, site configuration profiles, named administrative rights and per-app privacy choices separate. Device consent belongs to each FX framework, backed by one runtime privacy store.

FX is a set of twenty-two TypeScript frameworks for work below the view layer: layer animation (AnimationFX), 2D drawing and PDF (GraphicsFX), image processing (ImageFX), text layout (TextFX), audio (AudioFX), haptics (HapticsFX), device motion (MotionFX), media timing (MediaFX), video decoding and playback (VideoFX), MIDI (MIDIFX), Bluetooth (BluetoothFX), NFC (NFCFX), speech (SpeechFX), contacts (ContactsFX), passes (PassFX), XR sessions (XRFX), location (LocationFX), search indexing (LuminaFX), compression (CompressionFX), network path monitoring (NetworkFX), cryptography (CryptoFX) and work queues (DispatchFX). See the [FX frameworks](fx/README.md).

NSE is the application kit: controls, controllers, data views, text views, windows and menus. If you have written AppKit code the names will look familiar (`NSEButton`, `NSEViewController`). NSE draws its appearance from a theme, with [Atmo](appearance.md) as the default.

Webspring is the shell. It presents the Board launcher (a paged grid of application icons), hosts the application stage, provides the app switcher and notifications, and runs the sign-in gate.

SynWare is the application model. A SynWare is a `.app` bundle that declares itself with a manifest and receives a scoped session from the host. Everything it needs from the platform arrives through that session.

## Conventions

A few rules hold across every layer. Once you know them in one area, you know them everywhere.

The host owns the runtime. Your application never holds the runtime, a store or a registry. It receives small client objects that each expose one capability, such as commands, documents, windows or audio. This keeps applications portable between hosts and lets the host enforce policy.

Missing capabilities are values. When you look up a service through `useService`, an absent or denied service comes back as `{ available: false, client: null, denial }`. Check `available` and render the matching state.

Work is cancellable. Long operations accept an `AbortSignal`, and the session carries a signal that aborts when the application closes. Pass `useSCOS().signal` (or `SCOS.signal`) to your own asynchronous work and it stops with the application.

What you acquire, you release. Registrations return handles with `dispose()`, and hooks release their resources on unmount. Runtimes, audio engines, decoders and layers follow the same rule, and leak tests check it.

Values are immutable. Snapshots, geometry, colours and controller state are frozen. To change state, ask its owner and read the next snapshot.

Names tell you where a type lives. Each FX framework uses a short prefix on its public types (`AFX`, `GFX`, `IFX`, `TFX`, `AUFX`, `HFX`, `MFX`, `MEFX`, `VFX`, `MIFX`, `BTFX`, `NFX`, `SPFX`, `CNFX`, `PKFX`, `XRFX`, `LFX`, `LUFX`, `CPFX`, `NWFX`, `CRFX` and `DFX`), NSE types start with `NSE`, and SDK hooks use capability names such as `useStrings` and `useAppearance`.

Presentation adapts to the host. Every SynWare declares which presentations it supports (`desktop`, `tablet` or `mobile`) and the host chooses the active one. Your application reads the traits of its current surface (size class, safe areas, pointer type and reduced motion) through `useSCOS().presentation`.

Accessibility is part of the contract. Every pointer interaction has a keyboard path and a touch path. Controls expose labels, roles and focus behaviour, and respect the reduced motion, reduced transparency and forced colours settings.

## The package

Everything ships in one package, `@syndromatic/syncloudos`. Import from the subpath entries below; the package rejects deep imports.

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
| `webspring` | `createWebspring`, `WSApplication`, the launcher classes (`WSLauncherViewController`, `WSBoardViewController`, `WSIconView`) and the shell types |
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
