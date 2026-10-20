# Getting started

SynCloudOS applications are folders. A project with `Hello.app/Contents/index.tsx` has a Hello application; no application list or handwritten composition is needed.

## Install

Use Node.js 22.12 or later, npm, TypeScript and React 19. Create a Vite React TypeScript project:

```bash
npm create vite@latest my-site -- --template react-ts
cd my-site
npm install https://github.com/Syndromatic-Ltd/SynCloudOS/releases/download/v1.0.0-beta.1/syndromatic-syncloudos-1.0.0-beta.1.tgz
```

The public beta is distributed as a release archive, not an npm registry release. From a framework checkout, `npm ci --ignore-scripts && npm run sdk:build` produces the corresponding archive in `.artifacts/synapp-sdk/archives/`. Install that archive when working against a local framework build. The Vite template supplies React, ReactDOM, TypeScript, their types, Vite and its React plugin. Keep a `version` in your project's `package.json`: it supplies each application's version.

If npm reports a blocked esbuild install script, inspect your local npm policy. It is not an SDK error. Approve only trusted scripts if the platform binary is missing; npm 12 provides `npm approve-scripts esbuild`.

## Enable folder discovery

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { synCloudOS } from "@syndromatic/syncloudos/vite";

export default defineConfig({ plugins: [react(), synCloudOS()] });
```

The plugin discovers applications, preference panes, widgets and integrations, supplies standard decorators and application hot reload, and injects the project composition into `mountSynCloudOS`. There is no virtual-module import to maintain in your bootstrap. See [Project structure](project-structure.md) for directory options and build selection.

## Add an application

Create `src/SynWare/Hello.app/Contents/index.tsx`:

```tsx
import { SCOS } from "@syndromatic/syncloudos";
import { NSEStackItem, NSEStackView } from "@syndromatic/syncloudos/nse";

export default function Hello() {
  return <NSEStackView aria-label="Hello" orientation="vertical" spacing={12}>
    <NSEStackItem id="greeting" visibilityPriority={100}>
      <p>Hello from {SCOS.app.title}.</p>
    </NSEStackItem>
  </NSEStackView>;
}
```

Its ID is `hello`, title is `Hello`, schema version is `1` and version comes from the project package. Add optional `Contents/Info.ts` for access policy and other overrides:

```ts
import type { SynWareManifestOverrides } from "@syndromatic/syncloudos/sdk";

export default {
  runtime: { policy: { public: true } },
  routes: [{ path: "/hello", primary: true }],
  webspring: { visible: true },
} satisfies SynWareManifestOverrides;
```

`public: true` deliberately admits anonymous launching. Omitted policy does not make an application public. Keep private applications private and configure authentication deliberately. Existing application IDs are persistence keys: preserve a non-derived ID explicitly when moving an existing app to this layout.

Put `AppIcon.svg` (preferred) or `AppIcon.png` in `Contents/Resources/` for its icon. Put translations in `Contents/Resources/Localised/<locale>.locale/*.strings`; all are discovered, with no `localeResources` manifest field.

## Mount one application

For a site without a launcher, use `synCloudOS({ webspringEntry: false })` and create `src/main.tsx`:

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/browser/styles.css";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";

const element = document.getElementById("root");
if (!element) throw new Error("The page needs a #root element.");
const host = await mountSynCloudOS({
  element,
  application: { id: "hello" },
  authentication: "disabled",
});
import.meta.hot?.dispose(() => host.dispose("hot reload"));
```

This mounts the application's real session without Webspring or a top bar. The default `application.frame: "fullscreen"` fills the page; `"declared"` honours its manifest presentation. This is not the browser's native Fullscreen API. Secondary applications must use `windowedView`, `systemSheet` or `backgroundService`, not `appView`. The site root opens the primary application's entry route; declared nested routes remain available.

An authenticated fullscreen primary must also declare `applicationMenu: { trigger: "content" }` and render an anchored `useApplicationMenuTrigger()` button. Otherwise its users cannot reach Preferences, Account, Sign In or Log Out. The [application menu guide](commands-responders-undo.md) and [authentication guide](authentication.md) cover these requirements.

## Add a Webspring launcher instead

Create `src/Webspring/Contents/index.tsx`:

```tsx
import { defineWebspring } from "@syndromatic/syncloudos";
import { WebspringBoardView } from "@syndromatic/syncloudos/webspring";

export default defineWebspring({
  manifest: {
    schemaVersion: 1, id: "com.example.site", version: "0.1.0", title: "My Site",
    webspringShell: {
      views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
      defaults: { desktop: "board", tablet: "board", mobile: "board" },
      homeRoute: "/", branding: { name: { key: "site.name", fallback: "My Site" } },
    },
  },
  components: { board: WebspringBoardView },
});
```

Use the default `synCloudOS()` options and mount with `{ element, authentication: "disabled" }`, without `application`. The discovered shell, applications, panes, widgets and integrations are supplied automatically. Shell and application-only modes are mutually exclusive. Shell manifests remain complete declarations; only application `Info.ts` files use folder-derived defaults.

## Use the platform

Inside an application folder, `SCOS` is bound to that application's manifest ID, including after `await` and in timer callbacks:

```ts
import { SCOS } from "@syndromatic/syncloudos";

await SCOS.open("hello");
SCOS.scheduler.setTimeout(() => SCOS.close(), 2000);
```

Shared React components outside an application folder use `useSCOS()`. Reactive rendering uses `useStrings()`, `useAppearance()` and the other snapshot hooks; `SCOS` is the command-oriented facade. Do not use an unbound module-level facade from shared code. FX retain their focused imports such as `@syndromatic/syncloudos/fx/animation`.

## Hosts without the plugin

Importing `@syndromatic/syncloudos/browser` does not require a virtual module. Pass `composition` explicitly when embedding the framework without the discovery plugin. A composition contains `bundles`, `preferences`, `widgets`, `contributions`, `shell` (or `null`) and `shellResources`. Each bundle contains its complete manifest, module path and lazy module loader. Its module default-exports the application component or `NSEApplication` subclass. The plugin builds exactly this shape for conventional projects.

Externally supplied bundles retain the existing trusted-source allowlist boundary. In-project discovered applications receive their declared permissions; no first-party trusted-source table is needed.

## Check and measure

The matching [Developer MCP companion](developer-mcp.md) provides `inspect_project`, `validate`, `lookup_sdk` and folder templates against the installed SDK. The framework checkout also provides `scripts/synware/create-synware.mjs` and `validate-synware.mjs`.

Measure a production Vite build and a cold browser load separately. The installed SDK archive contains workers, artwork, translations and every framework; its installed size is not the initial network transfer. PDF, video, image and audio workers may be emitted without being requested at startup. Changing Vite's chunk warning threshold does not reduce downloads.

Next: [Project structure](project-structure.md), [Applications](applications.md), [Webspring](webspring.md), [Errors and outcomes](errors.md), and the [package reference](overview.md#the-package).
