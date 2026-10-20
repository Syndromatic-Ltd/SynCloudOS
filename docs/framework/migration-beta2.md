# Migrating to 1.0.0-beta.2

Beta.2 is a breaking application-authoring release. It introduces folder discovery, the app-bound `SCOS` facade and AppKit-style application, window and view controllers. Function-component apps remain supported. There are no aliases for the removed identity fields, hooks or content-source API.

This checkout builds the beta.2 candidate; it is not a claim that beta.2 has been published. Install the SDK archive and matching Developer MCP archive from the same build. Their receipts identify the commit and source fingerprint. See [Getting started](getting-started.md) for installation.

## 1. Give every application one explicit identity

`Name.app/Contents/Info.ts` is required. The folder names the package, not its runtime identity. Declare `bundleIdentifier`, `displayName` and `version`; none is inferred from the host's package version.

Before:

```ts
export default {
  schemaVersion: 1,
  id: "notes",
  title: "Notes",
  version: "1.0.0",
  runtime: { bundleId: "com.example.notes", policy: { public: true } },
};
```

After:

```ts
import type { SynWareInfo } from "@syndromatic/syncloudos";

export default {
  bundleIdentifier: "com.Example.Notes",
  displayName: "Notes",
  version: "1.0.0",
  runtime: { policy: { public: true } },
} as const satisfies SynWareInfo;
```

Reverse-DNS identifiers allow mixed case. Public metadata preserves the authored spelling; lookup, ownership comparisons and storage partitions are case-insensitive. Case-equivalent identifiers cannot identify two different apps. `Notes.app` may therefore declare `com.Example.Notes` without renaming its folder.

| Before | After |
| --- | --- |
| `id` and `runtime.bundleId` | One top-level `bundleIdentifier` |
| Manifest `title` | `displayName` |
| `SynWareManifestOverrides` | `SynWareInfo` |
| `SCOS.app.id` / `.title` | `SCOS.app.bundleIdentifier` / `.displayName` |
| `application: { id: "notes" }` | `application: { bundleIdentifier: "com.Example.Notes" }` |
| Short app IDs in service, document, route-owner and integration declarations | The same canonical bundle identifier |
| App version inherited from the project package | Explicit application `version` |
| `localeResources` in `Info.ts` | Discovered `Resources/Localised/<locale>.locale/*.strings` |

Do not rename unrelated document IDs, route names, collection IDs or window titles. Update app-scoped command IDs and persisted ownership references that actually contain the old application identity. See the [manifest reference](synware-manifest.md).

### Saved data is reset, not migrated

Use a fresh persistence namespace for the cutover. Old identity-owned documents must not be imported as new-owner documents or granted wider seed authority. Webspring uses layout version 5 (`webspring.layout.v5`); the old layout is not migrated. Do not retain old-ID aliases or fallbacks.

## 2. Let the plugin discover the project

Conventional locations are `src/SynWare/Name.app/Contents/`, `src/Preferences/Name.prefPane/`, `src/Widgets/Name.widget/` and `src/Integrations/Name.integration.ts`. Configure different roots through the Vite plugin when necessary.

A function application no longer wraps its root in public `createSynWare`:

```tsx
// Before
export default createSynWare({ manifest, root: NotesView, routes: notesRoutes });
```

```tsx
// After: Info.ts supplies the manifest.
export const routes = notesRoutes;
export default NotesView;
```

An application class instead declares `static routes = notesRoutes`. **Do not also export named `routes` from that module.** Class and named-module declarations of the same lifecycle field are rejected, rather than merged.

`mountSynCloudOS` consumes `virtual:syncloudos/project` when no explicit composition is supplied. Remove duplicate hand-written app, preference, widget and integration registries. The generated `shellResources` contains the shell's resource URLs and localised strings:

```tsx
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { shellResources } from "virtual:syncloudos/project";
import shell from "./Webspring/Contents";

const element = document.getElementById("root");
if (!element) throw new Error("Missing application root.");
await mountSynCloudOS({ element, shell, shellResources });
```

Do not replace that resource map with a whitelist of branding images: doing so also removes resources used by widgets and preferences. Custom host composition remains available for hosts without discovery. See [Project structure](project-structure.md).

## 3. Replace the old hooks and imports

