# Getting started

This guide builds a small site with one application, then shows how to add the Webspring launcher. In SynCloudOS an application is a folder: a project with `Hello.app/Contents/index.tsx` and `Contents/Info.ts` has a Hello application, and you don't keep an application list or write a composition by hand.

## Install

You need a patched Node.js release (22.23.4 or later, 24.22.1 or later, or 26.12.1 or later on its release line), npm, TypeScript and React 19. Create a Vite React TypeScript project:

```bash
npm create vite@latest my-site -- --template react-ts
cd my-site
npm install @syndromatic/syncloudos@beta
```

`@syndromatic/syncloudos` ships on npm under the `beta` tag (and release tarballs are also attached to GitHub Releases). To test an unreleased framework checkout instead, run `npm ci --ignore-scripts && npm run sdk:build` in the framework repo and install the generated archive from `.artifacts/synapp-sdk/archives/`. The Vite template supplies React, ReactDOM, TypeScript, their types, Vite and its React plugin. Each application declares its own version in `Info.ts`; the framework never falls back to the project's package version.

SynCloudOS `1.0.0-beta.2` is built with TypeScript 6.0.3. Pin your compiler to match with `npm install --save-dev --save-exact typescript@6.0.3`. Keep ambient types explicit for each environment and keep standard decorators enabled. The authoring model needs no TypeScript 7 API.

If npm reports a blocked esbuild install script, check your local npm policy; the SDK isn't at fault. If the platform binary is missing, approve only scripts you trust. npm 12 provides `npm approve-scripts esbuild`.

## Enable folder discovery

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { synCloudOS } from "@syndromatic/syncloudos/vite";

