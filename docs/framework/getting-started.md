# Getting started

SynCloudOS applications are folders. A project with `Hello.app/Contents/index.tsx` and `Contents/Info.ts` has a Hello application; no application list or handwritten composition is needed.

## Install

Use a patched Node.js release (22.23.4+, 24.22.1+, or 26.12.1+ on its respective release line), npm, TypeScript and React 19. Create a Vite React TypeScript project:

```bash
npm create vite@latest my-site -- --template react-ts
cd my-site
npm install https://github.com/Syndromatic-Ltd/SynCloudOS/releases/download/v1.0.0-beta.1/syndromatic-syncloudos-1.0.0-beta.1.tgz
```

The public beta is distributed as a release archive, not an npm registry release. The link above is the published beta.1 archive; this checkout builds the unpublished `1.0.0-beta.2` candidate. From a framework checkout, `npm ci --ignore-scripts && npm run sdk:build` produces that candidate in `.artifacts/synapp-sdk/archives/`. Install the local archive when adopting the candidate. The Vite template supplies React, ReactDOM, TypeScript, their types, Vite and its React plugin. Each application declares its own version in `Info.ts`; the project package version is not a fallback.

The current beta.2 candidate uses TypeScript 6.0.3. After adopting its local archive, pin the consumer compiler with `npm install --save-dev --save-exact typescript@6.0.3`. Keep compiler ambient types explicit for each environment and preserve standard decorators; no native TypeScript 7 API is required for the current authoring model.

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

Create `src/SynWare/Hello.app/Contents/index.tsx`. An application is an `NSEApplication` subclass; its view controller owns the state, and NSE controls bind to it:

```tsx
import { NSEApplication, NSEViewController, SCOS, action, actionRef, bind, observable, type NSEBinding } from "@syndromatic/syncloudos";
import { NSEButton, NSETextField } from "@syndromatic/syncloudos/nse/controls";

export class HelloViewController extends NSEViewController {
  @observable accessor name = "";
  readonly nameBinding: NSEBinding<string> = bind<HelloViewController, "name">(this, "name");
  readonly clearAction = actionRef(HelloViewController, "clear");
  @action clear() { this.name = ""; return this.name; }

  override renderView() {
    return <section aria-label="Hello">
      <NSETextField aria-label="Name" binding={this.nameBinding} />
      <p>Hello{this.name ? `, ${this.name}` : ""}, from {SCOS.app.displayName}.</p>
      <NSEButton action={this.clearAction} title="Clear" />
    </section>;
  }
}

export default class Hello extends NSEApplication {
  static override mainViewController = HelloViewController;
}
```

The controls take Atmo's appearance in light and dark without any stylesheet of your own; the host entry imports the NSE styles once (see below). `create-synware Hello.app` and the Developer MCP `scaffold` tool generate this shape, and the [authoring contract](authoring-contract.md) lists which API to use for each job: controls, documents, managed tasks, display links for WebGL engines and `NSEGraphicsView` for plots. A function component is still accepted as an application for very small apps, but it gives up the controller's bindings, actions, undo and managed lifetimes. See [Class authoring](cocoa-authoring.md).

Create the required `Contents/Info.ts` beside the entry point. Identity and version are explicit, as in an Info.plist; `schemaVersion` defaults to `1`:

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

`public: true` deliberately admits anonymous launching. Omitted policy does not make an application public. Keep private applications private and configure authentication deliberately. Bundle identifiers require at least two dots and letters (either case), digits or hyphens between them. Their case is preserved in public metadata, while lookups and storage keys are case-insensitive.

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
  application: { bundleIdentifier: "com.example.hello" },
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
    schemaVersion: 1, bundleIdentifier: "com.example.site", version: "0.1.0", displayName: "My Site",
    webspringShell: {
      views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
      defaults: { desktop: "board", tablet: "board", mobile: "board" },
      homeRoute: "/", branding: { name: { key: "site.name", fallback: "My Site" } },
    },
  },
  components: { board: WebspringBoardView },
});
```

Use the default `synCloudOS()` options and mount with `{ element, authentication: "disabled" }`, without `application`. The discovered shell, applications, panes, widgets and integrations are supplied automatically. Shell and application-only modes are mutually exclusive. Shell and application manifests both require explicit bundle identity, display name and version.

## Use the platform

Inside an application folder, `SCOS` is bound to that application's bundle identifier, including after `await` and in timer callbacks:

```ts
import { SCOS } from "@syndromatic/syncloudos";

await SCOS.open("com.example.hello"); // A route such as "/hello" works too.
SCOS.scheduler.setTimeout(() => SCOS.close(), 2000);
```

Shared React components outside an application folder use `useSCOS()`. Reactive rendering uses `useStrings()`, `useAppearance()` and the other snapshot hooks; `SCOS` is the command-oriented facade. Do not use an unbound module-level facade from shared code. FX retain their focused imports such as `@syndromatic/syncloudos/fx/animation`.

## Hosts without the plugin

Importing `@syndromatic/syncloudos/browser` does not require a virtual module. Pass `composition` explicitly when embedding the framework without the discovery plugin. A composition contains `bundles`, `preferences`, `widgets`, `contributions`, `shell` (or `null`) and `shellResources`. Each bundle contains its complete manifest, module path and lazy module loader. Its module default-exports the application component or `NSEApplication` subclass. The plugin builds exactly this shape for conventional projects.

Externally supplied bundles retain the existing trusted-source allowlist boundary. In-project discovered applications receive their declared permissions; no first-party trusted-source table is needed.

### Updating an existing application

Replace manifest `id` and `runtime.bundleId` with the single `bundleIdentifier`; replace manifest `title` with `displayName` and `SynWareManifestOverrides` with `SynWareInfo`. Add an explicit app `version`, and update public app metadata and `application: { bundleIdentifier }` selectors. Window titles and unrelated entity IDs are unchanged. Old saved app data and Webspring layouts are reset, not migrated; no aliases are kept. The [migration table](synware-manifest.md#migration-from-the-previous-identity-fields) lists every identity change.


## Check and measure

The matching [Developer MCP companion](developer-mcp.md) provides `inspect_project`, `validate`, `lookup_sdk` and folder templates against the installed SDK. The framework checkout also provides `scripts/synware/create-synware.mjs` and `validate-synware.mjs`.

Measure a production Vite build and a cold browser load separately. The installed SDK archive contains workers, artwork, translations and every framework; its installed size is not the initial network transfer. PDF, video, image and audio workers may be emitted without being requested at startup. Changing Vite's chunk warning threshold does not reduce downloads.

Next: [Project structure](project-structure.md), [Applications](applications.md), [Webspring](webspring.md), [Errors and outcomes](errors.md), and the [package reference](overview.md#the-package).
