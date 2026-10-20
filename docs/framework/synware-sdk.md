# SynWare SDK

A SynWare is an application bundle that runs on SynCloudOS, in the way a `.app` bundle runs on Mac OS X. The bundle carries a manifest, a root component and its resources. The host loads the bundle, validates the manifest and mounts the component inside a session. The SDK, imported from `@syndromatic/syncloudos/sdk`, is everything a bundle needs from the platform.

For host-supplied font catalogues and imported fonts, use `useFonts()`. The [managed fonts guide](managed-fonts.md) shows one Node-safe declaration, early website CSS and preloads, app font pickers, and byte-backed TextFX acquisition.

Production browser hosts choose either `mountSynCloudOS({ element, bundles, shell })`
for Webspring or `mountSynCloudOS({ element, bundles, application: { bundleIdentifier } })` for
one primary application without a shell. The modes are mutually exclusive.
Application-only hosting uses a real SynWare session. The primary application
fills the page (or keeps its declared frame with `frame: "declared"`); other
registered bundles open from it in windows. It supports the same authentication
policies as Webspring, and after the primary quits it offers Reopen instead of
relaunching. See [the application host setup](getting-started.md#mount-one-application)
for Vite configuration, routing, sign-in and disposal.

The host may supply About attribution with `about: { copyright, trademark, tagline }`.
The application's name and version still come from its own Info.ts; without attribution its
About menu item is not shown.

## Anatomy of a bundle

```text
Notes.app/
└── Contents/
    ├── Info.ts                 required identity, display name and version
    ├── index.tsx               component or NSEApplication default export
    └── Resources/
        ├── icon.png
        └── Localised/
            └── Base.locale/
                └── Localisable.strings
```

`Info.ts` declares the required `bundleIdentifier`, `displayName` and app `version`, typed as `SynWareInfo`. Discovery fills schema version, icon and locale resources only. `index.tsx` default-exports your application component or `NSEApplication` subclass. [Getting started](getting-started.md) builds the smallest working bundle.

## Define the application

Default-export a component. The plugin resolves its manifest from the required `Info.ts` and discovered resources; the loader constructs the application definition.

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import { SCOS } from "@syndromatic/syncloudos";
import { NSEStackItem, NSEStackView } from "@syndromatic/syncloudos/nse";

export default function Notes() {
  return (
    <NSEStackView aria-label="Notes" orientation="vertical" spacing={12}>
      <NSEStackItem id="heading" visibilityPriority={100}>
        <h1>{SCOS.strings.t("notes.title", "Notes")}</h1>
      </NSEStackItem>
    </NSEStackView>
  );
}

```

Optional named exports customise the application:

| Member | Purpose |
| --- | --- |
| default export | The component or application class the host mounts inside the session. |
| `routes` | A route graph from `defineSynWareRoutes`, for applications with several screens. |
| `migrations` | Data migrations, each with `fromVersion`, `toVersion` and a `migrate(value, { signal })` function. |
| `windowChrome` | A component that draws the title bar when `windowDefaults.chrome` is `"custom"`. |
| `createBackgroundHandler` | A factory for the handler that runs the background tasks the manifest declares. |
| `rematerialiseOwnedDocument` | Restores an app-owned document projection when rematerialising it. |

`createSynWare` is not a production authoring export. Test hosts may import it from `sdk/testing` when constructing definitions explicitly.

## Class-app API reference

See [Applications](applications.md) for the complete class tree and ownership rules.

| API | Contract and example |
| --- | --- |
| `SCOS.routes.state(graph, name)` | Typed `{ getQuery, subscribe, pushQuery, replaceQuery, createUrl }`; `SCOS.routes.state(routes, "catalogue").pushQuery({ page: 2 })`. |
| `SCOS.routes.isActive(graph, target, { exact? }?)` | Tests the canonical committed route; `SCOS.routes.isActive(routes, { name: "catalogue" })`. |
| `SCOS.routes.subscribe(listener)` | Observes committed routing changes; returns a disposer. |
| `SCOS.fonts` | The font-access client, including `.manager` and `.loadFace(...)`; the configured host catalogue is available during `applicationDidFinishLaunching` and stays the same when the view mounts. |
| `SCOS.menus.runtime` | Scoped NSE menu runtime for controller construction; `new NSEToolbarController({ owner: this, configuration, items, preferences, runtime: SCOS.menus.runtime })`. |
| `NSEViewController.traitCollection` | `{ reducedMotion, presentation }`; presentation is `SynCloudOSPresentationTraits` or `null`. Override `traitCollectionDidChange(previous)` to react. |
| `NSEViewController.viewWillLayout()` / `viewDidLayout()` | Called after DOM commits and on frame resize. `this.view.element.getBoundingClientRect()` reads the committed view. |
| `NSEApplication.openWindow(Controller, options?)` | Returns `Promise<Controller>`; options include title, width, height, documentId, restorationKey, mobilePolicy and explicit/centred/cascaded preferredBounds. |
| `SCOS.commands.subscribePresentation(listener)` | Returns a disposer; invalidates command presentation after registry, responder or focus changes and stops with the app scope. |
| `NSEApplication.windowControllers` | Static name-to-class declaration for cold restoration, such as `{ detachedNote: DetachedNoteWindow }`; recreated controllers receive their original `openingOptions`. |
| `@action(options)` | Adds `menuCategory`, `keyBindings`, `allowReservedBrowserShortcut` to the title/id/payload declaration, with ordinary command semantics. |
| `useAction(name, payload?)` | `{ perform(payload?: unknown): Promise<CommandDispatchResult \| null>, enabled, state }`; no argument uses the bound payload, while an event-time argument gets fresh validation through responders and `validateX`. NSE segmented, popup/picker and cover-flow controls accept `action`/`actionPayload`. |
| `createSynWareTestHost({ application, manifest, services? })` | Launches a class app; `host.application.windows` exposes controllers. `services: [[token, client]]` registers real typed app clients. `host.persistence` is the app's preference store. |
| `createSynWareTestHost({ diagnostics: provider })` | Host-only `AppTrustedDiagnosticsClient` provision, still requiring `diagnostics.view`; use `host.diagnostics.replace(provider)` or `.revoke()` to change authority and abort old work. |
| `host.mediaQueries.setMatches(query, matches)` | Controls the test environment's real media queries. Set initial matches before rendering; for live frame-coalesced changes call `host.clock.advance(16)` inside `act`. |
| `NSEPopup` | Omitting `parentResponderId` inherits the nearest class controller. Child controllers inside its portal join its focus scope, so modal focus containment and ancestor action lookup both hold. |
| `SynWareIntegrationInput.applicationDocuments` | A configuration or `(environment) => configuration \| Promise<configuration>`; construct recovery storage with the injected environment. Installation receives scoped clock/timer ports as `context.environment`. |
| `WebspringWidgetViewProps.navigate(route)` | `Promise<ActionResult>` from shell navigation. Prevent a link's default navigation, then call `navigate("/notes/latest")`. |

`SCOS` is established before application launch callbacks, not by the first React render.
Every controller accepts an ambient owner or `owner: this` and is disposed with that owner;
late unowned construction in class applications throws `NSE_CONTROLLER_UNOWNED`.
Text editing distinguishes its content authority, `textOwner`, from its lifecycle `owner`.
Action controls and `useAction` follow registry, focus and observable responder changes. They retry
stale asynchronous validation instead of leaving a control disabled after another view registers commands.

## SCOS

Inside a `<Name>.app` folder, import `SCOS` from `@syndromatic/syncloudos`. The project
plugin binds that import to the app's bundle identifier. Each operation resolves its running
session at call time, including after `await`, in timers and after a remount.

```ts
import { SCOS } from "@syndromatic/syncloudos";

SCOS.preferences.set("theme", "paper");
const theme = SCOS.preferences.get("theme", "plain");
SCOS.preferences.remove("theme");
await SCOS.open("com.example.journal"); // bundle identifier, or an absolute route
const choice = await SCOS.alert({
  title: "Discard changes?",
  message: "Your unsaved changes will be lost.",
  buttons: [
    { id: "discard", label: "Discard", role: "destructive" },
    { id: "cancel", label: "Cancel", role: "cancel" },
  ],
});
if (choice === "discard") SCOS.close();
```

`SCOS.app` contains `bundleIdentifier`, `displayName` and `version`. Identity case is preserved in public metadata, while lookup and storage keys are case-insensitive. The facade also exposes the mounted
clients: windows, documents, undo, commands, persistence, notifications, appearance,
locale, strings, scheduler, navigation, pasteboards, services and sharing. Other scoped
clients remain available for existing capability hooks; FX types stay separate imports,
not a namespace under `SCOS`. `preferences.get/set/remove` uses the same store as
`persistence.getPreference/setPreference/removePreference`.

Alerts are queued by the kernel and presented by the host through `NSEAlert`. Each call
returns its own promise resolving to the chosen button ID. Omitting buttons gives an
`ok` button. Escape, safe dismissal, caller abort and closing the owner resolve to its
cancel button (or the last button if none is marked cancel). Closing an app also cancels
its queued alerts. `close()` requests the existing lifecycle close; it does not bypass
close guards.

Shared React components outside app folders call `useSCOS()`, which selects the nearest
app provider even if several runtimes mount the same app. Hooks such as `useStrings()`
and `useAppearance()` remain the way to subscribe to changing values; reading `SCOS`
does not subscribe a component.

| Error | Meaning and correction |
| --- | --- |
| `SCOS_APP_NOT_RUNNING` | Start the app before using its bound facade. |
| `SCOS_AMBIGUOUS_SESSION` | Several runtimes mount that app; select the provider with `useSCOS()`. |
| `SCOS_UNBOUND` | The error names the calling file. Move the import into an app folder or use `useSCOS()` in a shared component. |
| `SCOS_APP_NOT_FOUND` | `open()` cannot find that bundle identifier; check the catalogue or pass an absolute route. |

### Shared components

The host mounts your root component inside a session. `useSCOS()` returns its scoped facade:

```tsx
import { useSCOS } from "@syndromatic/syncloudos";

export function SessionTour() {
  const app = useSCOS();

  app.app.bundleIdentifier; // "com.example.notes"
  app.signal;         // aborts when the application closes
  app.presentation;   // traits of the current surface
  app.commands;       // dispatch and validate commands
  app.documents;      // documents and their resources
  app.windows;        // windows this application owns
  app.undo;           // undo histories
  app.locale;         // formatting and translation
  app.preferences;    // per-application preferences
  app.services;       // optional host services
  return null;
}
```

The session is scoped to your application. Preferences, documents and windows you touch belong to your bundle, and the host enforces that boundary. Pass `app.signal` to fetches and timers so they stop when the user closes the application.

### Hooks

Hooks give each client a React shape, subscribing to changes and releasing resources when the component unmounts. They also read better than reaching into the session object.

| Area | Hooks |
| --- | --- |
| Session | `useSCOS`, `useLifecycle`, `useEvents`, `useErrors` |
| Commands | `useCommands`, `useApplicationMenuTrigger`, `useQuickSwitchTrigger` |
| Documents and windows | `useDocument`, `useWindow`, `useWindowChrome`, `useWorkArea`, `useWorkAreaSnapshot` |
| Routing | `useRouter`, `useRouteData`, `useRouteState` |
| Data and identity | `usePersistence`, `useIdentity`, `useIdentitySnapshot`, `useScheduler` |
| Environment | `useMediaQuery`, `useMediaQueries`, `useConnectivity`, `useAppearance`, `useSettingsAvailability` |
| Outward actions | `useNotifications`, `useShare`, `useExternalActions`, `usePasteboard`, `useDrag` |
| Text and colour | `useStrings`, `useTextLayout`, `useColourPanel` |
| FX | `useAnimations`, `useImages`, `useAudio`, `useHaptics`, `useMotion`, `useMedia`, `useVideo`, `useMIDI`, `useLocation`, `useLumina` |
| Web content | `useWebContent` |
| Host services | `useService` |

## Commands

Commands turn user intent into named, validated operations. A menu item, a key binding and a toolbar button can all dispatch the same command, and each one enables and disables together because they share the command's `validate` function.

```tsx
import { useSCOS, useCommands } from "@syndromatic/syncloudos/sdk";

function NotesCommands({ onAdd, canAdd }: { onAdd(): void; canAdd: boolean }) {
  const commands = useCommands([
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

`useCommands` registers the definitions when the component mounts and removes them when it unmounts. A command may also carry an `undo` policy that registers an undo action for each execution. The [commands, responders and undo guide](commands-responders-undo.md) describes dispatch, validation, key bindings and undo in full.

## Services

Some capabilities come from the host and vary between deployments. A service token names one of them. `useService` returns a result object instead of throwing, so your interface can handle a missing service directly.

```tsx
import { defineSynWareServiceToken, useService } from "@syndromatic/syncloudos/sdk";

interface ExportClient {
  exportAsPdf(id: string): Promise<Blob>;
}

const exportToken = defineSynWareServiceToken<ExportClient>({ id: "com.example.export" });

function ExportButton({ id }: { id: string }) {
  const service = useService(exportToken);
  if (!service.available) return <p>{service.denial?.message}</p>;
  return <button onClick={() => void service.client?.exportAsPdf(id)}>Export</button>;
}
```

`denial.code` is `"unavailable"` when the host offers no such service and `"denied"` when the host's policy refuses your application. Declare the services your application depends on in the manifest `services` list, and request the matching `permissions`. Code that prefers an exception can call `app.services.require(token)`, which throws `SynWareServiceAcquisitionError` with the same denial attached.

## Routes

An application with one screen needs only its default component. An application with several screens describes them as a named route graph.

```tsx
import { defineSynWareRoutes, RouteOutlet, useRouter } from "@syndromatic/syncloudos/sdk";

function NoteList() {
  const router = useRouter(routes);
  return <button onClick={() => router.transitionTo({ name: "note", params: { id: "welcome" } })}>Open</button>;
}

function NoteDetail() {
  return <p>A note.</p>;
}

export const routes = defineSynWareRoutes({
  id: "com.example.notes.routes",
  routes: [
    { name: "list", path: "notes", component: NoteList },
    { name: "note", path: "notes/:id", component: NoteDetail },
  ],
});

export default RouteOutlet;
```

Route names and path parameters are typed. Calling `router.transitionTo({ name: "note" })` without `id` is a compile error. Each route can also declare:

- `load`, an asynchronous loader whose result reaches the component through `useRouteData`
- `lazy`, a dynamic import for code splitting
- `query`, a schema built with `routeQuery` for typed search parameters
- `beforeEnter` and `beforeLeave`, guards that can redirect or cancel a transition
- `loadingComponent`, `errorComponent` and `notFoundComponent`
- `children`, for nested routes that render through a nested `RouteOutlet`

## Localisation

Strings live in `Resources/Localised/<locale>.locale/*.strings`; discovery supplies every file without a manifest field. `SCOS.strings.t(key, fallback)` returns the string for the active locale with its fallback. The locale client also formats dates, times, numbers, file sizes, relative times and lists with `Intl`.

```tsx
import { useSCOS } from "@syndromatic/syncloudos/sdk";

export function Summary() {
  const { locale } = useSCOS();
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
import { useSCOS } from "@syndromatic/syncloudos/sdk";

export function useSortPreference() {
  const { persistence } = useSCOS();
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
