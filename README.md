# SynCloudOS

SynCloudOS is a TypeScript and React 19 application framework shaped after AppKit and NeXTSTEP. It gives a browser application the platform layer you expect on a desktop: a formal runtime lifecycle, a responder chain with typed command dispatch, per-document undo and conflict states, window ordering and restoration, an application kit of controls and controllers, twenty-two FX frameworks, and an application bundle format.

> [!NOTE]
> SynCloudOS 1.0 Public Beta (`v1.0.0-beta.2`, unpublished development candidate). The architecture and public entry points are in place and covered by tests, though the API may still change before 1.0. Please [open an issue](https://github.com/Syndromatic-Ltd/SynCloudOS/issues) if you hit a problem.

## Why it exists

Browser frameworks handle DOM rendering well, then leave application structure to ad-hoc code. Keyboard shortcuts scatter across `useEffect` listeners without a responder chain, menus and toolbars drift out of sync with what the active view can actually perform, undo gets rebuilt per feature, virtualised lists know nothing about selection or edits, and browser device APIs arrive with separate imperative lifetimes.

NeXTSTEP and AppKit solved those problems at the platform layer through responder chains, typed commands, document controllers, and shared undo managers. SynCloudOS brings that architecture to TypeScript and React so your application code declares intent, state, and structure while the host enforces policy and manages lifetimes.

## Getting SynCloudOS

Use a patched Node.js release (`22.23.4+`, `24.22.1+`, or `26.12.1+` on its release line) and npm; CI runs Node.js `24.22.1`. The framework pins TypeScript `6.0.3` because its tooling uses the JavaScript compiler API, and expects React 19 (`^19.1.1`) as a peer dependency.

The beta is distributed as release tarballs rather than through the npm registry. Install the published `v1.0.0-beta.1` archive into a React and TypeScript Vite project with:

```bash
npm install https://github.com/Syndromatic-Ltd/SynCloudOS/releases/download/v1.0.0-beta.1/syndromatic-syncloudos-1.0.0-beta.1.tgz
```

To build and test the unpublished `v1.0.0-beta.2` candidate from a checkout:

```bash
git clone https://github.com/Syndromatic-Ltd/SynCloudOS.git
cd SynCloudOS
npm ci --ignore-scripts
npm run sdk:build
```

That produces `.artifacts/synapp-sdk/archives/syndromatic-syncloudos-1.0.0-beta.2-<sha256>.tgz`, which you can install into a consumer project with `npm install /path/to/that.tgz`.

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
│  FX frameworks                22 TypeScript analogues of Apple Core  │
│                               and system frameworks                  │
├──────────────────────────────────────────────────────────────────────┤
│  SynCloudOS runtime           statechart, commands, responders,      │
│                               undo, documents, windows, authorisation│
├──────────────────────────────────────────────────────────────────────┤
│  Foundation                   bytes, ranges, collections, formatters │
└──────────────────────────────────────────────────────────────────────┘
```

[Foundation](docs/framework/foundation.md) provides immutable data, ranges, collections, predicates, sort descriptors, formatters, and user defaults with no React or DOM dependency so it runs in web workers as well as UI threads.

[The runtime](docs/framework/runtime.md) is created per host via `createSynCloudOS`, which reads no ambient globals so multiple runtimes can coexist on one page. An explicit statechart coordinates boot, the shell, and each application's lifecycle, while the responder chain, typed command validation, per-document undo, autosave, and window restoration handle user intent and state. Configuration profiles govern application access, `SCAuthorization` checks named administrative rights, and a central privacy store records per-application device consent; these are cooperative browser-page checks, so remote servers still enforce their own access rules. See [authorisation](docs/framework/authorization.md) and [privacy](docs/framework/privacy.md).

[The FX frameworks](docs/framework/fx/README.md) implement twenty-two TypeScript libraries shaped after Apple frameworks (`AnimationFX`, `GraphicsFX`, `ImageFX`, `TextFX`, `AudioFX`, `HapticsFX`, `MotionFX`, `MediaFX`, `VideoFX`, `MIDIFX`, `BluetoothFX`, `NFCFX`, `SpeechFX`, `ContactsFX`, `PassFX`, `XRFX`, `LocationFX`, `LuminaFX`, `CompressionFX`, `NetworkFX`, `CryptoFX`, and `DispatchFX`). Value types and pure computations import directly and run anywhere, while device, sensor, and surface capabilities come from the mounted session and release automatically when the application closes.

[NSE](docs/framework/nse-controls.md) plays the role of AppKit (`NSEButton` for `NSButton`, `NSEViewController` for `NSViewController`, `NSEArrayController` for `NSArrayController`). Controls implement behaviour, focus, keyboard navigation, and accessibility while reading their appearance from a theme, with [Atmo](docs/framework/appearance.md) providing light and dark CSS and SVG materials out of the box. See [controllers](docs/framework/controllers.md) and [data views](docs/framework/data-views.md).

[Webspring](docs/framework/webspring.md) provides the optional desktop and mobile shell: the paged Board launcher, application stage, quick switcher, notifications, preferences, and sign-in gate. Projects without a shell mount a single application directly through `@syndromatic/syncloudos/browser`.

[SynWare bundles](docs/framework/synware-sdk.md) package an application in a `.app` folder with a validated `Contents/Info.ts` manifest. Mounted applications never touch the runtime or its registries directly because `SCOS` inside an app folder (and `useSCOS()` in shared components) exposes narrow capability clients, while hooks such as `useCommands`, `useDocument`, `useAppearance`, and `useService` subscribe to reactive snapshots and return explicit denial values when a capability is unavailable.

## Package entries

Everything ships in `@syndromatic/syncloudos` with explicit subpath entries so deep imports are rejected:

- `@syndromatic/syncloudos`: `SCOS`, `useSCOS`, application and controller classes, decorators, reactive hooks, and `define*` helpers (`defineWebspring`, `definePreferencePane`, `defineWidget`, `defineIntegration`)
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

`npm test` runs on Vitest 5.1 in two sequential groups: CPU-heavy source scanners, counterpart checks, and timing budgets run first with bounded parallelism, and the remaining unit, NSE, integration, and decoupling tests run afterwards. Tests that install the packed `.tgz` archive into a temporary consumer run separately with `npm run test:packaging` after `npm run sdk:build` because they read and validate the built package output. See [tests/README.md](tests/README.md) and `.github/workflows/framework-boundaries.yml` for the full CI order.

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

The beta is suitable for building and evaluating applications, though public APIs may still change before 1.0 (breaking changes are documented in release notes). Device-facing capabilities such as GPU effects, Web Bluetooth, Web NFC, haptics, motion sensors, and MIDI hardware are verified through capability queries, fakes, and browser test harnesses where supported, so physical devices and different browser engines can still surface edge cases. Bug reports and focused pull requests are welcome on GitHub.

## Licensing

SynCloudOS uses two licences split along the SynWare SDK boundary:

| Part | Where | Licence |
| --- | --- | --- |
| SynCloudOS framework | Everything in this repository unless stated otherwise | [GNU Affero General Public License v3.0 or later](LICENSE) |
| SynWare SDK | `src/SynCloudOS/AppSDK/` (app authoring interfaces and adapters) | [Apache License 2.0](src/SynCloudOS/AppSDK/LICENSE) |

Authored source carries the licence notice for its boundary, while vendored and generated helpers keep their original notices. Third-party licences ship in `licenses/` inside the built package and are listed in [THIRD_PARTY.md](THIRD_PARTY.md), with artwork ownership recorded in [ARTWORK.md](ARTWORK.md) and boundary details in [NOTICE](NOTICE). Because the distributable combines the framework and AppSDK, its package licence is `AGPL-3.0-or-later AND Apache-2.0`; importing an SDK entry does not change the licence of the framework implementation behind it.

## Influences

SynCloudOS draws on NeXTSTEP and AppKit for its responder chain, command dispatch, controllers and document lifecycle, and on iOS Springboard for its launcher. The framework is implemented in TypeScript.

## About

SynCloudOS is created and maintained by Syndromatic Ltd, led by Kavish Krishnakumar (Founder) and Polkrit Panluek (Co-founder). Syndromatic builds tactile, high-aesthetic digital and physical systems that bring joy and dignity to software.

Copyright © 2026 Syndromatic Ltd. Designed by Kavish Krishnakumar in Manchester.
