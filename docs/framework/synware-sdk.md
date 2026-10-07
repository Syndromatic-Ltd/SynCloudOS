# SynWare SDK

A SynWare is an application bundle that runs on SynCloudOS, in the way a `.app` bundle runs on Mac OS X. The bundle carries a manifest, a root component and its resources. The host loads the bundle, validates the manifest and mounts the component inside a session. The SDK, imported from `@syndromatic/syncloudos/sdk`, is everything a bundle needs from the platform.

For host-supplied font catalogues and imported fonts, use `useSynWareFonts()`. The [managed fonts guide](managed-fonts.md) shows one Node-safe declaration, early website CSS and preloads, app font pickers, and byte-backed TextFX acquisition.

## Anatomy of a bundle

```text
Notes.app/
└── Contents/
    ├── Info.ts                 the manifest
    ├── index.tsx               createSynWare(...) as the default export
    └── Resources/
        ├── icon.png
        └── Localised/
            └── Base.locale/
                └── Localisable.strings
```

`Info.ts` holds the [manifest](synware-manifest.md). `index.tsx` combines the manifest with your React components and exports the result as its default export. [Getting started](getting-started.md) builds the smallest working bundle.

## Define the application

`createSynWare` takes a definition and returns the module the host loads.

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import { createSynWare, useSynWare } from "@syndromatic/syncloudos/sdk";
import { NSEStackItem, NSEStackView } from "@syndromatic/syncloudos/nse";
import manifest from "./Info";

function Notes() {
  const app = useSynWare();
  return (
    <NSEStackView aria-label="Notes" orientation="vertical" spacing={12}>
      <NSEStackItem id="heading" visibilityPriority={100}>
        <h1>{app.locale.t("notes.title")}</h1>
      </NSEStackItem>
    </NSEStackView>
  );
}

export default createSynWare({ manifest, root: Notes });
```

The definition accepts these members:

| Member | Purpose |
| --- | --- |
| `manifest` | The manifest object. `createSynWare` validates it and throws `SynWareManifestValidationError` when it is invalid. |
| `root` | The component the host mounts. It renders inside the session. |
| `routes` | A route graph from `defineSynWareRoutes`, for applications with several screens. |
| `migrations` | Data migrations, each with `fromVersion`, `toVersion` and a `migrate(value, { signal })` function. |
| `windowChrome` | A component that draws the title bar when `windowDefaults.chrome` is `"custom"`. |
| `createBackgroundHandler` | A factory for the handler that runs the background tasks the manifest declares. |

## The session

The host mounts your root component inside a session. `useSynWare()` returns the session object, which holds one client for each capability the platform offers.

```tsx
import { useSynWare } from "@syndromatic/syncloudos/sdk";

export function SessionTour() {
  const app = useSynWare();

  app.appId;          // "com.example.notes"
app.signal;         // aborts when the application closes
app.presentation;   // traits of the current surface
app.commands;       // dispatch and validate commands
app.documents;      // documents and their resources
app.windows;        // windows this application owns
app.undo;           // undo histories
app.locale;         // formatting and translation
app.persistence;    // per-application preferences
app.services;       // optional host services
  return null;
}
```

The session is scoped to your application. Preferences, documents and windows you touch belong to your bundle, and the host enforces that boundary. Pass `app.signal` to fetches and timers so they stop when the user closes the application.

### Hooks

Hooks give each client a React shape, subscribing to changes and releasing resources when the component unmounts. They also read better than reaching into the session object.

| Area | Hooks |
| --- | --- |
| Session | `useSynWare`, `useSynWareLifecycle`, `useSynWareEvents`, `useSynWareErrors` |
| Commands | `useSynWareCommands`, `useSynWareApplicationMenuTrigger`, `useSynWareQuickSwitchTrigger` |
| Documents and windows | `useSynWareDocument`, `useSynWareWindow`, `useSynWareWindowChrome`, `useSynWareWorkArea`, `useSynWareWorkAreaSnapshot` |
| Routing | `useSynWareRouter`, `useSynWareRouteData`, `useSynWareRouteState` |
| Data and identity | `useSynWarePersistence`, `useSynWareIdentity`, `useSynWareIdentitySnapshot`, `useSynWareScheduler` |
| Environment | `useSynWareMediaQuery`, `useSynWareMediaQueries`, `useSynWareConnectivity`, `useSynWareAppearance`, `useSynWareSettingsAvailability` |
| Outward actions | `useSynWareNotifications`, `useSynWareShare`, `useSynWareExternalActions`, `useSynWarePasteboard`, `useSynWareDrag` |
| Text and colour | `useSynWareLocalisedStrings`, `useSynWareTextLayout`, `useSynWareColourPanel` |
| FX | `useSynWareAnimations`, `useSynWareImages`, `useSynWareAudio`, `useSynWareHaptics`, `useSynWareMotion`, `useSynWareMedia`, `useSynWareVideo`, `useSynWareMIDI`, `useSynWareLocation`, `useSynWareLumina` |
| Web content | `useSynWareWebContent` |
| Host services | `useSynWareService` |

## Commands

Commands turn user intent into named, validated operations. A menu item, a key binding and a toolbar button can all dispatch the same command, and each one enables and disables together because they share the command's `validate` function.

```tsx
import { useSynWare, useSynWareCommands } from "@syndromatic/syncloudos/sdk";

