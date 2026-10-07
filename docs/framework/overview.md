# Overview

SynCloudOS is an application framework for the web, in the tradition of Cocoa. It gives a browser the pieces a desktop platform provides: a runtime with a formal lifecycle, a kit of controls and controllers, media frameworks, a windowing system, and an application bundle format. You write TypeScript and React. The framework supplies the platform.

This page describes the layers, the conventions they share, and the package that delivers them.

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
│  FX frameworks                animation, graphics, image, text,      │
│                               audio, haptics, motion, media, video,  │
│                               MIDI, location, discovery              │
├──────────────────────────────────────────────────────────────────────┤
│  SynCloudOS runtime           statechart, commands, responders,      │
│                               undo, documents, windows, PolicyKit    │
└──────────────────────────────────────────────────────────────────────┘
```

**The runtime** is the kernel. Each runtime owns its store, services and queues, so several runtimes can share one page. It tracks the application lifecycle in a statechart, routes key events through a responder chain, dispatches typed commands, keeps undo history, persists documents and manages windows. PolicyKit checks every privileged action against the roles your host defines.

**FX** is a set of twelve frameworks written in TypeScript as web-native analogues of Apple's Core frameworks. AnimationFX corresponds to Core Animation, GraphicsFX to Quartz 2D, ImageFX to Core Image, TextFX to Core Text, AudioFX to AVAudioEngine, HapticsFX to Core Haptics and MotionFX to Core Motion. Four more cover media time, video, MIDI and location, and one covers on-device discovery. See the [FX frameworks](fx/README.md).

**NSE** is the application kit, the counterpart of AppKit. The name follows the same convention: NS for NeXTSTEP, NSE for the Syndromatic edition. You write `NSEPushButton` where a Mac developer writes `NSButton`. NSE draws its appearance from a theme. [Atmo](appearance.md) is the default theme, a tactile material language that plays the role Aqua played on Mac OS X.

**Webspring** is the shell. It presents the launcher, hosts the application stage, provides the app switcher and notifications, and runs the sign-in gate. Its Board launcher is a paged icon grid inspired by iOS Springboard.

**SynWare** is the application model. A SynWare is a bundle, shaped like a Mac OS X `.app`, that declares itself with a manifest and receives a scoped session from the host. Everything a SynWare needs from the platform arrives through that session.

## Conventions

The same handful of rules holds across every layer, so learning one area teaches you the others.

**The host owns the runtime.** Your application never holds the runtime, a store or a registry. It receives clients: small objects that expose one capability each, such as commands, documents, windows or audio. This keeps applications portable between hosts and lets the host enforce policy.

**Missing capabilities are values.** When you look up a service through `useSynWareService`, an absent or denied service comes back as `{ available: false, client: null, denial }`. Check `available` and render the matching state.

**Work is cancellable.** Long operations accept an `AbortSignal`. The mounted session carries one signal that aborts when the application closes, so passing `app.signal` to your own async work releases it correctly.

**Everything you acquire, you release.** Registrations return handles with `dispose()`. Hooks release their resources on unmount. Runtimes, audio engines, decoders and layers follow the same rule, and the framework verifies teardown with leak tests.

**Values are immutable.** Snapshots, geometry, colours and controller state are frozen. You change state by asking the owner and reading the next snapshot.

**Naming carries meaning.** Each FX framework uses a short prefix: `AFX`, `GFX`, `IFX`, `TFX`, `AUFX`, `HFX`, `MFX`, `MEFX`, `VFX`, `MIFX`, `LFX` and `LUFX`. NSE types start with `NSE`. SDK hooks start with `useSynWare`.

**Presentation adapts to the host.** Every SynWare declares which presentations it supports: `desktop`, `tablet` or `mobile`. The host chooses the presentation, and your application reads the traits of its current surface (size class, safe areas, pointer type, reduced motion and more) through `useSynWare().presentation`.

**Accessibility is part of the contract.** Every pointer interaction has a keyboard path and a touch path. Controls expose labels, roles and focus behaviour, and they follow the reduced motion, reduced transparency and forced colours settings.

## The package

Everything ships in one package, `@syndromatic/syncloudos`. It uses explicit subpath entries, so the package exposes exactly the surface listed here and rejects deep imports.

### Application development

| Entry | Contents |
| --- | --- |
| `sdk` | `createSynWare`, `useSynWare`, the scoped hooks, routing, manifest validation, document and command types |
| `sdk/testing` | A deterministic test host and denial-first fakes |
| `sdk/animation-host` | Scheduler and surface types for custom AnimationFX render hosts |
| `nse` | The complete NSE surface: controls, controllers, data views, colour, layout and appearance |
| `nse/controls` | The control and chrome subset for focused imports |
| `nse/text` | Portable text, owners, editing sessions, text views, input and geometry cooperation |
| `nse/content` | Portable attributed content values |
| `nse/appearance` | The appearance provider, slots and material lighting |
| `nse/themes/atmo` | The Atmo theme definition |
| `nse/layout`, `nse/scroll`, `nse/page`, `nse/cover-flow`, `nse/system-ui` | Focused presentation entries |
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
| `fx/location` | LocationFX |
| `fx/lumina` | LuminaFX |

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
| `server/auth` | The Worker-side authentication handler and stores |
| `vite` | The Vite plugin that discovers bundles and the shell |

## What to read next

- [Getting started](getting-started.md) builds a site end to end.
- [SynWare SDK](synware-sdk.md) covers application development.
- [NSE controls](nse-controls.md) catalogues the control set.
- [FX frameworks](fx/README.md) documents the media frameworks one by one.
