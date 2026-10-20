# SynCloudOS

**Cocoa for the web.** SynCloudOS is a batteries-included application framework for TypeScript and React 19. It gives the browser what a desktop platform gives a native application: a runtime with a formal lifecycle, a responder chain and typed commands, undo, documents, a windowing system, a kit of controls and controllers, twelve media frameworks and an application bundle format.

> [!NOTE]
> **SynCloudOS 1.0 Public Beta** (`v1.0.0-beta.1`). The architecture and the public entry points are in place and covered by tests, but the API may still change before 1.0. Expect rough edges, and please [open an issue](https://github.com/Syndromatic-Ltd/SynCloudOS/issues) when you find one.

## Why it exists

Websites have excellent frameworks. Applications have raw platform primitives. Build a design tool, a calendar, a code editor or an operations console and the framework hands you back to the DOM, which has no responder chain, so keyboard handling scatters across `useEffect` listeners. It has no command system, so menus and shortcuts drift apart from what the interface can actually do. It has no undo layer, so every team writes its own. Rendering fifty thousand rows means reaching for a virtualiser that knows nothing about your selection, your sort order or your edits. Audio, haptics, motion and image processing arrive as separate imperative browser APIs with no shared lifetime.

NeXTSTEP and AppKit answered these problems decades ago with responder chains, typed command dispatch, document controllers and undo at the platform layer. SynCloudOS supplies that layer for the web, in a form that feels natural to React developers.

## What the beta provides

- **One command system.** Menus, key bindings and toolbars dispatch the same typed commands through a responder chain. Commands carry payload schemas, scopes and validation, and a menu validates its whole tree in one batched call.
- **Undo and documents.** Every document keeps its own undo history and restores selection after an undo. Documents autosave against known versions, recover after a crash and surface conflicts as states you resolve, never silent overwrites.
- **A windowing system.** Windows have roles, ordering, key and main state and persisted restoration. They adapt to phones and tablets, and modal blocking works at the framework level.
- **NSE, the application kit.** Controls, menus, toolbars, controllers and virtualised data views with keyboard, touch and assistive-technology support built in.
- **Twelve FX frameworks.** Animation, graphics and PDF, image filtering, text shaping, audio, haptics, motion, media time, video, MIDI, location and on-device search, each a TypeScript analogue of an Apple Core framework with explicit lifetimes and capability queries.
- **Atmo.** A tactile material language of glossy buttons, brushed surfaces and soft depth, drawn as vector CSS and SVG in light and dark.
- **Webspring.** A shell with a Board launcher in the spirit of iOS Springboard, an application stage, an app switcher, notifications and a sign-in gate.
- **SynWare bundles.** Applications are `.app` bundles with a versioned, validated manifest. Each runs in a scoped session and receives only the capabilities its manifest declares.

The framework's authored APIs use TypeScript and build under strict type checking.

## The layers

```text
┌──────────────────────────────────────────────────────────────────────┐
│  SynWare applications         .app bundles built on the SynWare SDK  │
├──────────────────────────────────────────────────────────────────────┤
│  Webspring shell              Board launcher, stage, quick switch    │
├──────────────────────────────────────────────────────────────────────┤
│  NSE application kit          controls, controllers, data views,     │
│                               text, windows, menus, Atmo theme       │
├──────────────────────────────────────────────────────────────────────┤
│  FX frameworks                animation, graphics, image, text,      │
│                               audio, haptics, motion, media, video,  │
│                               MIDI, location, search                 │
├──────────────────────────────────────────────────────────────────────┤
│  SynCloudOS runtime           statechart, commands, responders,      │
│                               undo, documents, windows, PolicyKit    │
└──────────────────────────────────────────────────────────────────────┘
```

- **The runtime.** `createSynCloudOS` builds a self-contained runtime with its own store, services and adapters. It reads no globals at construction, so several runtimes can share one page. An explicit statechart tracks boot, the shell and every application's lifecycle; PolicyKit evaluates every privileged action against role capabilities; and everything a service acquires is released on disposal. See [the runtime](docs/framework/runtime.md).
- **NSE.** NSE plays the role of AppKit: you write `NSEPushButton` where a Mac developer writes `NSButton`. Controls expose neutral behaviour and take their look from the theme. See [NSE controls](docs/framework/nse-controls.md), [controllers](docs/framework/controllers.md) and [data views](docs/framework/data-views.md).
- **FX.** Pure computation runs anywhere JavaScript runs; anything that touches a device comes from the mounted session, so the host enforces permissions and releases resources when the application closes. See the [FX guide](docs/framework/fx/README.md).
- **Webspring.** A project declares one validated shell definition and mounts it through the browser entry. See [Webspring](docs/framework/webspring.md).
- **SynWare.** A bundle's `Contents/Info.ts` manifest declares its routes, presentations, commands, document types, menus, window defaults and permissions. The [SynWare SDK](docs/framework/synware-sdk.md), imported from `@syndromatic/syncloudos/sdk`, is everything a bundle needs from the platform.

## Getting SynCloudOS

You need Node.js 22.12 or later and npm.

The beta is not published to the npm registry. Install the package archive attached to the [v1.0.0-beta.1 release](https://github.com/Syndromatic-Ltd/SynCloudOS/releases/tag/v1.0.0-beta.1):

```bash
npm install https://github.com/Syndromatic-Ltd/SynCloudOS/releases/download/v1.0.0-beta.1/syndromatic-syncloudos-1.0.0-beta.1.tgz
```

or build the same archive from source:

```bash
git clone https://github.com/Syndromatic-Ltd/SynCloudOS.git
cd SynCloudOS
npm ci --ignore-scripts
npm run sdk:build
# → .artifacts/synapp-sdk/archives/syndromatic-syncloudos-1.0.0-beta.1-<sha256>.tgz
```

and install it into your project with `npm install /path/to/that.tgz`. React 19 is a peer dependency.

## Your first application

Start a Vite project, install the archive as above, and add the plugin to `vite.config.ts`. It discovers your SynWare bundles and your shell:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { synCloudOS } from "@syndromatic/syncloudos/vite";

export default defineConfig({ plugins: [react(), synCloudOS()] });
```

A SynWare lives in `src/SynWare/Hello.app/Contents/`. Its manifest is `Info.ts`:

```ts
export default {
  schemaVersion: 1,
  id: "com.example.hello",
  version: "0.1.0",
  title: "Hello",
  routes: [{ path: "/hello", primary: true }],
  presentations: ["desktop", "tablet", "mobile"],
  runtime: { policy: { public: true } },
  webspring: { visible: true },
} as const;
```

and its component is `index.tsx`:

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import { SCOS } from "@syndromatic/syncloudos";
import { NSEStackItem, NSEStackView } from "@syndromatic/syncloudos/nse";

export default function Hello() {
  return (
    <NSEStackView aria-label="Hello" orientation="vertical" spacing={12}>
      <NSEStackItem id="greeting" visibilityPriority={100}>
        <p>Hello from {SCOS.app.id}.</p>
      </NSEStackItem>
    </NSEStackView>
  );
}

```

The [getting started guide](docs/framework/getting-started.md) adds the Webspring shell definition and the `main.tsx` that mounts everything, and finishes with a running Board launcher.

## Working with the session

A mounted SynWare receives narrow clients, never the runtime or its registries. Inside an app folder, `SCOS` is bound to that app even after `await` or in timers. Shared React components call `useSCOS()` to select the nearest app provider; reactive hooks subscribe to changing values:

| Area | Hooks |
| --- | --- |
| Commands, undo and focus | `useCommands`, `ResponderScope` |
| Documents and persistence | `useDocument`, `usePersistence` |
| Windows and chrome | `useWindow`, `useWindowChrome`, `useWorkArea` |
| Navigation | `useRouter`, `useRouteState`, `useRouteData` |
| Pasteboard and drag | `usePasteboard`, `useDrag`, `useShare` |
| Notifications and lifecycle | `useNotifications`, `useLifecycle`, `useEvents`, `useErrors` |
| Appearance and locale | `useAppearance`, `useColourPanel`, `useStrings`, `useMediaQuery` |
| Identity and services | `useIdentity`, `useService`, `useTrustedClient` |
| Media and devices | `useAnimations`, `useImages`, `useTextLayout`, `useAudio`, `useHaptics`, `useMotion`, `useMedia`, `useVideo`, `useMIDI`, `useLocation`, `useLumina` |
| Web content | `useWebContent` |

An absent or denied service returns `{ available: false, client: null, denial }` instead of throwing, so an application renders the matching state.

## Package entries

Everything ships as one package, `@syndromatic/syncloudos`, with explicit subpath entries. Deep imports are rejected.

| Entry | Contents |
| --- | --- |
| `sdk`, `sdk/testing` | The SynWare SDK and a deterministic test host |
| `sdk/animation-host` | Scheduler and surface types for custom AnimationFX render hosts |
| `nse`, `nse/controls`, `nse/text`, `nse/content`, `nse/appearance` | The application kit and its focused subsets |
| `nse/layout`, `nse/scroll`, `nse/page`, `nse/cover-flow`, `nse/system-ui` | Focused presentation entries |
| `nse/themes/atmo` | The Atmo appearance and its `styles.css` |
| `nse/styles.css` | Base NSE styles |
| `typography` | Managed fonts and type roles |
| `fx/animation`, `fx/graphics`, `fx/image`, `fx/text`, `fx/audio`, `fx/haptics`, `fx/motion`, `fx/media`, `fx/video`, `fx/video/webm`, `fx/midi`, `fx/location`, `fx/lumina` | The twelve FX frameworks |
| `webspring`, `browser`, `browser/styles.css`, `webspring/styles.css` | The shell, the browser host and their styles |
| `chronosphere`, `chronosphere/styles.css` | The version archive and its styles |
| `auth`, `server/auth` | Sign-in for the browser and the server |
| `vite` | The Vite plugin |

The [overview](docs/framework/overview.md#the-package) describes each entry.

## Documentation

Start with the [framework guide](docs/framework/README.md).

| Guide | Covers |
| --- | --- |
| [Getting started](docs/framework/getting-started.md) | A site with a launcher and an application |
| [Overview](docs/framework/overview.md) | Layers, conventions and package entries |
| [The runtime](docs/framework/runtime.md) | Mounting, ownership, policy and contributions |
| [SynWare SDK](docs/framework/synware-sdk.md) and [manifest](docs/framework/synware-manifest.md) | Building applications |
| [Commands, responders and undo](docs/framework/commands-responders-undo.md) | User intent and reversal |
| [Documents](docs/framework/documents.md) and [windows](docs/framework/windows.md) | Content and presentation |
| [NSE controls](docs/framework/nse-controls.md), [controllers](docs/framework/controllers.md) and [data views](docs/framework/data-views.md) | The application kit |
| [Text and editing](docs/framework/text-and-editing.md) and [drag and pasteboard](docs/framework/drag-and-pasteboard.md) | Text, fonts, transfer and drag |
| [Appearance and Atmo](docs/framework/appearance.md) | Theming, light and dark |
| [FX frameworks](docs/framework/fx/README.md) | The twelve media frameworks |
| [Webspring](docs/framework/webspring.md) | The shell and launcher |
| [Authentication](docs/framework/authentication.md) | Sign-in and roles |
| [Testing a SynWare](docs/framework/testing-synware.md) | Deterministic tests |
| [Developer MCP](docs/framework/developer-mcp.md) | Offline installed-SDK tools for AI coding agents |

## Developing the framework

```bash
npm ci --ignore-scripts
npm run typecheck                  # strict TypeScript across the tree
npm run boundaries:architecture    # layer and import boundaries
npm run sdk:build                  # build and pack the distributable SDK
npm run typecheck:contracts        # public compile-time contracts
npm run test:e2e                   # Playwright, Chromium, Firefox and WebKit
```

`.github/workflows/framework-boundaries.yml` runs the complete set, including the packed-consumer checks that install the built archive outside the repository.
Follow its test order, documented in [the test guide](tests/README.md), because the package tests rebuild shared output.

The retained scripts build and validate the distributable, scaffold and validate SynWare bundles, or run repository checks. The manifest-validator compiler is a development tool for schema changes; the runtime uses the committed validator. Atmo ships its finished CSS/SVG and needs no theme generator.

```text
src/
  SynCloudOS/       runtime, SynWare SDK (AppSDK), PolicyKit, documents, windows
  SynCloudOSReact/  React bindings and the browser host
  NSE/              application kit, controllers, data views, Atmo appearance
  FX/               the twelve FX frameworks
  Webspring/        the shell and the Board launcher
docs/framework/     the framework guides
examples/           an example custom text-system application
scripts/            SDK build, SynWare tooling and quality checks
tests/              unit, runtime, integration, performance and browser tests
```

## Public beta status

- The beta is suitable for building and evaluating applications. It is not yet recommended for production workloads that cannot tolerate API changes.
- Version numbers follow semantic versioning; breaking changes before 1.0 are listed in the release notes.
- Physical-device behaviour (GPU effects, haptics, motion sensors, MIDI hardware) is tested through capability queries and fakes; your hardware may still surface issues we have not seen.
- Bug reports and focused pull requests are welcome through GitHub.

## Licensing

SynCloudOS uses two licences, split along the SynWare SDK boundary.

| Part | Where | Licence |
| --- | --- | --- |
| SynCloudOS framework | everything in this repository unless stated otherwise | [GNU Affero General Public License v3.0 or later](LICENSE) |
| SynWare SDK | `src/SynCloudOS/AppSDK/` (app authoring interfaces and adapters) | [Apache License 2.0](src/SynCloudOS/AppSDK/LICENSE) |

Authored source carries the notice for its boundary; upstream and generated vendor source retain their own notices. Third-party components keep their own licences, which ship in the package's `licenses/` directory. See [NOTICE](NOTICE) for details.
The distributable combines the framework and AppSDK, so its package licence is `AGPL-3.0-or-later AND Apache-2.0`. Importing an SDK entry does not change the licence of the framework implementation it uses.

## Influences

SynCloudOS draws on NeXTSTEP and AppKit for its responder chain, command dispatch, controllers and document lifecycle, and on iOS Springboard for its launcher. The framework is implemented in TypeScript.

## About

SynCloudOS is created and maintained by **Syndromatic Ltd**, led by Kavish Krishnakumar (Founder) and Polkrit Panluek (Co-founder). Syndromatic builds tactile, high-aesthetic digital and physical systems that bring joy and dignity to software.

Copyright © 2026 Syndromatic Ltd. Designed by Kavish Krishnakumar in Manchester.