Application authoring has a root entry, `@syndromatic/syncloudos`. NSE and FX keep their own entries; importing the root does not turn `SCOS` into a namespace for every framework.

| Before | After |
| --- | --- |
| `useSynWare()` | App-bound `SCOS`, or `useSCOS()` in shared React components |
| `useSynWareLocalisedStrings("notes")` | `useStrings()`; no hand-written app identity |
| `useSynWareAppearance()` | `useAppearance()` |
| Other `useSynWare…` hooks | Their unprefixed public names, such as `useCommands`, `useRouter`, `useAnimations` and `useApplicationMenuTrigger` |
| An invented `/testing` package entry | The public `@syndromatic/syncloudos/sdk/testing` entry |

`SCOS` imports inside an app folder are bound by the plugin and remain valid after `await` and in callbacks while the app is live. Shared components use `useSCOS()` to choose their nearest mounted provider. Merely reading `SCOS` does not subscribe a React component; use reactive hooks or observable controller state for values that change.

Controller code uses `SCOS.routes.state(graph, name)`, `SCOS.routes.isActive(...)`, `SCOS.fonts.manager` and `SCOS.menus.runtime` instead of React bridge components. View-controller presentation and reduced-motion changes arrive through `traitCollection` and `traitCollectionDidChange`. See the [SDK reference](synware-sdk.md).

## 4. Move responsibilities into real application classes

A class app default-exports an `NSEApplication` subclass, with `static mainWindow`. Its window controller can render `static view`, or own a `contentViewController`. View controllers own their child controllers and publish state through `@observable` accessors. React components remain the views; renaming a large function component without moving its state, actions and lifecycle is not this migration.

| Responsibility | Class API |
| --- | --- |
| App launch, active state and termination veto | `NSEApplication` lifecycle methods |
| Window title, key state, close decision and document | `NSEWindowController` and `window` |
| Appearance, subscriptions and layout | `NSEViewController` lifecycle and `viewWillLayout` / `viewDidLayout` |
| Child controller containment | `addChild` / `removeFromParent`, rendered with `NSEViewControllerView` |
| Changing controller state | `@observable accessor` |
| Read another model/controller in a view | `useObserve(object)` |
| User intent and availability | `@action` and `validate<Name>` |

Controller views already observe their own controller. If action validation depends on changing external model state, subscribe during the controller's lifecycle and publish its actual model snapshot as observable state; a view-only subscription does not invalidate the controller's action presentations.

Controllers created in class field initialisers or constructors inherit ownership. Controllers created later, including after `await`, need an explicit `owner: this`. Dispose subscriptions in the corresponding disappearance/disposal lifecycle; do not reintroduce React bridges or hand-dispose a controller that the class already owns. Text editing's content authority is now `textOwner`; `owner` means lifetime ownership.

Child view-controller frames no longer impose `width: 100%; height: 100%`. The parent owns layout. Pass `className` to `NSEViewControllerView` to style its existing managed outlet—for example, a flex-growing canvas beside fixed-width sidebars. Keep that real frame for layer bounds and lifecycle; remove internal-attribute selectors and `display: contents` workarounds. See [Applications](applications.md) for complete layout examples.

### Actions retain command security

Bind NSE controls with `action` / `actionPayload`. Custom views use `useAction(name, boundPayload?)`, then `.perform(eventPayload)` for an event-time value. Validation and execution still follow the canonical responder chain, including modal scopes.

```tsx
const openNote = useAction("openNote");
return <button onClick={() => { void openNote.perform(note.id); }}>Open note</button>;
```

Use a primitive ID where possible. Multi-field payloads must be explicitly built from known fields with the mounted scope's `SCOS.commands.createPayload("id", note.id, "title", title)`; nested records/arrays use the same scope's builders. Browser hosts cannot safely accept arbitrary objects without a native proxy-identity probe. Do not spread, enumerate or serialise unknown objects to bypass that boundary.

Files, DOM elements, functions, abort signals and controller instances are not action payloads. Resolve owned models by ID inside the controller; keep DOM elements as outlets and file imports as domain-method inputs. `@action` title resolvers, key bindings, menu categories and validator overrides retain ordinary command semantics.

### Secondary windows must be real windows