function NotesCommands({ onAdd, canAdd }: { onAdd(): void; canAdd: boolean }) {
  const commands = useSynWareCommands([
    {
      id: "com.example.notes.add",
      title: { key: "notes.add", fallback: "Add Note" },
      defaultKeyBindings: [{ key: "n", modifiers: ["primary"], scope: "application" }],
      validate: () => ({ enabled: canAdd }),
      execute: () => onAdd(),
    },
  ]);

  return <button onClick={() => void commands.dispatch("com.example.notes.add")}>Add Note</button>;
}
```

`useSynWareCommands` registers the definitions when the component mounts and removes them when it unmounts. A command may also carry an `undo` policy that registers an undo action for each execution. The [commands, responders and undo guide](commands-responders-undo.md) describes dispatch, validation, key bindings and undo in full.

## Services

Some capabilities come from the host and vary between deployments. A service token names one of them. `useSynWareService` returns a result object instead of throwing, so your interface can handle a missing service directly.

```tsx
import { defineSynWareServiceToken, useSynWareService } from "@syndromatic/syncloudos/sdk";

interface ExportClient {
  exportAsPdf(id: string): Promise<Blob>;
}

const exportToken = defineSynWareServiceToken<ExportClient>({ id: "com.example.export" });

function ExportButton({ id }: { id: string }) {
  const service = useSynWareService(exportToken);
  if (!service.available) return <p>{service.denial?.message}</p>;
  return <button onClick={() => void service.client?.exportAsPdf(id)}>Export</button>;
}
```

`denial.code` is `"unavailable"` when the host offers no such service and `"denied"` when the host's policy refuses your application. Declare the services your application depends on in the manifest `services` list, and request the matching `permissions`. Code that prefers an exception can call `app.services.require(token)`, which throws `SynWareServiceAcquisitionError` with the same denial attached.

## Routes

An application with one screen needs only `root`. An application with several screens describes them as a route graph.

```tsx
import { createSynWare, defineSynWareRoutes, RouteOutlet, useSynWareRouter } from "@syndromatic/syncloudos/sdk";
import manifest from "./Info";

function NoteList() {
  const router = useSynWareRouter(routes);
  return <button onClick={() => router.transitionTo({ name: "note", params: { id: "welcome" } })}>Open</button>;
}

function NoteDetail() {
  return <p>A note.</p>;
}

const routes = defineSynWareRoutes({
  id: "com.example.notes.routes",
  routes: [
    { name: "list", path: "notes", component: NoteList },
    { name: "note", path: "notes/:id", component: NoteDetail },
  ],
});

export default createSynWare({ manifest, root: RouteOutlet, routes });
```

Route names and path parameters are typed. Calling `router.transitionTo({ name: "note" })` without `id` is a compile error. Each route can also declare:

- `load`, an asynchronous loader whose result reaches the component through `useSynWareRouteData`
- `lazy`, a dynamic import for code splitting
- `query`, a schema built with `routeQuery` for typed search parameters
- `beforeEnter` and `beforeLeave`, guards that can redirect or cancel a transition
- `loadingComponent`, `errorComponent` and `notFoundComponent`
- `children`, for nested routes that render through a nested `RouteOutlet`

## Localisation

Strings live in `Resources/Localised/<locale>.locale/Localisable.strings`, and the manifest's `localeResources` field points at them. `app.locale.t(key)` returns the string for the active locale and falls back to the base locale. The same client formats dates, times, numbers, file sizes, relative times and lists with `Intl`, so an application follows the user's locale without further work.

```tsx
import { useSynWare } from "@syndromatic/syncloudos/sdk";

export function Summary() {
  const { locale } = useSynWare();
  return (
    <p>
      {locale.t("notes.count", { count: 3 })} {locale.formatDate(Date.now(), { dateStyle: "medium" })}{" "}
      {locale.formatFileSize(1_500_000)}
    </p>
  );
}
```

## Persistence

`app.persistence` stores small preferences under your application's identity, so two bundles never see each other's keys.

```tsx
import { useSynWare } from "@syndromatic/syncloudos/sdk";

export function useSortPreference() {
  const { persistence } = useSynWare();
  return {
    sort: persistence.getPreference("sort", "modified"),
    setSort: (value: string) => persistence.setPreference("sort", value),
  };
}
```

For user content, use [documents](documents.md), which add saving, versioning, conflict handling and undo.

## Presentations

The host chooses a presentation, and `app.presentation.getSnapshot()` reports its traits: `horizontalSizeClass` (`"compact"`, `"regular"` or `"wide"`), orientation, safe area insets, the virtual keyboard inset, the primary pointer type, hover and touch support, and the user's reduced motion, reduced transparency and forced colours settings. Build layouts from these traits and NSE's adaptive containers. A bundle that lists `mobile` in its manifest should be usable at a compact size class with a coarse pointer.

## Tooling

A checkout of the framework repository includes three commands for working with bundles:

| Command | What it does |
| --- | --- |
| `npm run synware:create -- <directory> <app-id>` | Scaffolds a bundle with a manifest, a root component and a locale file. Add `--fx animation,graphics` (or any of the twelve FX names) to include a working example for each framework. |
| `npm run synware:validate -- [directory]` | Checks a bundle's manifest against the schema and its imports against the public entries. Without an argument it validates every bundle in the repository. |
| `npm run sdk:build` | Builds the distributable SDK package, one entry for each subpath listed in the [overview](overview.md#the-package). |

## Testing

`@syndromatic/syncloudos/sdk/testing` provides a deterministic host for unit tests. See [Testing a SynWare](testing-synware.md).

## Related guides

- [Manifest reference](synware-manifest.md)
- [Commands, responders and undo](commands-responders-undo.md)
- [Documents](documents.md) and [windows](windows.md)
- [Controllers and models](controllers.md)
- [Webspring](webspring.md), the shell that launches bundles
