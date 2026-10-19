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

The `react-ts` template supplies the rest of the toolchain. If you create the project another way, your `package.json` needs at least this set alongside the SynCloudOS archive:

| Package | Kind | Supplied by the `react-ts` template |
| --- | --- | --- |
| `react`, `react-dom` | dependencies (the package's React peer dependency) | Yes |
| `vite` | dev dependency | Yes |
| `typescript` | dev dependency | Yes |
| `@types/react`, `@types/react-dom` | dev dependencies | Yes |
| `@vitejs/plugin-react` | dev dependency, optional (Fast Refresh and the React transform) | Yes |

The SynCloudOS SDK does not depend on `@vitejs/plugin-react`; it comes from the template. Without it, drop the `react()` line from the Vite config below, and Vite's built-in esbuild compiles TSX but there is no Fast Refresh.

SynCloudOS ships as one package, `@syndromatic/syncloudos`, with focused subpath entries such as `/sdk`, `/nse`, `/webspring` and `/fx/animation`. Every import in your project comes from one of those entries. The [package reference](overview.md#the-package) lists them all.

For AI coding agents, install the matching [Developer MCP companion](developer-mcp.md). It reads this installed SDK's declarations and bundled documentation, validates your project and creates SynWare bundles without overwriting existing files.

Read [Errors and outcomes](errors.md) for lifecycle diagnostics, stable codes and the source maps included in the SDK.

### Restricted npm install policies

Some npm configurations restrict dependency install scripts. A restricted policy can print a warning such as `1 package had install scripts blocked ... esbuild ... (postinstall: node install.js)`. This comes from your environment's npm policy and is not an SDK failure. Vite's dependency esbuild ships its platform binary as a separate package, and builds still work when that binary is installed; only esbuild's own postinstall verification and optimisation step is skipped. If a later build fails to start esbuild, approve the script for that package. With npm 12, `npm approve-scripts esbuild` records the approval (`npm approve-scripts --allow-scripts-pending` lists what is waiting). Other npm versions and package managers use different commands, so check your tool's documentation. Never loosen the policy for packages you do not trust.

## Add the Vite plugin

The plugin finds your SynWare bundles and your shell, then exposes them as a virtual module.

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { synCloudOS } from "@syndromatic/syncloudos/vite";

export default defineConfig({ plugins: [react(), synCloudOS()] });
```

By default the plugin looks for bundles in `src/SynWare/*.app` and for the shell in `src/Webspring/Contents/index.tsx`. Pass `synCloudOS({ appsDirectory, webspringEntry })` to choose other locations, or `webspringEntry: false` to build an application-only composition without a shell.

Add a declaration file so TypeScript knows the shape of the virtual module. It is `src/syncloudos-composition.d.ts` here; any file TypeScript includes works:

```ts
declare module "virtual:syncloudos/composition" {
  import type { MountSynCloudOSOptions } from "@syndromatic/syncloudos/browser";
  export const bundles: NonNullable<MountSynCloudOSOptions["bundles"]>;
  export const shell: NonNullable<MountSynCloudOSOptions["shell"]>;
  export const shellResources: MountSynCloudOSOptions["shellResources"];
}
```

This declaration types `shell` as the Webspring definition, so `mountSynCloudOS({ shell, shellResources, ... })` typechecks under strict TypeScript without a guard. It describes the default shell composition. With `webspringEntry: false`, or a shell entry with no default export, the generated module exports `shell` as `null`; in that case mount with `application: { id }` instead and do not import `shell` (see [Fullscreen application without a shell](#fullscreen-application-without-a-shell)).

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

For a site built around one application, configure Vite with
`synCloudOS({ webspringEntry: false })` and select the primary application by ID:

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

This mode mounts the real SynWare session directly. It does not construct
Webspring, a launcher or the Webspring top bar. It uses the registered app's
route and lifecycle, and the same scoped SDK clients as a shell-hosted
application. Filling the browser viewport does not enter the browser's native
Fullscreen API, which still requires a user gesture.

`application.frame` chooses how the primary application presents:

- `"fullscreen"` (the default) fills the page with an app-view surface,
  whatever presentation and frame the bundle declares.
- `"declared"` keeps the bundle's own manifest. An `appView` bundle still
  fills the page; a `windowedView` or `systemSheet` bundle presents in its
  window, with the frame it declares.

The site root `/` opens the primary application's entry route without
redirecting the address bar. Every bundle's entry route must be non-root (for
example `/hello`); `/` is reserved for that alias. Declared nested application
routes remain available.

Other registered bundles, including contributions, are secondary applications.
The primary opens them like any route, for example with
`app.navigation.openRoute("/inspector")`, and they present in windows over the
primary. Secondary bundles must declare `windowedView`, `systemSheet` or
`backgroundService`; only the primary fills the page, so mounting rejects a
secondary `appView` bundle. While a secondary application is active the primary
stays visible behind its windows but inert; the primary becomes active again
when the secondary's last window closes or the secondary quits.

When the primary application quits, its session is released and the page shows
the app's icon and name with a **Reopen** button. The host never relaunches on
its own; Reopen starts a new session in the same runtime. Suspension retains the
session with its surface hidden and inert until the runtime activates it.
Application preferences persist across host disposal and remount, scoped to the
browser origin and the application's ID.

`authentication` accepts the same values as the Webspring host (a policy string or a `{ policy, service }` object; see [Authentication](authentication.md#choose-a-policy)) and presents the same system login window:

- `"disabled"` (the default) has no session. Preferences offer no account and
  the system never offers Log Out.
- `"optional"` runs the application signed out. Preferences gain an **Account**
  pane that signs in through the login window, which can be cancelled, and logs
  out. The application keeps its session across sign-in and cancel.
- `"required"` presents the login window before the primary application
  launches, and again after Log Out.

The shorthand strings `"optional"` and `"required"` apply the policy but construct no authentication service, so nobody can complete a sign-in. For a working sign-in, pass `{ policy: "optional" | "required", service }` with a service from `createHttpAuthentication` and the backend described in [Authentication](authentication.md#prerequisites).

With `"disabled"` or `"optional"` the primary bundle must be public
(`runtime.policy.public`), because it launches before anyone signs in.
`shell`, `shellResources` and `contentSources` cannot accompany `application`.

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

// `shell` is the Webspring definition from the default shell entry; no guard is needed.

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
