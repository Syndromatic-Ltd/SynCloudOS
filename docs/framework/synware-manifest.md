# SynWare manifest

Every SynWare declares itself in `Contents/Info.ts`. The manifest tells the host what the application is called, where it lives, which presentations it supports, what it may use, and how its window should look. The host validates the manifest before it registers the application.

```ts
export default {
  schemaVersion: 1,
  id: "com.example.notes",
  version: "1.0.0",
  title: "Notes",
  routes: [{ path: "/notes", primary: true }],
  presentations: ["desktop", "tablet", "mobile"],
  windowDefaults: { title: "Notes", width: 920, height: 680, minimumWidth: 360, minimumHeight: 460, resizable: true },
  frame: { layout: "defacto", material: "standard", topBar: "standard", rightSlot: "userInfo" },
  documentTypes: [{ id: "com.example.notes.note", extensions: ["note"], displayName: "Note" }],
  permissions: ["app.open.public"],
  localeResources: { base: "Resources/Localised/Base.locale/Localisable.strings" },
  webspring: { visible: true, order: 1, icon: "./Resources/icon.png" },
} as const;
```

Write the manifest as a single `export default` object literal. The `as const` assertion keeps the types narrow, and the validation tooling reads the literal statically, so it accepts only plain values: no function calls, spreads or computed keys.

The schema rejects unknown keys. A typo in a field name surfaces as a validation issue with the path and a code (`required`, `type`, `unknown-key`, `format` or `conflict`) instead of being ignored.

## Identity

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | Required. |
| `id` | string | Required. Starts with a lowercase letter and continues with letters, digits, dots and hyphens, for example `com.example.notes`. |
| `version` | string | Required. Semantic version such as `1.0.0` or `1.2.0-beta.1`. |
| `title` | string | Required. Up to 256 characters. |
| `migrationVersion` | integer | Optional. Marks the data schema revision your `migrations` handle. |

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
| `chrome` | enum | `"system"` (the default title bar), `"custom"` (your `windowChrome` component) or `"frameless"`. |
| `smoothSurface` | `"off"`, `false`, a number, or an object | Corner shape. A number sets the radius. The object form accepts `radius`, `curve` (`"arc"`, `"squircle"`, `"superellipse"` or `"clothoid"`), `smoothing`, per-corner radii and `overflow`. |

`frame` describes how the application presents inside the application stage.

| Field | Values | Notes |
| --- | --- | --- |
| `layout` | `"defacto"`, `"simple"` | `defacto` gives your content the full surface. `simple` places it in an inset card. |
| `material` | `"standard"`, `"metal"` | The material of the system top bar and furniture. `metal` selects the brushed metal look. |
| `topBar` | `"standard"`, `"custom"`, `"none"` | `standard` uses the system bar. `custom` leaves the bar to your application. `none` removes it and the runtime supplies the return control. |
| `presentationMotion` | `"host"`, `"content"` | Defaults to `host`. `content` lets the application choreograph its entrance and return; the stage and shell omit their launch/return motion while retaining staging, focus, route and lifecycle settlement. |
| `rightSlot` | string | The control shown in the right side of the standard top bar. `"userInfo"` shows the account menu. |
| `smoothSurface` | `"off"` or `{ radius }` | Corner shape of the stage surface. |
| `sourceList` | object | Optional `railLabel`, `minWidth`, `maxWidth` and `defaultWidth` for a source list sidebar. |

## Documents, commands and menus

| Field | Notes |
| --- | --- |
| `documentTypes` | Each entry has an `id` and optionally `extensions` (letters and digits only) and `displayName`. Declare a type here before you open documents of that type. |
| `commands` | Static command declarations with `id`, `title`, and optionally `menu` and `shortcut`. Register behaviour at runtime with `useSynWareCommands`. |
| `menus` | Menu declarations with `id`, `title` and the `commandIds` they list. |
| `applicationMenu` | Optional `trigger: "content"` and a `preferences` entry with a `commandId` and optional `label`. |

## Capabilities and services

`permissions` lists the capabilities the application asks the host for, for example `"app.open.public"`, `"external.open"` or `"diagnostics.view"`. The host's policy decides what to grant. FX clients that reach devices ask for their own permissions, which the [FX guides](fx/README.md) name.

`services` declares the host services the application depends on. Each entry has an `id`, and optionally `required` and `minimumVersion`.

## Localisation and appearance

| Field | Notes |
| --- | --- |
| `localeResources` | `base` points at the base strings file. `bundles` lists further locales as `{ locale, path }` pairs. |
| `appearances` | Declares the appearances the application supports: `{ id, variant }` where `variant` is `"atmo"` or `"neutral"`. |

## Lifecycle and background work

| Field | Notes |
| --- | --- |
| `lifecycle` | `preload` opts into speculative module preloading (default `false`); it does not govern whether the application can launch. `suspend`, `resume` and `terminate` retain their lifecycle declarations. |
| `background` | `enabled` and a list of task identifiers. Pair it with `createBackgroundHandler` in the definition. |

## Runtime policy

The optional `runtime` block carries intent that differs from the defaults.

Use `runtime.disabled: true` to keep an application registered while blocking route opening, runtime launch and preloading. A visible Webspring icon stays dimmed and exposes `runtime.disabledReason`. Required-service recovery cannot enable an application disabled by its declaration. `lifecycle.launch` is rejected; use `lifecycle.preload` for the preload boolean. Lifecycle launch hooks and methods keep their names.

| Field | Notes |
| --- | --- |
| `disabled` | Optional boolean, default `false`. Blocks loading and launch without changing `webspring.visible`. |
| `disabledReason` | Optional explanation shown for a disabled application. It does not itself disable the application. |
| `bundleId` | A stable identifier when it should differ from `id`. |
| `presentation` | `"appView"`, `"windowedView"`, `"systemSheet"` or `"backgroundService"`. |
| `type` | `"internal"`, `"system"` or `"external"`. |
| `policy` | `public`, `requiresLogin`, `requiredCapabilities` and `requiredAccessClasses` (`"team"` or `"external"`). |
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

Shells declare `webspringShell` instead. Its optional `folders` block, `{ editable, initial: [{ id, title, order, apps }] }`, groups launcher applications into folders: each `id` matches `folder.<name>`, `title` is localised text, `order` is a whole number placed among the applications' `webspring.order` values, and `apps` lists at least one application ID without repeats. See [Webspring](webspring.md#folders).

## Validate a manifest

`validateSynWareManifest` checks a value against the schema and returns either the frozen manifest or a list of issues. `createSynWare` runs the same check and throws `SynWareManifestValidationError` when the manifest is invalid.

```ts
import { validateSynWareManifest } from "@syndromatic/syncloudos/sdk";

const result = validateSynWareManifest({
  schemaVersion: 1,
  id: "com.example.notes",
  version: "1.0.0",
  title: "Notes",
});

if (!result.ok) {
  for (const issue of result.errors) {
    console.error(`${issue.path}: ${issue.message} (${issue.code})`);
  }
}
```

The `synware:validate` tooling command runs the same schema check on a bundle directory. See [Tooling](synware-sdk.md#tooling).
