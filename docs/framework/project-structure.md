# Project structure

The Vite plugin treats a project's folders as configuration:

```text
src/
  SynWare/
    Notes.app/Contents/
      index.tsx
      Info.ts
      Resources/
        AppIcon.svg
        Localised/Base.locale/Localisable.strings
  Preferences/Billing.prefPane/index.tsx
  Widgets/Latest.widget/index.tsx
  Integrations/Journal.integration.ts
  Webspring/Contents/index.tsx
```

Applications require both `Contents/index.tsx` and `Contents/Info.ts`. Resources, other directory kinds and the shell are optional. Missing optional directories are fine. Each entry must have the correct default export; a missing or incorrect export reports the source folder and expected declaration. Discovery rejects symbolic links and case-colliding resources.

## Application manifests

`Info.ts` default-exports `SynWareInfo`: the app's Info.plist-style declaration, with explicit identity and version. The plugin, static validator and Developer MCP resolve the same manifest:

| Field | Rule |
| --- | --- |
| `bundleIdentifier` | Required reverse-DNS identity with at least two dots; letters in either case, digits and hyphens in each segment |
| `displayName` | Required public app name |
| `version` | Required app version; no package fallback |
| `schemaVersion` | Defaults to `1` |
| `webspring.icon` | Explicit value, else `Resources/AppIcon.svg`, then `AppIcon.png`, otherwise framework artwork |

Identity case is preserved in manifests and public displays. Keys and comparisons are case-insensitive, so case-only duplicates are errors. The folder name is the bundle name only. Scaffolding pre-fills the required identity fields; discovery does not invent them.

For example, `Diagnostics.app` keeps `packageName: "Diagnostics.app"` even if its `Info.ts`
declares `bundleIdentifier: "org.Example.READER"`. Discovery takes the package name and resource
root from the source folder, while identity lookups compare the declared identifier without case.

Every `Resources/Localised/<locale>.locale/*.strings` file is supplied to the locale service. `localeResources` is not a manifest field. Font resources and other artwork are also mapped by discovery.

```ts
import type { SynWareInfo } from "@syndromatic/syncloudos/sdk";
export default {
  bundleIdentifier: "com.example.Diagnostics",
  displayName: "Diagnostics",
  version: "1.0.0",
  webspring: { visible: true },
  permissions: ["diagnostics.view"],
  availability: "development",
} satisfies SynWareInfo;
```

Development-only applications are excluded from production builds. In-project apps are first-party and receive their requested permissions. External bundles keep the existing trusted-source allowlist path.

## Application modules

The default export is a React component or an `NSEApplication` subclass. Export optional `routes`, `migrations`, `windowChrome`, `rematerialiseOwnedDocument` and `createBackgroundHandler` beside it; the loader builds the captured definition from the complete derived manifest and these named exports. `createSynWare` is internal; `sdk/testing` retains it for test hosts without discovery.

Imports of `@syndromatic/syncloudos` within `<Name>.app/**` resolve to `virtual:syncloudos/app/<bundleIdentifier>`, with `SCOS` bound to the canonical case-insensitive identity key. `SCOS.app` exposes the declared `bundleIdentifier`, `displayName` and `version`. Shared React components use `useSCOS()` instead. See [Applications](applications.md).

## Preference panes and widgets

`Billing.prefPane/index.tsx` default-exports `definePreferencePane({ id, title, order, view })`. `Latest.widget/index.tsx` default-exports `defineWidget({ id, title, load, view })`. Both helpers are available from the package root.

Discovered entries augment `defineWebspring` declarations. Explicit shell entries keep their order; discovered panes use their `order` field. `preferences: { hide }` continues to hide built-in panes. The application and shell must not separately register the same ID.

## Integrations

Host contributions live in `src/Integrations/*.integration.ts`:

```ts
import { defineIntegration } from "@syndromatic/syncloudos";

export default defineIntegration({
  owners: ["com.example.journal", "com.example.journal-publisher"],
  install(context) {
    return context.bootNotifications.register("journal-ready", () => {
      console.info("Journal integration ready");
    });
  },
});
```

`install` receives the existing narrow host contribution context, not a raw runtime. Return a cleanup when registering resources. `runtimeConfig`, `trustedDocumentKinds` and `applicationDocuments` preparation declarations are supported on the integration definition. An integration is excluded when none of its owners are included in the build, including owners removed by development availability.

Use the same reverse-DNS identifiers in `owners` as in `Info.ts`. An uppercase-leading identifier
such as `Com.Syndromatic.Notes` is valid. The definition retains that spelling, but selection and
duplicate detection ignore case; listing it alongside `com.syndromatic.notes` is an error.

## Plugin options

