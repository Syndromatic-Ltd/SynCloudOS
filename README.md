# SynCloudOS

SynCloudOS is a web application framework for TypeScript and React 19. Its design follows Apple's AppKit and Cocoa, and if you remember Cappuccino, you'll recognise what it's after: real desktop-class applications running in a browser tab. You get a runtime with a proper lifecycle, a responder chain with typed commands, undo for each document, a real windowing system, a kit of controls and controllers, twenty-two FX frameworks and a bundle format to ship it all in.

> [!NOTE]
> SynCloudOS 1.0 Public Beta (`v1.0.0-beta.2`). The architecture and public entry points are in place and covered by tests, but the API may change before 1.0. If something breaks, please [open an issue](https://github.com/Syndromatic-Ltd/SynCloudOS/issues).

## Why it exists

Picture this. You're in your room, probably underpaid and overworked, on your fifth coffee. You (or your AI) have spent three days on something that sounded simple: version history for a document. Your keyboard shortcuts live in a dozen `useEffect` listeners. The toolbar's Save button stays lit when there's nothing to save. Your virtualised list forgets the selection every time it scrolls. Your `package.json` has more dependencies than your app has features.

Congratulations, you've found the dark side of maintaining a standard React app. Why does anything sophisticated need three hundred bazillion npm packages?

Mac developers haven't had this problem for decades. AppKit gives every app a responder chain, typed commands, document controllers and a shared undo manager, so nobody builds them from scratch. SynCloudOS brings that toolkit to the web and gives your next banger app or website desktop-class superpowers. You bring the idea. We handle the rest.

## What's in the box

- **AppKit-style MVC.** Subclass `NSEApplication` and `NSEViewController`, mark state `@observable` and bind controls to it. When a value changes, every bound control follows, without a tangle of `useState` plumbing.
- **One command system.** Menus, shortcuts and toolbars all send the same typed commands through a responder chain. A Save button greys itself out when the focused view has nothing to save, because it asks first.
- **Documents and undo.** Each document keeps its own undo history and autosaves against known versions. When two edits conflict, you resolve the conflict yourself and nobody's work gets overwritten.
- **Windows.** Ordering, key and main state, popovers and sheets, and restoration when your user comes back.
- **Layouts that adapt.** Shrink the window to phone width and split views settle on a single pane, tab bars gather overflow into a More list, and each window follows its mobile policy. On foldables such as the iPhone Duo, the runtime reports the fold's posture and segments, so split views and overlays keep your content off the hinge.
- **Controls with taste.** NSE handles focus, keyboard navigation and accessibility. The Atmo theme draws glossy buttons, brushed metal and soft depth in vector CSS and SVG, in light and dark.
- **Twenty-two FX frameworks.** Animation, graphics, audio, haptics, video, MIDI, Bluetooth, speech, crypto and more. Device access shuts itself down when your app closes, so you stop leaking listeners.
- **Bundles.** You ship each app as a `.app` folder with a checked manifest. The host validates it, applies its access rules and loads it on demand.

Everything is TypeScript, and every subsystem ships with contract, accessibility and performance tests.

## Getting SynCloudOS

Use a patched Node.js release (`22.23.4+`, `24.22.1+`, or `26.12.1+` on its release line) and npm; CI runs Node.js `24.22.1`. The framework pins TypeScript `6.0.3` because its tooling uses the JavaScript compiler API, and expects React 19 (`^19.1.1`) as a peer dependency.

The beta is published to npm under the `@syndromatic` organisation. Install `@syndromatic/syncloudos` into a React 19 and TypeScript Vite project with:

```bash
npm install @syndromatic/syncloudos@beta
```

To add the offline [Developer MCP companion](docs/framework/developer-mcp.md) for AI coding agents, install the matching version as a dev dependency:

```bash
npm install --save-dev @syndromatic/syncloudos-developer-mcp@beta
```

Release tarballs are also attached to [GitHub Releases](https://github.com/Syndromatic-Ltd/SynCloudOS/releases). To build local `.tgz` archives from a framework checkout instead:

```bash
git clone https://github.com/Syndromatic-Ltd/SynCloudOS.git
cd SynCloudOS
npm ci --ignore-scripts
npm run sdk:build
```

That writes `.artifacts/synapp-sdk/archives/syndromatic-syncloudos-1.0.0-beta.2-<sha256>.tgz`, which you can install into a consumer project with `npm install /path/to/that.tgz`.

## A first application

Add the SynCloudOS Vite plugin to `vite.config.ts` so Vite discovers your `.app` bundles, preference panes, widgets, integrations, and optional shell, and supplies standard decorators:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { synCloudOS } from "@syndromatic/syncloudos/vite";

export default defineConfig({ plugins: [react(), synCloudOS()] });
```

An application lives in `src/SynWare/Hello.app/Contents/`. Its required `Info.ts` declares the bundle identifier, display name, version, routes, and access policy:

```ts
import type { SynWareInfo } from "@syndromatic/syncloudos/sdk";

export default {
  bundleIdentifier: "com.example.hello",
  displayName: "Hello",
  version: "1.0.0",
  runtime: { policy: { public: true } },
  routes: [{ path: "/hello", primary: true }],
  webspring: { visible: true },
} satisfies SynWareInfo;
```

Its `index.tsx` subclasses `NSEApplication` and `NSEViewController` with observable state, bindings, and actions, while function components remain an option for small apps:

```tsx
import {
  NSEApplication,
  NSEViewController,
  SCOS,
  action,
  actionRef,
  bind,
  observable,
  type NSEBinding,
} from "@syndromatic/syncloudos";
import { NSEButton, NSETextField } from "@syndromatic/syncloudos/nse/controls";

export class HelloViewController extends NSEViewController {
  @observable accessor name = "";
  readonly nameBinding: NSEBinding<string> = bind<HelloViewController, "name">(this, "name");
  readonly clearAction = actionRef(HelloViewController, "clear");

  @action
  clear() {
    this.name = "";
    return this.name;
  }

  override renderView() {
    return (
      <section aria-label="Hello">
        <NSETextField aria-label="Name" binding={this.nameBinding} />
        <p>Hello{this.name ? `, ${this.name}` : ""}, from {SCOS.app.displayName}.</p>
        <NSEButton action={this.clearAction} title="Clear" />
      </section>
    );
  }
}

export default class Hello extends NSEApplication {
  static override mainViewController = HelloViewController;
}
```

Bundle identifiers use reverse-DNS syntax with at least two dots; lookups and storage partitions are case-insensitive while public metadata preserves your authored casing. See [the getting started guide](docs/framework/getting-started.md) to mount the application directly or behind a Webspring launcher, and read [the authoring contract](docs/framework/authoring-contract.md) for the rules coding agents also receive via `AGENTS.md`.

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

[Foundation](docs/framework/foundation.md) gives you immutable data, ranges, collections, predicates, sort descriptors, formatters and user defaults. It has no React or DOM dependency, so it runs in a web worker as happily as on the main thread.

[The runtime](docs/framework/runtime.md) comes from `createSynCloudOS`, one per host. It reads no globals, so several runtimes can share a page. A statechart drives boot, the shell and each application's lifecycle. The responder chain, command validation, document undo, autosave and window restoration handle what the user does and what the app remembers. Configuration profiles decide which applications a user can open, `SCAuthorization` checks named administrative rights, and a privacy store records which apps may use which devices. All of these run in the browser page, so your servers still need to enforce their own access rules. See [authorisation](docs/framework/authorization.md) and [privacy](docs/framework/privacy.md).

[The FX frameworks](docs/framework/fx/README.md) are twenty-two TypeScript libraries (`AnimationFX`, `GraphicsFX`, `ImageFX`, `TextFX`, `AudioFX`, `HapticsFX`, `MotionFX`, `MediaFX`, `VideoFX`, `MIDIFX`, `BluetoothFX`, `NFCFX`, `SpeechFX`, `ContactsFX`, `PassFX`, `XRFX`, `LocationFX`, `LuminaFX`, `CompressionFX`, `NetworkFX`, `CryptoFX`, and `DispatchFX`). You can import value types and pure computations anywhere. Devices, sensors and drawing surfaces come from the mounted session, which releases them when the application closes.

[NSE](docs/framework/nse-controls.md) is the application kit: buttons, fields, menus, toolbars, controllers such as `NSEArrayController`, and view controllers. Each control handles its own behaviour, focus, keyboard navigation and accessibility, and takes its look from a theme. [Atmo](docs/framework/appearance.md) ships as the default, with light and dark CSS and SVG materials. See [controllers](docs/framework/controllers.md) and [data views](docs/framework/data-views.md).

[Webspring](docs/framework/webspring.md) is the optional desktop and mobile shell: the paged Board launcher, the application stage, a quick switcher, notifications, preferences and a sign-in gate. If you don't want a shell, mount a single application through `@syndromatic/syncloudos/browser`.

[SynWare bundles](docs/framework/synware-sdk.md) package an application in a `.app` folder with a validated `Contents/Info.ts` manifest. Mounted applications never touch the runtime or its registries directly because `SCOS` inside an app folder (and `useSCOS()` in shared components) exposes narrow capability clients, while hooks such as `useCommands`, `useDocument`, `useAppearance`, and `useService` subscribe to reactive snapshots and return explicit denial values when a capability is unavailable.

## Package entries

Everything ships in `@syndromatic/syncloudos` with explicit subpath entries so deep imports are rejected:

- `@syndromatic/syncloudos`: `SCOS`, `useSCOS`, application and controller classes, decorators, reactive hooks, the Webspring and preference classes (`WSApplication`, `WSWidget`, `NSEPreferencePane`, `createWebspring`), and `defineIntegration`
- `sdk`, `sdk/testing`, `sdk/animation-host`: scoped client types, routing, manifest validation, deterministic test host (`createSynWareTestHost`), and custom AnimationFX host types
- `foundation`: immutable collections, ranges, predicates, formatters, `NSEData`, `NSEUUID`, and `NSEUndoManager`
- `nse`, `nse/controls`, `nse/text`, `nse/content`, `nse/theme`, `nse/appearance`, `nse/layout`, `nse/scroll`, `nse/page`, `nse/system-ui`: the application kit and its focused subsets, plus `nse/styles.css`
- `nse/themes/atmo`, `nse/themes/atmo/styles.css`: the built-in Atmo theme definition and stylesheet
- `typography`: Node-safe `defineFontDeclaration` for managed fonts
- `fx/animation`, `fx/graphics`, `fx/image`, `fx/text`, `fx/audio`, `fx/haptics`, `fx/motion`, `fx/media`, `fx/video`, `fx/video/webm`, `fx/midi`, `fx/bluetooth`, `fx/nfc`, `fx/speech`, `fx/contacts`, `fx/pass`, `fx/xr`, `fx/location`, `fx/lumina`, `fx/compression`, `fx/network`, `fx/crypto`, `fx/dispatch`: the twenty-two FX frameworks
- `webspring`, `webspring/styles.css`, `chronosphere`, `chronosphere/styles.css`, `browser`, `browser/styles.css`: the shell, version archive, browser host, and their stylesheets
- `auth`, `auth/passkey`, `authentication-services`, `server/auth`: browser and server authentication providers and passkey support
- `vite`: the Vite discovery and bundling plugin

See [the overview](docs/framework/overview.md#the-package) for details on each entry.

## Documentation

Start with [the framework guide index](docs/framework/README.md), which links every guide in the repository.

| Guide | Covers |
| --- | --- |
| [Getting started](docs/framework/getting-started.md) | Creating a project, mounting an app, or adding Webspring |
| [Overview](docs/framework/overview.md) | Layers, shared conventions, and package entries |
| [Beta.2 migration](docs/framework/migration-beta2.md) | Updating from beta.1 manifests, hooks, and component apps |
| [Applications](docs/framework/applications.md) and [Class authoring](docs/framework/cocoa-authoring.md) | `NSEApplication`, window/view controllers, bindings, and actions |
| [SynWare SDK](docs/framework/synware-sdk.md) and [Manifest reference](docs/framework/synware-manifest.md) | Sessions, hooks, routing, services, and `Info.ts` |
| [Commands, responders and undo](docs/framework/commands-responders-undo.md) | Responder chain, command validation, and undo |
| [Documents](docs/framework/documents.md) and [Windows](docs/framework/windows.md) | Editing, autosave, conflict states, and window management |
| [NSE controls](docs/framework/nse-controls.md), [Controllers](docs/framework/controllers.md), and [Data views](docs/framework/data-views.md) | Controls, array/tree/object controllers, and virtualised views |
| [Text and editing](docs/framework/text-and-editing.md) and [Drag and pasteboard](docs/framework/drag-and-pasteboard.md) | Text sessions, typography, pasteboard, and drag |
| [Appearance and Atmo](docs/framework/appearance.md) and [Themes](docs/framework/themes.md) | Light/dark appearances and `.scostheme` bundles |
| [FX frameworks](docs/framework/fx/README.md) | All twenty-two FX frameworks |
| [The runtime and the host](docs/framework/runtime.md) and [Webspring](docs/framework/webspring.md) | Hosting, policy profiles, shell, and launcher |
| [Authentication](docs/framework/authentication.md) and [Authorisation](docs/framework/authorization.md) | Sign-in, roles, rights, and privacy |
| [Testing a SynWare](docs/framework/testing-synware.md) | Deterministic unit and integration tests |
| [Developer MCP](docs/framework/developer-mcp.md) | Offline SDK lookup and validation tools for coding agents |

## Developing the framework

Run the checks from the repository root:

```bash
npm ci --ignore-scripts
npm run typecheck                  # strict TypeScript across the workspace
npm run typecheck:contracts        # public compile-time type contracts
npm run boundaries:architecture    # layer and import boundary checks
npm run sdk:build                  # build and pack the SDK and Developer MCP archives
npm test                           # unit suite on Vitest 5.1 (about 2½ minutes)
npm run test:packaging             # packed-SDK consumer tests (after npm run sdk:build)
npm run test:e2e                   # Playwright acceptance tests (Chromium, Firefox, WebKit)
```

`npm test` runs in two groups. The CPU-heavy source scanners, counterpart checks and timing budgets go first with limited parallelism, then the unit, NSE, integration and decoupling tests follow. The packaging tests install the packed `.tgz` into a throwaway consumer project, so they need a fresh `npm run sdk:build` and run on their own with `npm run test:packaging`. See [tests/README.md](tests/README.md) and `.github/workflows/framework-boundaries.yml` for the full CI order.

```text
src/
  Foundation/       immutable collections, ranges, formatters, compression codecs
  FX/               the twenty-two FX frameworks
  NSE/              application kit, controllers, data views, text, appearance
  SynCloudOS/       runtime, SynWare SDK (AppSDK), authorisation, documents, windows
  SynCloudOSReact/  React bindings and the browser host
  Themes/           the built-in Atmo.scostheme bundle
  Webspring/        the shell and Board launcher
  FrameworkTests/   browser test fixtures
docs/framework/     the framework guides
examples/           example custom text-system application (TextSystem.app)
scripts/            SDK build, SynWare scaffolding/validation, Developer MCP, quality checks
tests/              unit, runtime, integration, packaging, performance, and browser tests
```

## Public beta status

You can build and evaluate real applications on the beta. Public APIs may still change before 1.0, and the release notes list every breaking change. We test device features (GPU effects, Web Bluetooth, Web NFC, haptics, motion sensors and MIDI hardware) with capability queries, fakes and browser harnesses, so a physical device or a less common browser engine may still turn up an edge case. When it does, we'd love a bug report or a focused pull request on GitHub.

## Licensing

SynCloudOS uses two licences split along the SynWare SDK boundary:

| Part | Where | Licence |
| --- | --- | --- |
| SynCloudOS framework | Everything in this repository unless stated otherwise | [GNU Affero General Public License v3.0 or later](LICENSE) |
| SynWare SDK | `src/SynCloudOS/AppSDK/` (app authoring interfaces and adapters) | [Apache License 2.0](src/SynCloudOS/AppSDK/LICENSE) |

Authored source carries the licence notice for its boundary, while vendored and generated helpers keep their original notices. Third-party licences ship in `licenses/` inside the built package and are listed in [THIRD_PARTY.md](THIRD_PARTY.md), with artwork ownership recorded in [ARTWORK.md](ARTWORK.md) and boundary details in [NOTICE](NOTICE). Because the distributable combines the framework and AppSDK, its package licence is `AGPL-3.0-or-later AND Apache-2.0`; importing an SDK entry does not change the licence of the framework implementation behind it.

## Influences

SynCloudOS takes its responder chain, command dispatch, controllers and document lifecycle from AppKit and Cocoa, its ambition from Cappuccino, and its launcher from the iOS Springboard.

## About

SynCloudOS is created and maintained by Syndromatic Ltd, led by Kavish Krishnakumar (Founder) and Polkrit Panluek (Co-founder). Syndromatic builds tactile, high-aesthetic digital and physical systems that bring joy and dignity to software.

Copyright © 2026 Syndromatic Ltd. Designed by Kavish Krishnakumar in Manchester.
