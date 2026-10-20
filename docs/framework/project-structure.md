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

Only `Contents/index.tsx` is required for an application. `Info.ts`, resources, other directory kinds and the shell are optional. Missing optional directories are fine. Each entry must have the correct default export; a missing or incorrect export reports the source folder and expected declaration. Discovery rejects symbolic links and case-colliding resources.

## Application manifests

`Info.ts` default-exports `SynWareManifestOverrides`, a partial `SynWareManifestV1`. The plugin, static validator and Developer MCP use the same derivation:

| Field | Default |
| --- | --- |
| `schemaVersion` | `1` |
| `id` | Folder name in kebab case: `JournalPublisher.app` → `journal-publisher`; `NSEControlGallery.app` → `nse-control-gallery` |
| `title` | Split folder name: `Journal Publisher`, `NSE Control Gallery` |
| `version` | Project `package.json` version |
| `webspring.icon` | `Resources/AppIcon.svg`, then `AppIcon.png`, otherwise framework artwork |

Explicit overrides win, except schema version remains `1`. Keep an existing ID explicitly when its spelling differs from the derived ID: `AnimationFX.app` derives `animation-fx`, so an existing `animationfx` app must keep `id: "animationfx"` to retain its persistence identity.

Every `Resources/Localised/<locale>.locale/*.strings` file is supplied to the locale service. `localeResources` is not a manifest field. Font resources and other artwork are also mapped by discovery.

```ts
import type { SynWareManifestOverrides } from "@syndromatic/syncloudos/sdk";
export default {
  webspring: { visible: true },
  permissions: ["diagnostics.view"],
  availability: "development",
} satisfies SynWareManifestOverrides;
```

Development-only applications are excluded from production builds. In-project apps are first-party and receive their requested permissions. External bundles keep the existing trusted-source allowlist path.

## Application modules

The default export is a React component or an `NSEApplication` subclass. Export optional `routes`, `migrations`, `windowChrome`, `rematerialiseOwnedDocument` and `createBackgroundHandler` beside it; the loader builds the captured definition from the complete derived manifest and these named exports. `createSynWare` is internal; `sdk/testing` retains it for test hosts without discovery.

Imports of `@syndromatic/syncloudos` within `<Name>.app/**` resolve to `virtual:syncloudos/app/<id>`, with `SCOS` bound to the manifest ID. Shared React components use `useSCOS()` instead. See [Applications](applications.md).

## Preference panes and widgets

`Billing.prefPane/index.tsx` default-exports `definePreferencePane({ id, title, order, view })`. `Latest.widget/index.tsx` default-exports `defineWidget({ id, title, load, view })`. Both helpers are available from the package root.

Discovered entries augment `defineWebspring` declarations. Explicit shell entries keep their order; discovered panes use their `order` field. `preferences: { hide }` continues to hide built-in panes. The application and shell must not separately register the same ID.

## Integrations

Host contributions live in `src/Integrations/*.integration.ts`:

```ts
import { defineIntegration } from "@syndromatic/syncloudos";

export default defineIntegration({
  owners: ["journal", "journal-publisher"],
  install(context) {
    return context.bootNotifications.register("journal-ready", () => {
      console.info("Journal integration ready");
    });
  },
});
```

`install` receives the existing narrow host contribution context, not a raw runtime. Return a cleanup when registering resources. `runtimeConfig`, `trustedDocumentKinds` and `applicationDocuments` preparation declarations are supported on the integration definition. An integration is excluded when none of its owners are included in the build, including owners removed by development availability.

## Plugin options

```ts
synCloudOS({
  appsDirectory: "src/SynWare",
  preferencesDirectory: "src/Preferences",
  widgetsDirectory: "src/Widgets",
  integrationsDirectory: "src/Integrations",
  webspringEntry: "src/Webspring/Contents/index.tsx",
  applications: ["journal", "journal-publisher"],
});
```

Use `webspringEntry: false` for application-only hosting. `applications` takes IDs, not folder names; a comma-separated string is also accepted. `SYNCLOUDOS_APPLICATIONS=journal,journal-publisher` provides the selection when the option is omitted. Unknown IDs are errors. An empty selection includes no applications.

`virtual:syncloudos/project` exports `bundles`, `preferences`, `widgets`, `contributions`, `shell` and `shellResources`. The plugin's browser adapter injects this composition into `mountSynCloudOS()` by default; an explicit `composition` takes precedence. There is no static virtual-module dependency in the installed browser entry, so non-plugin hosts can supply their own composition. Folder additions and removals trigger rediscovery.

## Tooling

From a framework checkout:

```bash
node scripts/synware/create-synware.mjs src/SynWare/Notes.app
node scripts/synware/create-synware.mjs src/Preferences/Billing.prefPane
node scripts/synware/create-synware.mjs src/Widgets/Latest.widget
node scripts/synware/create-synware.mjs src/Integrations/Journal.integration.ts --owners journal
node scripts/synware/validate-synware.mjs src/SynWare/Notes.app
```

Application scaffolds retain `Info.ts` with `webspring.visible` and a comment about optional overrides. The matching Developer MCP offers the same folder kinds through `scaffold({ kind, name, owners? })`; IDs and application routes are optional. `inspect_project` reports resolved application manifests and other discovered folder kinds, and `validate` applies the installed manifest schema and default-export checks before optional TypeScript validation. Static tooling does not execute project configuration or application code; computed Vite paths require explicit overrides.