```ts
synCloudOS({
  appsDirectory: "src/SynWare",
  preferencesDirectory: "src/Preferences",
  widgetsDirectory: "src/Widgets",
  integrationsDirectory: "src/Integrations",
  webspringEntry: "src/Webspring/Contents/index.tsx",
  applications: ["com.example.journal", "com.example.journal-publisher"],
});
```

Use `webspringEntry: false` for application-only hosting. `applications` takes bundle identifiers, not folder names; a comma-separated string is also accepted. `SYNCLOUDOS_APPLICATIONS=com.example.journal,com.example.journal-publisher` provides the selection when the option is omitted. Matching is case-insensitive. Unknown identifiers are errors. An empty selection includes no applications.

`virtual:syncloudos/project` exports `bundles`, `preferences`, `widgets`, `contributions`, `shell` and `shellResources`. The plugin's browser adapter injects this composition into `mountSynCloudOS()` by default; an explicit `composition` takes precedence. There is no static virtual-module dependency in the installed browser entry, so non-plugin hosts can supply their own composition. Folder additions and removals trigger rediscovery.

## Tooling

From a framework checkout:

```bash
node scripts/synware/create-synware.mjs src/SynWare/Notes.app --organisation com.example
node scripts/synware/create-synware.mjs src/Preferences/Billing.prefPane
node scripts/synware/create-synware.mjs src/Widgets/Latest.widget
node scripts/synware/create-synware.mjs src/Integrations/Journal.integration.ts --owners com.example.journal
node scripts/synware/validate-synware.mjs src/SynWare/Notes.app
```

Application scaffolds write `Info.ts` with `bundleIdentifier`, `displayName`, `version: "1.0.0"` and `webspring.visible`. `--organisation` defaults to `com.example`; the lowercased folder name is appended (`JournalPublisher.app` → `com.example.journalpublisher`) and the display name splits words (`Journal Publisher`). The Developer MCP offers the same kinds through `scaffold({ kind, name, organisation?, bundleIdentifier?, owners? })`. `inspect_project` reports resolved manifests, and `validate` applies the installed schema and default-export checks before optional TypeScript validation. Static tooling does not execute project configuration or application code; computed Vite paths require explicit overrides.

For an existing app, replace `id` and `runtime.bundleId` with `bundleIdentifier`, `title` with `displayName`, and `SynWareManifestOverrides` with `SynWareInfo`; write the app version explicitly. Saved app data and old launcher layouts are reset, not migrated. See the [identity migration table](synware-manifest.md#migration-from-the-previous-identity-fields).

The unpublished `1.0.0-beta.2` candidate requires this clean cutover. Remove the previous identity
fields and application-specific React service bridges rather than keeping aliases or fallback
readers. React function apps can keep the supported hooks; class apps use the controller APIs below.

## Class-app migration

Remove view-to-controller service bridges. Use `SCOS.routes.state(graph, name)`,
`SCOS.routes.isActive(graph, target)` and `SCOS.routes.subscribe(listener)` instead of forwarding
`useRouteState`/`useRouter` clients. Use `SCOS.fonts.manager` and `SCOS.menus.runtime` instead of
passing `useFonts()` and `useNSEMenuPort()` values back from a view.

Restore preferences in `applicationDidFinishLaunching`: `SCOS` is already running there.
Move reduced-motion work to `traitCollectionDidChange(previous)` and read
`this.traitCollection.reducedMotion`; content-bound values are in `traitCollection.presentation`.
Move geometry-dependent controller work to `viewWillLayout`/`viewDidLayout`.
Child view-controller frames no longer impose a percentage height or width; the parent owns layout.

Move command shortcuts and menu categories to `@action` options. Bind segmented controls, pickers,
popups and cover flow with `action`/`actionPayload`, or use `useAction(name, payload)` for custom
links; do not call action methods from views. Pass `owner: this` when constructing controllers
outside constructors. Text editing's content authority is `textOwner`; `owner` now means the same
lifetime owner as in other NSE controllers.

For detachable windows pass `documentId`, `restorationKey`, `mobilePolicy` and
`preferredBounds` to `openWindow`. Declare stable names in `static windowControllers` for cold
restoration; read the original options from `openingOptions`.
Replace interim test harnesses with `createSynWareTestHost({ application, manifest, services })`;
inspect `host.application.windows` and use `host.persistence` to seed the app's actual preferences.

Hosts pass About attribution as `mountSynCloudOS({ about: { copyright, trademark, tagline } })`.
Integrations construct recovery storage in `applicationDocuments: environment => ({ recoveryStore })`
and use `context.environment` for adapter clocks/timers. Integration authority is restricted to its
declared owner applications, compared case-insensitively, and is separate from registering bundles.
Widget views use their `navigate(route)` prop after preventing a link's default navigation, rather
than assigning `location` and reloading the page.
