# SynWare manifest

Every application has a `Contents/Info.ts` that declares what it is and what it needs, typed as `SynWareInfo`. This page lists every field. Write `bundleIdentifier`, `displayName` and `version` yourself; discovery fills in only `schemaVersion`, the icon and the locale resources, then validates the complete manifest. The plugin, the static validator and the Developer MCP all resolve the same declaration. See [Project structure](project-structure.md).

```ts
export default {
  schemaVersion: 1,
  bundleIdentifier: "com.example.notes",
  version: "1.0.0",
  displayName: "Notes",
  routes: [{ path: "/notes", primary: true }],
  presentations: ["desktop", "tablet", "mobile"],
  windowDefaults: { title: "Notes", width: 920, height: 680, minimumWidth: 360, minimumHeight: 460, resizable: true },
  documentTypes: [{ id: "com.example.notes.note", extensions: ["note"], displayName: "Note" }],
  entitlements: ["file.open"],
  runtime: { policy: { public: true } },
  webspring: { visible: true, order: 1, icon: "./Resources/icon.png" },
} as const;
```

Write the manifest as a single `export default` object literal. `as const` (or `satisfies SynWareInfo`) keeps the types narrow. The validation tooling reads the literal statically, so use plain values only: no function calls, spreads or computed keys.

The schema rejects unknown keys, so a misspelt field name shows up as a validation issue with its path and a code (`required`, `type`, `unknown-key`, `format` or `conflict`) instead of being ignored.

## Identity

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | Optional in `SynWareInfo`; discovery supplies `1`. |
| `bundleIdentifier` | string | Required reverse-DNS identity with at least two dots. Each segment contains letters (either case), digits or hyphens. |
| `version` | string | Required semantic version. Never inherited from `package.json`. |
| `displayName` | string | Required public application name. Independent of `windowDefaults.title`. |
| `availability` | `"development"` | Optional. Excludes the application from production builds. |
| `migrationVersion` | integer | Optional. Marks the data schema revision your `migrations` handle. |

Manifests and public displays keep the identifier's declared case. Registry lookups, `SCOS.open`, duplicate detection and storage keys ignore case, so `com.example.Notes` and `COM.EXAMPLE.notes` are the same identity and can't both be registered. The `.app` folder gives the bundle its name, not its identity.

### Migration from the previous identity fields

| Before | After |
| --- | --- |
| Manifest `id` and `runtime.bundleId` | One required top-level `bundleIdentifier`; remove both old fields |
| Manifest `title` | Required `displayName` |
| `SynWareManifestOverrides` | `SynWareInfo` |
| Optional or identity-less `Info.ts` | Required `Info.ts` with explicit identity and version |
| Version inherited from the project package | Explicit app `version` |
| `SCOS.app.id` / `.title`, catalogue `id` / `title` | `bundleIdentifier` / `displayName` |
| `application: { id }` | `application: { bundleIdentifier }` |
| Runtime `AppInfo.id` / `.bundleId`, `AppManager.id` / `.appId` | `bundleIdentifier` |
| Runtime `AppInfo.about.version` | Required top-level `AppInfo.version` |
| `SCOS.open("notes")` | `SCOS.open("com.example.notes")` or `SCOS.open("/notes")` |
| Old app persistence keys and Webspring layout v4 | Reset app storage under the new identity; Webspring layout v5 (`webspring.layout.v5`) |

This is a clean cutover. Saved data is reset, not migrated, and the old IDs have no aliases or compatibility shims. Window, document, command, folder, pane and widget IDs, and window and command titles, don't change.

## Routes and presentations

| Field | Type | Notes |
| --- | --- | --- |
| `routes` | array | Each entry has a `path` starting with `/`, and optionally `title`, `primary` and `match` (`"exact"` or `"prefix"`). Mark one route `primary` to make it the application's entry point. |
| `presentations` | array | Any of `"desktop"`, `"tablet"`, `"mobile"`. The host launches the application only in the presentations you list. |
| `minimumViewport` | object | Optional `width` and `height` in CSS pixels. |

## Windows and frame

`windowDefaults` describes the window the host creates for your application.

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Initial window title. |
| `width`, `height` | integer | Initial size in CSS pixels. |
| `minimumWidth`, `minimumHeight` | integer | Smallest size the user can resize to. |
| `resizable` | boolean | Whether the window resizes. |
| `role` | enum | `"standard"`, `"panel"`, `"modal"`, `"sheet"` or `"hud"`. |
| `smoothSurface` | `"off"`, `false`, a number, or an object | Corner shape. A number sets the radius. The object form accepts `radius`, `curve` (`"arc"`, `"squircle"`, `"superellipse"` or `"clothoid"`), `smoothing`, per-corner radii and `overflow`. |

`frame` describes how the application presents inside the application stage. `frame.presentationMotion` chooses whether the host (`"host"`) or your content (`"content"`) animates launch and return. Window chrome and menus are set on the window and application controllers, not in the manifest.

## Documents

| Field | Notes |
| --- | --- |
| `documentTypes` | Each entry has an `id` and optionally `extensions` (letters and digits only), `mimeTypes` and `displayName`. Declare a type here before you open documents of that type. |

## Entitlements, privacy and services

`entitlements` lists the device and service capabilities the application uses, such as `location.read`, `location.request`, `video.capture.camera` or `file.write`. The runtime validates and captures this list before launch, and it can't change afterwards: a mounted client can't add entitlements by modifying the array later. Each [FX guide](fx/README.md) gives its exact entitlement names.

Declaring a capability, the user's consent and the signed-in person's role are three separate checks:

