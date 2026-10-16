# Getting started

This guide takes you from an empty folder to a running SynCloudOS site with its own launcher and one SynWare application.

## Prerequisites

- Node.js 22.12 or later and npm
- A familiarity with React 19 and TypeScript

## Create the project

Start a Vite project and install the framework package. The public beta is not published to the npm registry: install the archive attached to the GitHub release, or build the same archive from a checkout of the framework with `npm ci --ignore-scripts && npm run sdk:build` and install the `.tgz` it writes to `.artifacts/synapp-sdk/archives/`. React is a peer dependency of the package.

```bash
npm create vite@latest my-site -- --template react-ts
cd my-site
npm install https://github.com/Syndromatic-Ltd/SynCloudOS/releases/download/v1.0.0-beta.1/syndromatic-syncloudos-1.0.0-beta.1.tgz
```

SynCloudOS ships as one package, `@syndromatic/syncloudos`, with focused subpath entries such as `/sdk`, `/nse`, `/webspring` and `/fx/animation`. Every import in your project comes from one of those entries. The [package reference](overview.md#the-package) lists them all.

## Add the Vite plugin

The plugin finds your SynWare bundles and your shell, then exposes them as a virtual module.

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { synCloudOS } from "@syndromatic/syncloudos/vite";

export default defineConfig({ plugins: [react(), synCloudOS()] });
```

By default the plugin looks for bundles in `src/SynWare/*.app` and for the shell in `src/Webspring/Contents/index.tsx`. Pass `synCloudOS({ appsDirectory, webspringEntry })` to choose other locations, or `webspringEntry: false` to build an application-only composition without a shell.

Add a declaration file so TypeScript knows the shape of the virtual module:

```ts
declare module "virtual:syncloudos/composition" {
  import type { MountSynCloudOSOptions } from "@syndromatic/syncloudos/browser";
  export const bundles: NonNullable<MountSynCloudOSOptions["bundles"]>;
  export const shell: MountSynCloudOSOptions["shell"];
  export const shellResources: MountSynCloudOSOptions["shellResources"];
}
```

## Define the shell

The shell is the surface that launches your applications. Webspring provides the Board launcher, a paged grid of application icons in the spirit of iOS Springboard. Declare it in a manifest and hand it to `defineWebspring`.

`src/Webspring/Contents/Info.ts`:

```ts
export default {
  schemaVersion: 1,
  id: "com.example.site",
  version: "0.1.0",
  title: "My Site",
  webspringShell: {
    views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
    defaults: { desktop: "board", tablet: "board", mobile: "board" },
    homeRoute: "/",
    branding: { name: { key: "site.name", fallback: "My Site" } },
  },
} as const;
```

`src/Webspring/Contents/index.tsx`:

```tsx
import { defineWebspring, WebspringBoardView } from "@syndromatic/syncloudos/webspring";
import manifest from "./Info";

export default defineWebspring({
  manifest,
  components: { board: WebspringBoardView },
});
```

## Write a SynWare

A SynWare is an application bundle. Create `src/SynWare/Hello.app/Contents/` with a manifest and a component.

`Info.ts`:

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

`index.tsx`:

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import { createSynWare, useSynWare } from "@syndromatic/syncloudos/sdk";
import { NSEStackItem, NSEStackView } from "@syndromatic/syncloudos/nse";
import manifest from "./Info";

function Hello() {
  const app = useSynWare();
  return (
    <NSEStackView aria-label="Hello" orientation="vertical" spacing={12}>
      <NSEStackItem id="greeting" visibilityPriority={100}>
        <p>Hello from {app.appId}.</p>
      </NSEStackItem>
    </NSEStackView>
  );
}

export default createSynWare({ manifest, root: Hello });
```

From a checkout of the framework repository you can also scaffold a bundle with the SynWare tooling described in the [SynWare SDK guide](synware-sdk.md#tooling).

The example's `runtime.policy.public` allows anonymous launching. The host's
authentication option configures its sign-in flow; each application's manifest
declares its own access policy.

## Mount the runtime

### Fullscreen application without a shell

For a site that runs exactly one application, configure Vite with
`synCloudOS({ webspringEntry: false })` and select the registered app by ID:

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/browser/styles.css";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { bundles } from "virtual:syncloudos/composition";

const element = document.getElementById("root");
if (!element) throw new Error("The page needs a #root element.");
const host = await mountSynCloudOS({
  element,
  bundles,
  application: { id: "com.example.hello" },
});
import.meta.hot?.dispose(() => host.dispose("hot reload"));
```

This mode mounts the real SynWare session directly in a viewport-filling
application surface. It does not construct Webspring, a launcher, a top bar,
or a primary floating window. It uses the registered app's route and lifecycle,
and the same scoped SDK clients as a shell-hosted application. The host owns
the fullscreen app-view presentation even if the bundle declares a windowed
presentation. This fills the browser viewport; entering the browser's native
Fullscreen API still requires a user gesture.

The site root `/` opens the application's primary route without redirecting
the address bar. The bundle's entry route must be non-root (for example `/hello`);
`/` is reserved for the host alias. Declared nested application routes remain available. Closing
the app releases its session and leaves no launcher or automatic relaunch;
dispose and mount the host again to begin a fresh session. Suspension retains
the session with its surface hidden and inert until the runtime activates it.

Supply exactly one registered application, including contributions. `shell`,
`shellResources`, and `contentSources` cannot accompany `application`.
Authentication defaults to disabled in this mode; `optional` and `required`
are rejected because application hosting does not provide a sign-in surface.
Existing Webspring hosts retain their authentication and multi-app behavior.

### Webspring shell

`src/main.tsx` mounts SynCloudOS into a page element. Import the browser styles once so the shell and application stage have their layout.

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/browser/styles.css";
import "@syndromatic/syncloudos/webspring/styles.css";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { bundles, shell, shellResources } from "virtual:syncloudos/composition";

const element = document.getElementById("root");
if (!element) throw new Error("The page needs a #root element.");

const host = await mountSynCloudOS({
  element,
  bundles,
  shell,
  shellResources,
  authentication: "disabled",
});

// Release the runtime when the page tears down, for example during hot reload.
import.meta.hot?.dispose(() => host.dispose("hot reload"));
```

Run `npm run dev` and open the page. The Board launcher shows the Hello icon. Opening it presents your component in the application stage.

## Where to go next

| You want to | Read |
| --- | --- |
| Understand how the pieces fit together | [Overview](overview.md) |
| Build applications | [SynWare SDK](synware-sdk.md) and the [manifest reference](synware-manifest.md) |
| Use the controls | [NSE controls](nse-controls.md) |
| Add animation, graphics, audio or video | [FX frameworks](fx/README.md) |
| Configure the shell and sign-in | [Webspring](webspring.md) and [Authentication](authentication.md) |