Use `app.openWindow(DetachedWindow, { documentId, restorationKey, ... })` and declare `static windowControllers = { detachedNote: DetachedWindow }` for cold restoration. Do not keep an old React window registry beside the class registry. Verify rendered content, focus, closing and restoration; an entry in the window list alone does not prove a visible window.

The registry makes saved windows reconstructible; it does not enable persistence by itself. The host must explicitly save and restore its workspace. Do not add automatic browser-reload restoration while migrating an app whose host did not previously request it.

## 5. Preserve effects through the FX APIs

A new `AFXLayer()` is detached. Add it to an attached controller `view.layer` with `addSublayer`; the parent supplies its surface and scheduler. Writes before attachment are retained. Reading `view.layer` before the view loads, or after it unmounts, throws `NSE_VIEW_NOT_LOADED`.

```ts
const highlight = new AFXLayer();
this.view.layer.addSublayer(highlight);
```

Hosts that genuinely build rendering surfaces use `createAFXLayer(surface, scheduler)` from `@syndromatic/syncloudos/sdk/animation-host`, not the former public surface/scheduler constructor. Retain existing AFX/GFX particle fields, paths, imagery and reduced-motion behaviour when moving app lifecycle code. CSS replacements are not required by the class API. See [AnimationFX](fx/animation.md) and [GraphicsFX](fx/graphics.md).

## 6. Replace implicit shell styling and content sources

| Before | After |
| --- | --- |
| Brushed metal, paper and glow built into the default Board | Generic cotton/spotlight defaults; declare site-owned `background.launcher` and `.shelf` surfaces to retain a custom look |
| `content`, `contentSources`, `registerContentSource` and `LowerContentShelfView` | `defineWidget` and `WebspringWidgetShelf` |
| An always-present loading shelf | No widgets means no shelf; each widget declares empty behaviour and has bounded loading/error/retry states |
| `frame.layout: "simple"` or `"defacto"` | Removed; content is full-bleed in the app frame |
| A hard-coded cotton app body | `frame.background`, default `"system"`; use an explicit surface to retain cotton or `"none"` for app-drawn content |
| Hard-coded return artwork | `branding.homeIcon`, or the generic house glyph |
| `frame.rightSlot` defaulting to `"userInfo"` | `"auto"`; explicit `"userInfo"`, `"none"` and custom artwork remain choices |
| A generic "Preferences" system entry | "System Preferences…", distinct from an app's own preferences |
| Private preference-pane registration | `definePreferencePane` and discovered `.prefPane` folders |

A widget owns its feed and React view; the generic shelf supplies loading, empty, error, timeout and retry handling. Use its supplied `navigate(route)` for normal in-shell navigation, retaining an anchor's `href` for modified clicks. Resource paths such as a widget's `icon` resolve through the shell's generated Resources map. Site-specific News titles, fonts, artwork and layout belong to the site, not the framework.

Integrations declare their actual application owners. Owner matching is case-insensitive; selected applications constrain installation and seed authority. Use `applicationDocuments(environment)` when construction needs the host clock, timers or recovery-store environment. Do not replace persistent recovery with an in-memory workaround. See [Webspring](webspring.md).

## 7. Verify the installed consumer, not only the source tree

Use `createSynWareTestHost({ application: AppClass, manifest })` from `/sdk/testing` for actual class instances, windows, routes, commands and preferences. `host.application` is the live instance after rendering. Supply trusted host fixtures through the documented test-host configuration, not app-constructor clients. Native keyboard events use the production input boundary.

Before shipping the migration:

1. Typecheck, validate and build against the packed SDK and matching MCP archives.
2. Launch the actual application module; class-only tests do not catch duplicate named lifecycle exports.
3. Exercise controls, shortcuts and modal responder transitions, including disabled/checked state after external model changes.
4. Open a secondary window and inspect its visible content, not just its registration. Close it, restore it and exercise the application's termination decision.
5. Verify existing FX, reduced motion, appearance, glyph contrast and responsive layouts in the browser.
6. Check a fresh persistence namespace, selected integration owners and document/recovery boundaries. Do not preserve old identity data through aliases.
7. Retain exact receipts and report missing authentication/backend prerequisites rather than claiming an unexercised successful sign-in.