| Check | Owner | Example |
| --- | --- | --- |
| The app declares the capability | `entitlements` in `Info.ts`, captured for launch | `file.open` permits the declared open-panel operation; add `file.write` for saving through `SCOS.filePanels`. |
| The app meets mandatory launch declarations | `runtime.policy.requiredEntitlements` | An absent required entitlement denies launch before application code runs. |
| This app may use a privacy service | The per-user, per-app privacy store and the browser's permission | Location, camera, microphone, Bluetooth, NFC, speech, contacts and XR have their own status and request methods. PassFX has no privacy status; payment presentation still goes through the entitlement, policy, denial and lifetime checks. |
| This person may perform a role-governed operation | The host's configuration profile | DocumentStore capabilities include `documentStore.drafts.read`, `documentStore.draft.write`, `documentStore.publish` and `documentStore.revision.create`. |

Declaring an entitlement doesn't prompt the user, grant browser access or give the person a role capability, and a role grant can't stand in for a missing entitlement. `getAuthorizationStatus()` only reports; it never grants consent. Requests and active sessions go through the shared privacy check. Webspring presents the current user's choices in **System Preferences → Privacy & Security**. See [Authorisation, entitlements and privacy](authorization.md).

A host grants role capabilities with the `configurationProfile` option of `mountSynCloudOS`, which the runtime evaluates as `runtime.configurationProfiles`. The application's own requirements go in the manifest's `runtime.policy`.

A single application without sign-in (`application` with `authentication: "disabled"`, the default) needs no site policy. The host opens its primary application publicly even without `runtime.policy.public`, and a primary that declares `runtime.policy.requiresLogin` contradicts that host and fails to mount. In this mode the built-in profile grants the anonymous role the `documentStore.*` capabilities the app declares, and no others. An explicit `configurationProfile` replaces this with its own rules.

The [test host](testing-synware.md) uses fixture grants and adapters that deny by default. A test grant doesn't show that a browser, a user or a production site would allow the operation.

`services` declares the host services the app depends on. Each entry has an `id`, and optionally `required` and `minimumVersion`.

## Installation

`webApp`, `urlTypes`, `linkCapture`, `shortcutItems` and `shareTarget` describe how the app behaves when the site is installed as a web app. [Installed applications](installed-applications.md) documents each field.

## Localisation and appearance

| Field | Notes |
| --- | --- |
| Localised files | Discovery finds every `Resources/Localised/<locale>.locale/*.strings` file. There is no `localeResources` manifest field. |
| `appearances` | Declares the appearances the application supports: `{ id, variant }` where `variant` is `"system"` or `"neutral"`. |

## Lifecycle and background work

| Field | Notes |
| --- | --- |
| `lifecycle` | `preload` opts into speculative module preloading (default `false`); it doesn't control whether the application can launch. `suspend`, `resume` and `terminate` are optional booleans for those lifecycle phases. |
| `background` | `enabled` and a list of task identifiers in `tasks`. Handle them with `handleBackgroundTask` on the application class, or a `createBackgroundHandler` export. |

## Runtime policy

The optional `runtime` block records where the application differs from the defaults.

Set `runtime.disabled: true` to keep an application registered but stop its routes opening, its launch and its preloading. A visible Webspring icon is dimmed and shows `runtime.disabledReason`. An application disabled this way stays disabled even when its required services recover. The old `lifecycle.launch` field is rejected; use `lifecycle.preload` instead.

| Field | Notes |
| --- | --- |
| `disabled` | Optional boolean, default `false`. Blocks loading and launch without changing `webspring.visible`. |
| `disabledReason` | Optional explanation shown for a disabled application. It does not itself disable the application. |
| `presentation` | `"stage"`, `"window"`, `"systemSheet"` or `"backgroundService"`. |
| `type` | `"internal"`, `"system"` or `"external"`. |
| `policy` | `public`, `requiresLogin`, `requiredRoles`, `requiredCapabilities`, `requiredEntitlements` and `requiredAccessClasses` (`"team"` or `"external"`). The site's configuration profile applies these access requirements. |
| `notifications` | An initial `badgeCount`. |

## Launcher presence

The `webspring` block controls how the application appears in the launcher.

| Field | Notes |
| --- | --- |
| `visible` | Show the application in the launcher. |
| `order` | Position among the launcher icons. |
| `icon` | Path to the icon resource, relative to the bundle. |
| `featured` | Highlight the application. |
| `defaultSelected` | Select the application when the launcher first appears. |

A shell declares its identity in a `WSInfo` instead (see [Webspring](webspring.md#define-a-shell)). Its optional `folders` block, `{ editable, initial: [{ id, title, order, apps }] }`, groups launcher applications into folders. Each `id` has the form `folder.<name>`, `title` is localised text, `order` is a whole number that sorts among the applications' `webspring.order` values, and `apps` lists one or more application IDs without repeats. See [Webspring](webspring.md#folders).

## Validate a manifest

`validateSynWareManifest` checks a complete manifest against the schema. It returns `{ ok: true, value }` with the frozen manifest, or `{ ok: false, errors }`. Folder tooling resolves `SynWareInfo` into a complete manifest first, and the runtime rejects an invalid one with `SynWareManifestValidationError`.

```ts
import { validateSynWareManifest } from "@syndromatic/syncloudos/sdk";

const result = validateSynWareManifest({
  schemaVersion: 1,
  bundleIdentifier: "com.example.notes",
  version: "1.0.0",
  displayName: "Notes",
});

if (!result.ok) {
  for (const issue of result.errors) {
    console.error(`${issue.path}: ${issue.message} (${issue.code})`);
  }
}
```

`npm run synware:validate` runs the same schema check on a bundle directory. See [Tooling](synware-sdk.md#tooling).
