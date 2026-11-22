# Project structure

A SynCloudOS project is configured by its folder layout. The Vite plugin reads these folders and builds the project from them:

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
  Webspring/Contents/Info.ts
  Webspring/Contents/index.tsx
```

An application needs both `Contents/index.tsx` and `Contents/Info.ts`. Everything else (resources, the other directory kinds and the shell) is optional, and a missing optional directory is fine. Each entry must have the right default export; if it is missing or wrong, the error names the source folder and the declaration it expected. Discovery rejects symbolic links and resources whose names differ only by case.

## Application manifests

`Info.ts` default-exports a `SynWareInfo` object that declares the app's identity and version. The plugin, the static validator and the Developer MCP all resolve the same manifest from it:

| Field | Rule |
| --- | --- |
| `bundleIdentifier` | Required reverse-DNS identity with at least two dots; letters in either case, digits and hyphens in each segment |
| `displayName` | Required public app name |
| `version` | Required app version; no package fallback |
| `schemaVersion` | Defaults to `1` |
| `webspring.icon` | Explicit value, else `Resources/AppIcon.svg`, then `AppIcon.png`, otherwise framework artwork |

Manifests and public displays keep the identifier's case. Keys and comparisons ignore case, so two identifiers that differ only by case are an error. The folder name is only the bundle name. Scaffolding fills in the required identity fields for you; discovery never invents them.

For example, `Diagnostics.app` keeps `packageName: "Diagnostics.app"` even if its `Info.ts`
declares `bundleIdentifier: "org.Example.READER"`. Discovery takes the package name and resource
root from the source folder, and identity lookups compare the declared identifier without case.

Discovery hands every `Resources/Localised/<locale>.locale/*.strings` file to the locale service, so the manifest has no `localeResources` field. It maps font resources and other artwork the same way.

```ts
import type { SynWareInfo } from "@syndromatic/syncloudos/sdk";
export default {
  bundleIdentifier: "com.example.Diagnostics",
  displayName: "Diagnostics",
  version: "1.0.0",
  webspring: { visible: true },
  entitlements: ["diagnostics.view"],
  availability: "development",
} satisfies SynWareInfo;
```

Production builds leave out development-only applications. Apps in the project are first-party and receive their declared entitlements; bundles from outside still go through the trusted-source allowlist.

## Application modules

The default export is an `NSEApplication` subclass or a React component. Beside it you can export `routes`, `migrations`, `rematerialiseOwnedDocument` and `createBackgroundHandler`; the loader builds the application definition from the derived manifest and these named exports. You don't call `createSynWare` in an application. It lives in `sdk/testing` for test hosts that run without discovery.

Inside `<Name>.app/**`, imports of `@syndromatic/syncloudos` resolve to `virtual:syncloudos/app/<bundleIdentifier>`, where `SCOS` is bound to that application's identity (compared without case). `SCOS.app` exposes the declared `bundleIdentifier`, `displayName` and `version`. Shared React components use `useSCOS()` instead. See [Applications](applications.md).

## Preference panes and widgets

`Billing.prefPane/index.tsx` default-exports an `NSEPreferencePane` subclass. `Latest.widget/index.tsx` default-exports a `WSWidget` subclass. Both base classes are available from the package root.

Discovered entries add to the shell's `WSApplication` declarations. Entries listed in `static widgets` and `static preferencePanes` keep their order, and discovered entries follow, sorted by their `order` field. `static hiddenPreferencePanes` hides built-in panes. Don't register the same ID from both an application and the shell.

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

`install` receives the narrow host contribution context, not the runtime. If it registers resources, return a cleanup. An integration definition can also declare `runtimeConfig`, `trustedDocumentKinds` and `applicationDocuments`. The build drops an integration when none of its owners is in the build, including owners left out because they are development-only.

Use the same reverse-DNS identifiers in `owners` as in `Info.ts`. An identifier with capitals,
such as `Com.Syndromatic.Notes`, is valid. The definition keeps that spelling, but selection and
duplicate detection ignore case, so listing it alongside `com.syndromatic.notes` is an error.

## Plugin options

```ts
synCloudOS({
  appsDirectory: "src/SynWare",
  preferencesDirectory: "src/Preferences",
  widgetsDirectory: "src/Widgets",
  integrationsDirectory: "src/Integrations",
  webspringEntry: "src/Webspring/Contents/index.tsx",
  themesDirectory: "src/Themes",
  applications: ["com.example.journal", "com.example.journal-publisher"],
});
```

The values shown are the defaults. Set `webspringEntry: false` for application-only hosting, and `preferencesDirectory`, `widgetsDirectory`, `integrationsDirectory` or `themesDirectory` to `false` to turn that discovery off. `themesDirectory` holds system [theme bundles](themes.md).

`applications` selects which applications to build. It takes bundle identifiers, not folder names, as an array or a comma-separated string. When you leave it out, `SYNCLOUDOS_APPLICATIONS=com.example.journal,com.example.journal-publisher` supplies the selection. Matching ignores case, an unknown identifier is an error, and an empty selection builds no applications.

`virtual:syncloudos/project` exports `bundles`, `preferences`, `widgets`, `contributions`, `webspring` and `shellResources`. The plugin's browser adapter passes this composition to `mountSynCloudOS()`, and an explicit `composition` option takes precedence. The installed browser entry has no static dependency on the virtual module, so a host without the plugin can supply its own composition. Adding or removing a folder triggers rediscovery.

## Tooling

From a framework checkout (`npm run synware:create --` and `npm run synware:validate --` run the same scripts):

```bash
node scripts/synware/create-synware.mjs src/SynWare/Notes.app --organisation com.example
node scripts/synware/create-synware.mjs src/Preferences/Billing.prefPane
node scripts/synware/create-synware.mjs src/Widgets/Latest.widget
node scripts/synware/create-synware.mjs src/Integrations/Journal.integration.ts --owners com.example.journal
node scripts/synware/create-synware.mjs src/Webspring --name "Example Site" --organisation com.example
node scripts/synware/validate-synware.mjs src/SynWare/Notes.app
```

Application scaffolds write `Info.ts` with `bundleIdentifier`, `displayName`, `version: "1.0.0"` and `webspring.visible`. `--organisation` defaults to `com.example`, and the scaffold appends the lowercased folder name (`JournalPublisher.app` becomes `com.example.journalpublisher`) and splits the display name into words (`Journal Publisher`). For `.app` scaffolds, `--authoring separate|inline|function` chooses where the view lives (`separate`, a view file beside the controller, is the default), `--application-menu-toolbar` adds an application menu toolbar item, and `--fx recipe,...` adds FX recipe files (with function authoring).

The Developer MCP offers the same kinds through `scaffold({ kind, name, organisation?, bundleIdentifier?, owners? })`. `inspect_project` reports resolved manifests, and `validate` applies the installed schema and default-export checks before optional TypeScript validation. Static tooling never runs project configuration or application code, so computed Vite paths need explicit overrides.

For an existing app, replace `id` and `runtime.bundleId` with `bundleIdentifier`, `title` with `displayName`, and `SynWareManifestOverrides` with `SynWareInfo`, and write the app version explicitly. Saved app data and old launcher layouts are reset, not migrated. See the [identity migration table](synware-manifest.md#migration-from-the-previous-identity-fields).

The unpublished `1.0.0-beta.2` candidate needs this clean cutover. Remove the previous identity
fields and application-specific React service bridges instead of keeping aliases or fallback
readers. React function apps can keep the supported hooks; class apps use the controller APIs below.

## Class-app migration

Remove view-to-controller service bridges. Use `SCOS.routes.state(graph, name)`,
`SCOS.routes.isActive(graph, target)` and `SCOS.routes.subscribe(listener)` instead of forwarding
`useRouteState`/`useRouter` clients. Use `SCOS.fonts.manager` and `SCOS.menus.runtime` instead of
passing `useFonts()` and `useNSEMenuPort()` values back from a view.

Restore preferences in `applicationWillFinishLaunching`: `SCOS` is already running there, and the main window waits for it.
Move reduced-motion work to `traitCollectionDidChange(previous)` and read
`this.traitCollection.reducedMotion`; content-bound values are in `traitCollection.presentation`.
Move geometry-dependent controller work to `viewWillLayout`/`viewDidLayout`.
Child view-controller frames no longer set a percentage height or width; the parent owns layout.

Move command shortcuts and menu categories to `@action` options. Bind buttons, segmented controls, pop-up buttons, path controls and menu items with `action`/`actionPayload`, or use `useAction(name, payload)` for custom links; don't call action methods directly from views. Pass `owner: this` when you construct a controller outside a constructor. In text editing, `textOwner` owns the content, and `owner` is the lifetime owner, as in other NSE controllers.

For detachable windows pass `documentId`, `restorationKey`, `mobilePolicy` and
`preferredBounds` to `openWindow`. Declare stable names in `static windowControllers` for cold
restoration, and read the original options from `openingOptions`.
Replace interim test harnesses with `createSynWareTestHost({ application, manifest, services })`;
inspect `host.application.windows` and use `host.persistence` to seed the app's actual preferences.
Supply test codecs through `applicationDocuments.initialTypes`, replacing the former top-level
test-host option. For shared-store documents use `applicationDocuments.install` to call
`context.documents.registerDocumentStoreAdapter({ id, documentIdPrefix })` and seed through
`context.seed`, listing each seed kind in `trustedDocumentKinds`. The installer runs before launch
and loses its authority on disposal or failure. The manifest must still admit the kind in
`documentTypes`. See [trusted document provision](testing-synware.md#trusted-document-provision).

Hosts pass About attribution as `mountSynCloudOS({ about: { copyright, trademark, tagline } })`.
Integrations construct recovery storage in `applicationDocuments: environment => ({ recoveryStore })`
and use `context.environment` for adapter clocks/timers. Integration authority is restricted to its
declared owner applications, compared case-insensitively, and is separate from registering bundles.
Widget views call their `navigate(route)` prop after preventing a link's default navigation,
instead of assigning `location` and reloading the page.
