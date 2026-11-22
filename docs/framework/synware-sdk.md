# SynWare SDK

A SynWare is an application bundle that runs on SynCloudOS. The bundle carries a manifest, a root component or application class, and its resources. The host loads the bundle, validates the manifest and mounts the application inside a session. The SDK (`@syndromatic/syncloudos/sdk`, with the most common pieces also on the package root) is everything a bundle needs from the platform.

For host-supplied font catalogues and imported fonts, use `useFonts()` (or `SCOS.fonts` in a controller). The [managed fonts guide](managed-fonts.md) covers the shared font declaration, early website CSS and preloads, app font pickers and loading font bytes for TextFX.

A production browser host uses either `mountSynCloudOS({ element, bundles, shell })`
for Webspring or `mountSynCloudOS({ element, bundles, application: { bundleIdentifier } })` for
one primary application without a shell, never both.
Application-only hosting still runs a real SynWare session. The primary application
fills the page (or keeps its declared frame with `frame: "declared"`), and other
registered bundles open from it in windows. It supports the same authentication
policies as Webspring, and when the primary quits it offers Reopen instead of
relaunching it. See [the application host setup](getting-started.md#mount-one-application)
for Vite configuration, routing, sign-in and disposal.

The host can supply About attribution with `about: { copyright, trademark, tagline }`.
The application's name and version still come from its own `Info.ts`. Without attribution, the
About menu item isn't shown.

The `synCloudOS()` Vite plugin keeps the SDK and all its subpaths out of dependency
pre-bundling, so attributed FX classes and mounted sessions share one module graph.
If your configuration explicitly includes SDK entries, the plugin removes them and logs a warning naming them; entries for other libraries stay.
The plugin does pre-bundle the SDK's CommonJS React peers: `react`,
`react-dom`, `react-dom/client` and `react/jsx-runtime`.
Other dependencies are optimised as usual. Keep this configuration
during development, because a second copy of the SDK would have its own session registry.

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

`Info.ts` declares the required `bundleIdentifier`, `displayName` and app `version`, typed as `SynWareInfo`. Discovery fills in only the schema version, the icon and the locale resources. `index.tsx` default-exports your `NSEApplication` subclass or application component. [Getting started](getting-started.md) builds the smallest working bundle.

## Define the application

The smallest application default-exports a component. (Most applications default-export an `NSEApplication` subclass instead; see [Applications](applications.md).) The plugin resolves the manifest from `Info.ts` and the discovered resources, and the loader builds the application definition.

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
| default export | The application class or component the host mounts inside the session. |
| `routes` | A route graph from `defineSynWareRoutes`, for applications with several screens. |
| `migrations` | Data migrations, each with `fromVersion`, `toVersion` and a `migrate(value, { signal })` function. |
| `createBackgroundHandler` | A factory for the handler that runs the background tasks the manifest declares. |
| `rematerialiseOwnedDocument` | Restores an app-owned document projection when rematerialising it. |

`createSynWare` isn't part of production authoring. Test hosts can import it from `sdk/testing` to build definitions explicitly.

## Class-app API reference

See [Applications](applications.md) for the complete class tree and ownership rules.

| API | Contract and example |
| --- | --- |
| `SCOS.routes.state(graph, name)` | Typed `{ getQuery, subscribe, pushQuery, replaceQuery, createUrl }`; `SCOS.routes.state(routes, "catalogue").pushQuery({ page: 2 })`. |
| `SCOS.routes.isActive(graph, target, { exact? }?)` | Tests the canonical committed route; `SCOS.routes.isActive(routes, { name: "catalogue" })`. |
| `SCOS.routes.subscribe(listener)` | Observes committed routing changes; returns a disposer. |
| `SCOS.fonts` | The font-access client, including `.manager` and `.loadFace(...)`; the configured host catalogue is available during `applicationDidFinishLaunching` and stays the same when the view mounts. |
| `SCOS.menus.runtime` | Scoped NSE menu runtime for controller construction; `new NSEMenu({ owner: this, identifier, title, items, runtime: SCOS.menus.runtime })`. |
| `NSEViewController.traitCollection` | `{ reducedMotion, presentation }`; presentation is `SynCloudOSPresentationTraits` or `null`. Override `traitCollectionDidChange(previous)` to react. |
| `NSEViewController.viewWillLayout()` / `viewDidLayout()` | Called after DOM commits and on frame resize. `this.view.element.getBoundingClientRect()` reads the committed view. |
| `controller.view` (`<child.view className? />`) | Renders the controller's managed outlet. `className` gives the parent CSS control over its layout; child outlets set no inline display mode or dimensions. |
| `NSEApplication.openWindow(Controller, options?)` | Returns `Promise<Controller>`; options include title, width, height, documentId, restorationKey, mobilePolicy and explicit/centred/cascaded preferredBounds. |
| `SCOS.commands.subscribePresentation(listener)` | Returns a disposer; invalidates command presentation after registry, responder or focus changes and stops with the app scope. |
| `SCOS.commands.createPayload("key", value, ...)` / `.createPayloadArray(value, ...)` | Construct immutable command records and arrays from primitives and nested values built by the same mounted scope. Use explicit known fields; arbitrary raw nested objects are rejected. |
| `NSEApplication.windowControllers` | Static name-to-class declaration for cold restoration, such as `{ detachedNote: DetachedNoteWindow }`; recreated controllers receive their original `openingOptions`. |
| `@action(options)` | `NSEActionOptions<Payload>.title` accepts a string, localised title record or the ordinary typed command title resolver; payload-dependent titles preserve validator overrides. `menuCategory`, `keyBindings` and `allowReservedBrowserShortcut` keep ordinary command semantics. |
| `useAction(name, payload?)` | `{ perform(payload?: unknown): Promise<CommandDispatchResult \| null>, enabled, state }`; no argument uses the bound payload, while an event-time argument gets fresh validation through responders and `validateX`. `NSEButton`, `NSESegmentedControl`, `NSEPopUpButton`, `NSEPathControl` and `NSEMenu` items accept `action`/`actionPayload`. |
| `createSynWareTestHost({ application, manifest, services? })` | Launches a class app; `host.application.windows` exposes controllers. `services: [[token, client]]` registers real typed app clients. `host.persistence` is the app's preference store. |
| `createSynWareTestHost({ applicationDocuments })` | `SynWareTestApplicationDocumentsConfiguration` supplies production `initialTypes`, `initialAdapters`, `recoveryStore` and `assetBacking`, plus explicitly trusted seed kinds and a pre-launch installer. `SynWareTestDocumentInstallContext` exposes only scoped `documents`, `seed`, `environment` and `signal`; manifest admission still applies. See [trusted document provision](testing-synware.md#trusted-document-provision). |
| `createSynWareTestHost({ diagnostics: provider })` | Host-only `AppTrustedDiagnosticsClient` provision, still requiring `diagnostics.view`; use `host.diagnostics.replace(provider)` or `.revoke()` to change authority and abort old work. |
| `host.mediaQueries.setMatches(query, matches)` | Controls the test environment's real media queries. Set initial matches before rendering; for live frame-coalesced changes call `host.clock.advance(16)` inside `act`. |
| `NSEPopup` | Omitting `parentResponderId` inherits the nearest class controller. Child controllers inside its portal join its focus scope, so modal focus containment and ancestor action lookup both hold. |
| `SynWareIntegrationInput.applicationDocuments` | A configuration or `(environment) => configuration \| Promise<configuration>`; construct recovery storage with the injected environment. Installation receives scoped clock/timer ports as `context.environment`. |
| `WSWidget.navigate(route)` | `Promise<WSActionResult>` from shell navigation. Prevent a link's default navigation, then call `this.navigate("/notes/latest")`. |

`SCOS` is ready before the application's launch callbacks run, not only after the first React render.
Every controller takes its owner from the object constructing it, or from `owner: this`, and is disposed with that owner;
constructing one later without an owner in a class application throws `NSE_CONTROLLER_UNOWNED`.
In text editing, `textOwner` owns the content and `owner` owns the lifetime.
Action controls and `useAction` follow changes to the command registry, focus and observable responders, and they re-run
stale asynchronous validation, so a control doesn't stay disabled after another view registers its commands.

### Portable action payloads

`@action`, `useAction`, command dispatch and a control's `actionPayload` all check payloads the same way.
Use a primitive when you can, or build a record in the running app:

```tsx
const openNote = useAction("openNote", SCOS.commands.createPayload("id", note.id));
const selectNote = useAction("selectNote");
return <NoteList onSelectionChange={id => {
  void selectNote.perform(SCOS.commands.createPayload("id", id));
}} />;
```

For nested data, pass `SCOS.commands.createPayloadArray(...)` and nested `createPayload(...)`
results built in the same running app. A record takes alternating string keys and values; each key must
be a unique identifier that starts with a letter, and every key needs a value. Raw objects are
accepted only when the host supplies a native `isProxy` identity probe; browser hosts without
one reject arbitrary objects without reading their properties. The builders don't serialise
objects for you, and serialising, cloning, spreading or enumerating an
unknown object doesn't make it safe.

DOM nodes, `File` or `File[]` and functions belong in outlets or domain callbacks, not command
payloads. You can also send a primitive descriptor for the owning controller to resolve.

## SCOS

`SCOS` is the application's handle on the platform. Inside a `<Name>.app` folder, import it from `@syndromatic/syncloudos`; the project
plugin binds that import to the app's bundle identifier. Each call finds the running
session when it's made, so it works after `await`, in timers and after a remount.

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

`SCOS.app` contains `bundleIdentifier`, `displayName` and `version`. Public metadata keeps the identifier's case; lookups and storage keys ignore it. `SCOS` also exposes `signal` and the mounted clients: `windows`, `documents`, `undo`, `commands`, `preferences`, `persistence`, `notifications`, `appearance`, `locale`, `strings`, `scheduler`, `navigation`, `pasteboards`, `services`, `share`, `storageDiagnostics`, `routes`, `fonts` and `menus`. It also forwards every other client of the mounted application, such as `errors`, `branding`, `lifecycle`, `filePanels`, `mediaQueries`, `haptics`, `location`, `media`, `webContent` and `trusted`; most of these also have a hook. FX types are separate imports, not a namespace under `SCOS`. `preferences.get/set/remove` uses the same store as
`persistence.getPreference/setPreference/removePreference`.

The runtime queues alerts and the host's alert presenter draws them; apps usually present them with an `NSEAlert` (see [Alerts and sheets](windows.md#alerts-and-sheets)). Each call
returns its own promise, which resolves to the chosen button's ID. Without buttons you get an
`ok` button. Escape, a safe dismissal, aborting the call and closing the owner all resolve to the
cancel button (or the last button if none has the cancel role). Closing an app also cancels
its queued alerts. `close()` asks for a normal lifecycle close, so close guards still run.

Shared React components outside app folders call `useSCOS()`, which picks the nearest
app provider even if several runtimes mount the same app. To re-render when values change, use hooks such as `useStrings()`
and `useAppearance()`; reading `SCOS` doesn't subscribe a component.

| Error | Meaning and correction |
| --- | --- |
| `SCOS_APP_NOT_RUNNING` | Start the app before using its bound facade. |
| `SCOS_AMBIGUOUS_SESSION` | Several runtimes mount that app; select the provider with `useSCOS()`. |
| `SCOS_UNBOUND` | The error names the calling file. Move the import into an app folder or use `useSCOS()` in a shared component. |
| `SCOS_APP_NOT_FOUND` | `open()` cannot find that bundle identifier; check the catalogue or pass an absolute route. |

### Shared components

The host mounts your application inside a session, and `useSCOS()` returns that session's scoped facade:

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

The session is scoped to your application. The preferences, documents and windows you touch belong to your bundle, and the host enforces that. Pass `app.signal` to fetches and timers so they stop when the user closes the application.

### Hooks

Hooks wrap each client for React: they subscribe to changes and release resources when the component unmounts.

| Area | Hooks |
| --- | --- |
| Session | `useSCOS`, `useLifecycle`, `useEvents`, `useErrors`, `useTracking` |
| Commands and menus | `useCommands`, `useAction`, `useQuickSwitchTrigger`, `useApplicationMenuTrigger`, `useNSEMenuPort` |
| Documents and windows | `useDocument`, `useNSEWindow`, `useNSEApplication`, `useWorkArea`, `useWorkAreaSnapshot` |
| Routing | `useRouter`, `useRouteData`, `useRouteState` |
| Data and identity | `usePersistence`, `useIdentity`, `useIdentitySnapshot`, `useScheduler`, `useNSEBinding` |
| Environment | `useMediaQuery`, `useMediaQueries`, `useConnectivity`, `useAppearance`, `useSettingsAvailability`, `useSettingsAvailabilitySnapshot` |
| Outward actions | `useNotifications`, `useShare`, `useExternalActions`, `usePasteboard`, `useDrag`, `useFilePanels` |
| Text, fonts and colour | `useStrings`, `useTextLayout`, `useFonts`, `useColourPanel` |
| FX | `useAnimations`, `useImages`, `useTextLayout`, `useAudio`, `useHaptics`, `useMotion`, `useMedia`, `useVideo`, `useVideoPresentation`, `useMIDI`, `useBluetooth`, `useNFC`, `useSpeech`, `useSpeechSynthesizer`, `useContacts`, `usePayment`, `useXR`, `useLocation`, `useNetwork`, `useLumina` |
| Web content | `useWebContent` |
| Host services | `useService`, `useTrustedClient` |

## Commands

Commands turn user intent into named, validated operations. A menu item, a key binding and a toolbar button can all dispatch the same command, and they enable and disable together because they share its `validate` function. Class-based apps declare commands with `@action` (see [Applications](applications.md#actions-and-validation)); function components use `useCommands`.

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

Some capabilities come from the host and vary between deployments. A service token names one of them. `useService` returns a result object instead of throwing, so your interface can show what to do when a service is missing.

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

`denial.code` is `"unavailable"` when the host offers no such service and `"denied"` when the host's policy refuses your application. Declare the services your application depends on in the manifest's `services` list and request the matching `entitlements`. If you'd rather have an exception, call `app.services.require(token)`, which throws `SynWareServiceAcquisitionError` with the same denial attached.

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

Strings live in `Resources/Localised/<locale>.locale/*.strings`, and discovery picks up every file without a manifest field. `SCOS.strings.t(key, fallback)` returns the string for the active locale, or the fallback. The locale client also formats dates, times, numbers, file sizes, relative times and lists with `Intl`.

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

The host chooses a presentation, and `app.presentation.getSnapshot()` reports its traits: `horizontalSizeClass` (`"compact"`, `"regular"` or `"wide"`), orientation, safe area insets, the virtual keyboard inset, the primary pointer type, hover and touch support, and the user's reduced motion, reduced transparency and forced colours settings. Build layouts from these traits and NSE's adaptive containers. If your manifest lists `mobile`, the app must be usable at a compact size class with a coarse pointer.

## Tooling

A checkout of the framework repository has three commands for working with bundles:

| Command | What it does |
| --- | --- |
| `npm run synware:create -- <target>` | Scaffolds a `.app`, `.prefPane`, `.widget`, `.integration.ts` or `Webspring` target. For `.app` bundles, add `--organisation com.example`, `--authoring separate\|inline\|function`, `--application-menu-toolbar`, or `--fx animation,graphics` (chosen from the thirteen FX recipes: `animation`, `graphics`, `image`, `text`, `audio`, `haptics`, `motion`, `media`, `video`, `midi`, `location`, `lumina`, `compression`). |
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