export default defineConfig({ plugins: [react(), synCloudOS()] });
```

The plugin discovers applications, preference panes, widgets and integrations, supplies standard decorators and application hot reload, and hands the project composition to `mountSynCloudOS`. Your bootstrap has no virtual-module import to maintain. See [Project structure](project-structure.md) for directory options and build selection.

## Add an application

Create `src/SynWare/Hello.app/Contents/index.tsx`. An application is an `NSEApplication` subclass. Its view controller owns the state, and NSE controls bind to it:

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

The controls draw in Atmo, light and dark, without a stylesheet of your own, because the host entry imports the NSE styles once (see below). In a framework checkout, `npm run synware:create -- src/SynWare/Hello.app` generates this shape, and so does the Developer MCP `scaffold` tool. The [authoring contract](authoring-contract.md) lists which API to use for each job: controls, documents, managed tasks, display links for WebGL engines, and `NSEView.draw` for plots. A very small app can still be a function component, but it gives up the controller's bindings, actions, undo and managed lifetimes. See [Class authoring](cocoa-authoring.md).

Create the required `Contents/Info.ts` beside the entry point. It states the application's identity and version explicitly; `schemaVersion` defaults to `1`:

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

`public: true` lets anonymous visitors launch the application. Leaving the policy out does not make an application public, so a private application stays private until you configure authentication. A bundle identifier needs at least two dots, with letters (either case), digits or hyphens between them. Public metadata keeps its case; lookups and storage keys ignore it.

For the icon, put `AppIcon.svg` (preferred) or `AppIcon.png` in `Contents/Resources/`. Put translations in `Contents/Resources/Localised/<locale>.locale/*.strings`. The plugin discovers both, so the manifest has no `localeResources` field.

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

This mounts the application's real session without Webspring or a top bar. The default, `application.frame: "fullscreen"`, fills the host element (it does not call the browser's Fullscreen API); `"declared"` uses the presentation from the manifest. Secondary applications must use `window`, `systemSheet` or `backgroundService`, not `stage`. The site root opens the primary application's entry route, and its declared nested routes keep working.

An application can opt into an application menu with `NSEApplication.mainMenu`, `NSEToolbarItem.applicationMenu("gear")`, or both. The [authentication guide](authentication.md) explains the account actions.

## Add a Webspring launcher instead

Use the [Developer MCP](developer-mcp.md) `scaffold` tool with `kind: "webspring"`, or create the two files yourself. `src/Webspring/Contents/Info.ts` holds the site's identity:

```ts
import type { WSInfo } from "@syndromatic/syncloudos/webspring";

export default {
  bundleIdentifier: "com.example.my-site", version: "0.1.0", displayName: "My Site",
  homeRoute: "/", branding: { name: { key: "site.name", fallback: "My Site" } },
} as const satisfies WSInfo;
```

`src/Webspring/Contents/index.tsx` default-exports a `WSApplication` subclass:

```tsx
import { WSApplication } from "@syndromatic/syncloudos/webspring";

export default class MySite extends WSApplication {}
```

The site shows the Board (`WSBoardViewController`) unless your `WSApplication` subclass names another launcher.

Use the default `synCloudOS()` options and mount with `{ element, authentication: "disabled" }`, leaving out `application`. The plugin supplies the discovered shell, applications, panes, widgets and integrations. A host runs either the shell or a single application, never both. Shell and application manifests both need an explicit bundle identifier, display name and version.

## Use the platform

Inside an application folder, `SCOS` is bound to that application's bundle identifier, including after `await` and in timer callbacks:

```ts
import { SCOS } from "@syndromatic/syncloudos";

await SCOS.open("com.example.hello"); // A route such as "/hello" works too.
SCOS.scheduler.setTimeout(() => SCOS.close(), 2000);
```

Shared React components outside an application folder use `useSCOS()`. For reactive rendering, use `useStrings()`, `useAppearance()` and the other snapshot hooks; `SCOS` is for issuing commands. Don't use an unbound module-level facade from shared code. The FX frameworks keep their own imports, such as `@syndromatic/syncloudos/fx/animation`.

## Hosts without the plugin

Attributed FX constructors need the SynCloudOS plugin and a focused import from inside a discovered `.app` bundle. That holds for third-party and installed (PWA) builds too. A host without the plugin can still use pure FX types and families such as CryptoFX and CompressionFX, but attributed base constructors report that they need an application compiled with the plugin. Bindings carry application identity before launch; privileged work needs a live app session in the same SDK module graph. Separate copies of the SDK share no session registry, and several live runtimes for one app follow the SCOS session ambiguity rules.

Importing `@syndromatic/syncloudos/browser` does not need a virtual module. To embed the framework without the discovery plugin, pass `composition` yourself. A composition (`SynCloudOSProjectComposition`) contains `bundles`, `preferences`, `widgets`, `contributions`, `webspring` (the shell definition, or `null`) and `shellResources`. Each bundle carries its complete `manifest`, its `modulePath` and a lazy `loadModule()`, whose module default-exports the `NSEApplication` subclass or application component. The plugin builds this same shape for a conventional project.

Bundles supplied from outside the project still pass through the trusted-source allowlist. Applications discovered in the project receive their declared permissions without a first-party trusted-source table.

### Updating an existing application

Replace the manifest's `id` and `runtime.bundleId` with a single `bundleIdentifier`, the manifest `title` with `displayName`, and `SynWareManifestOverrides` with `SynWareInfo`. Add an explicit app `version`, and update public app metadata and `application: { bundleIdentifier }` selectors. Window titles and unrelated entity IDs don't change. Saved app data and Webspring layouts from the old identity are reset, not migrated, and the old names have no aliases. The [migration table](synware-manifest.md#migration-from-the-previous-identity-fields) lists every identity change.

## Check and measure

The matching [Developer MCP companion](developer-mcp.md) provides `inspect_project`, `validate`, `lookup_sdk` and folder templates for the installed SDK. In the framework checkout, `npm run synware:create` and `npm run synware:validate` run `scripts/synware/create-synware.mjs` and `validate-synware.mjs`.

Measure a production Vite build and a cold browser load separately. The installed SDK contains workers, artwork, translations and every framework, so its size on disk says little about the first network transfer. The build may emit PDF, video, image and audio workers that the page never requests at startup. Raising Vite's chunk warning threshold hides the warning but downloads the same bytes.

Next: [Project structure](project-structure.md), [Applications](applications.md), [Webspring](webspring.md), [Errors and outcomes](errors.md), and the [package reference](overview.md#the-package).
