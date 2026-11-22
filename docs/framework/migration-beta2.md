# Migrating to 1.0.0-beta.2

This guide takes an application written for beta.1 through the breaking changes in beta.2: folder discovery, the app-bound `SCOS` facade, and class-based application, window and view controllers. Function-component applications are still supported. The removed identity fields, hooks and content-source API have no aliases, so every step below needs doing.

A framework checkout builds a beta.2 candidate, which doesn't mean beta.2 has been published. Install the SDK archive and the Developer MCP archive from the same build; their receipts record the commit and source fingerprint. See [Getting started](getting-started.md) for installation.

## 1. Give every application one explicit identity

Every application needs `Name.app/Contents/Info.ts`. The folder name doesn't set the application's identity, so declare `bundleIdentifier`, `displayName` and `version`. None of them comes from the host's package version.

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

Reverse-DNS identifiers can use mixed case. Public metadata keeps the spelling you wrote, but lookups, ownership checks and storage partitions ignore case, so two applications can't have identifiers that differ only in case. `Notes.app` can declare `com.Example.Notes` without renaming its folder.

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

Leave unrelated document IDs, route names, collection IDs and window titles alone. Update only the command IDs and saved ownership references that contain the old application identity. See the [manifest reference](synware-manifest.md).

### Saved data is reset, not migrated

Start from a fresh persistence namespace. Don't import documents owned by the old identity as if the new identity owned them, and don't widen seeding rights to reach them. Webspring now stores its layout as version 5 (`webspring.layout.v5`) and doesn't migrate the old layout. Don't keep aliases or fallbacks for old IDs.

## 2. Let the plugin discover the project

The plugin looks in `src/SynWare/Name.app/Contents/`, `src/Preferences/Name.prefPane/`, `src/Widgets/Name.widget/` and `src/Integrations/Name.integration.ts`. You can configure other roots in the Vite plugin.

A function application no longer wraps its root in `createSynWare`:

```tsx
// Before
export default createSynWare({ manifest, root: NotesView, routes: notesRoutes });
```

```tsx
// After: Info.ts supplies the manifest.
export const routes = notesRoutes;
export default NotesView;
```

An application class declares `static routes = notesRoutes` instead. Don't also export `routes` from that module: declaring the same field on the class and as a named export is an error, and the two are never merged.

`mountSynCloudOS` reads `virtual:syncloudos/project` when you don't pass a composition, so remove any hand-written application, preference, widget, integration and shell registries. The generated module exports the shell as `webspring`, a `WSDefinition` built from `src/Webspring/Contents/`, and `shellResources`, the shell's resource URLs and localised strings:

```tsx
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";

const element = document.getElementById("root");
if (!element) throw new Error("Missing application root.");
await mountSynCloudOS({ element });
```

Don't replace that resource map with a list of branding images, because widgets and preferences use it too. Hosts that don't use discovery can still pass their own composition. See [Project structure](project-structure.md).

## 3. Replace the old hooks and imports

Application code imports from the root entry, `@syndromatic/syncloudos`. NSE and FX keep their own entries, and `SCOS` doesn't become a namespace for every framework.

| Before | After |
| --- | --- |
| `useSynWare()` | App-bound `SCOS`, or `useSCOS()` in shared React components |
| `useSynWareLocalisedStrings("notes")` | `useStrings()`; no hand-written app identity |
| `useSynWareAppearance()` | `useAppearance()` |
| Other `useSynWare…` hooks | Their unprefixed public names, such as `useCommands`, `useRouter`, and `useAnimations` |
| An invented `/testing` package entry | The public `@syndromatic/syncloudos/sdk/testing` entry |

Inside an application folder, the plugin binds `SCOS` to that application, so it stays valid after `await` and in callbacks for as long as the application runs. Shared components call `useSCOS()` to get the nearest mounted application. Reading `SCOS` doesn't subscribe a React component to changes; use the reactive hooks or observable controller state for values that change.

Controller code uses `SCOS.routes.state(graph, name)`, `SCOS.routes.isActive(...)`, `SCOS.fonts.manager` and `SCOS.menus.runtime` instead of React bridge components. View controllers learn about presentation and reduced-motion changes through `traitCollection` and `traitCollectionDidChange`. See the [SDK reference](synware-sdk.md).

## 4. Move responsibilities into real application classes

A class application default-exports an `NSEApplication` subclass with `static mainWindow`. Its window controller renders `static view` or owns a `contentViewController`. View controllers own their child controllers and publish state through `@observable` accessors. React components are still the views. Wrapping a large function component in a class without moving its state, actions and lifecycle into the controller doesn't complete this step.

| Responsibility | Class API |
| --- | --- |
| App launch, active state and termination veto | `NSEApplication` lifecycle methods |
| Window title, key state, close decision and document | `NSEWindowController` and `window` |
| Appearance, subscriptions and layout | `NSEViewController` lifecycle and `viewWillLayout` / `viewDidLayout` |
| Child controller containment | `addChild` / `removeFromParent`, its view placed with `<child.view />` |
| Changing controller state | `@observable accessor` |
| Read another model/controller in a view | `useObserve(object)` |
| User intent and availability | `@action` and `validate<Name>` |

A controller's view already observes its controller. If action validation depends on model state that changes elsewhere, subscribe in the controller's lifecycle and publish the model snapshot as observable state. A subscription in the view alone won't revalidate the controller's actions.

Controllers created in class field initialisers or constructors are owned automatically. Controllers created later, including after `await`, need an explicit `owner: this`. Dispose subscriptions in the matching disappearance or disposal method. Don't bring back React bridges, and don't dispose by hand a controller the class already owns. For text editing, the content owner is now `textOwner`, and `owner` means the lifetime owner.

A child view controller's frame no longer forces `width: 100%; height: 100%`, because the parent controls layout. Pass `className` to `<child.view />` to style that frame, for example a canvas that grows between fixed-width sidebars. Keep the frame, since layer bounds and lifecycle depend on it, and remove selectors on internal attributes and `display: contents` workarounds. See [Applications](applications.md) for complete layout examples.

### Actions retain command security

Bind NSE controls with `action` and `actionPayload`. Custom views call `useAction(name, boundPayload?)`, then `.perform(eventPayload)` with a value from the event. Validation and execution still go through the responder chain, including modal scopes.

```tsx
const openNote = useAction("openNote");
return <button onClick={() => { void openNote.perform(note.id); }}>Open note</button>;
```

Use a primitive ID where you can. Build a payload with several fields from known values with `SCOS.commands.createPayload("id", note.id, "title", title)`, and nested records and arrays with the same application's builders. A browser host can't tell whether an arbitrary object is a proxy, so it won't accept one. Don't spread, enumerate or serialise unknown objects to get around this.

Files, DOM elements, functions, abort signals and controller instances can't be action payloads. Look up models by ID inside the controller, keep DOM elements as outlets, and pass imported files to your own methods. Title resolvers, key bindings, menu categories and validator overrides on `@action` behave as they do for any command.

### Secondary windows must be real windows

Open secondary windows with `app.openWindow(DetachedWindow, { documentId, restorationKey, ... })`, and declare `static windowControllers = { detachedNote: DetachedWindow }` so they can be restored after a reload. Remove any old React window registry. Check the rendered content, focus, closing and restoration, because an entry in the window list doesn't prove the window is visible.

The registry lets saved windows be rebuilt, but doesn't save anything by itself; the host has to save and restore its workspace. If the host didn't restore windows on reload before, don't add that while migrating.

## 5. Preserve effects through the FX APIs

A new `AFXLayer()` starts detached. Add it to a loaded controller's `view.layer` with `addSublayer`, and it takes its surface and scheduler from the parent. Properties you set before attaching it are kept. Reading `view.layer` before the view loads, or after it unmounts, throws `NSE_VIEW_NOT_LOADED`.

```ts
const highlight = new AFXLayer();
this.view.layer.addSublayer(highlight);
```

Only hosts that build their own rendering surfaces use `createAFXLayer(surface, scheduler)` from `@syndromatic/syncloudos/sdk/animation-host`, which replaces the old public constructor that took a surface and scheduler. When you move lifecycle code into classes, keep your AnimationFX and GraphicsFX particle fields, paths, imagery and reduced-motion behaviour; the class API doesn't require you to replace them with CSS. See [AnimationFX](fx/animation.md) and [GraphicsFX](fx/graphics.md).

## 6. Replace implicit shell styling and content sources

| Before | After |
| --- | --- |
| Brushed metal, paper and glow built into the default Board | Generic cotton/spotlight defaults; declare site-owned `static launcherSurface` and `static shelfSurface` on the `WSApplication` subclass to retain a custom look |
| `content`, `contentSources`, `registerContentSource` and `LowerContentShelfView` | `WSWidget` and `WSWidgetShelfView` |
| An always-present loading shelf | No widgets means no shelf; each widget declares empty behaviour and has bounded loading/error/retry states |
| `frame.layout: "simple"` or `"defacto"` | Removed; content is full-bleed in the app frame |
| A hard-coded cotton app body | `NSEWindow.backgroundColour` and `NSEWindow.isOpaque` |
| Hard-coded return artwork | `branding.homeIcon`, or the generic house glyph |
| A generic "Preferences" system entry | "System Preferences…", distinct from an app's own preferences |
| Private preference-pane registration | `NSEPreferencePane` subclasses and discovered `.prefPane` folders |

A widget owns its feed and React view, and the shelf handles loading, empty, error, timeout and retry states. Use the `navigate(route)` it's given for navigation inside the shell, and keep an anchor's `href` for modified clicks. Resource paths such as a widget's `icon` resolve through the shell's generated resource map. Site-specific titles, fonts, artwork and layout belong to the site, not the framework.

Integrations declare the applications that own them. Owner matching ignores case, and only the selected applications get installation and seeding rights. Use `applicationDocuments(environment)` when setup needs the host clock, timers or recovery store. Don't replace persistent recovery with something in memory. See [Webspring](webspring.md).

## 7. Move the shell to `WSApplication`

The shell is a `WSInfo` in `src/Webspring/Contents/Info.ts` and a `WSApplication` subclass that `index.tsx` default-exports. There are no aliases for the names it replaces:

| Before | After |
| --- | --- |
| `defineWebspring({ manifest, components, ... })` | `Info.ts` (`WSInfo`) and a default-exported `WSApplication` subclass; `createWebspring({ info, application })` without the Vite plugin |
| `webspringShell: { homeRoute, branding, folders }` | The same fields at the top level of `WSInfo` |
| `webspringShell.views` and `defaults` | `static mainViewController`, or `static viewControllers` per presentation |
| `components: { board: WebspringBoardView }` | `WSBoardViewController`, the default launcher |
| A view component taking `WebspringViewProps` | A `WSLauncherViewController` subclass; `WSIconView` draws each entry |
| `returnTracks` assigned to a view component | `static returnTracks` on the launcher |
| `background: { launcher, shelf }` | `static launcherSurface` and `static shelfSurface` |
| `folderAppearance`, `folderPresentation`, `iconEffect`, `quickSwitch` | The statics of the same names |
| `widgets: [...]` | `static widgets`, or `src/Widgets/<Name>.widget` |
| `preferences: { panes, hide }` | `static preferencePanes` and `static hiddenPreferencePanes` |
| `defineWidget(...)` | A `WSWidget` subclass |
| `definePreferencePane(...)` | An `NSEPreferencePane` subclass |
| `WebspringDefinition` | `WSDefinition` |
| `WebspringFolderAppearanceOptions`, `WebspringFolderPresentationComponent`, `WebspringFolderPresentationProps`, `WebspringIconEffectComponent`, `WebspringIconEffectProps`, `WebspringQuickSwitchOptions`, `WebspringLaunchZoom` | `WSFolderAppearanceOptions`, `WSFolderPresentationComponent`, `WSFolderPresentationProps`, `WSIconEffectComponent`, `WSIconEffectProps`, `WSQuickSwitchOptions`, `WSLaunchZoom` |
| A composition's `shell` field | `webspring` |

`create-synware src/Webspring` and the Developer MCP `scaffold` tool (`kind: "webspring"`) write both files. If your source still uses a removed helper, the `validate` tool and the folder validator name its replacement, and `lookup_sdk` answers a removed name with the classes that replace it. See [Webspring](webspring.md).

## 8. Move to themes and the theme contract

`.scostheme` theme bundles, drawn through a public contract, replace appearance definitions, slots and recipes ([Themes](themes.md), [contract reference](theme-contract.md)). None of the removed names has an alias.

### Theme selection

| Removed | Use instead |
| --- | --- |
| `atmoAppearance` | `atmoTheme` from `@syndromatic/syncloudos/nse/themes/atmo` |
| `NSEAppearanceProvider` `appearance` prop, selection `appearance` | `theme` |
| `mountSynCloudOS` `appearance` option | `theme`, an `NSETheme`; omit it for Atmo |
| `data-nse-appearance` | `data-nse-theme`, holding the bundle identifier |
| `defineNSEAppearance`, `NSEAppearanceDefinition`, `NSEAppearanceDefinitionInput`, `NSEAppearanceRecipeDefinition` | a `.scostheme` bundle: `Info.ts`, `Theme.json` and stylesheets |
| `useNSEAppearanceSlot`, `resolveNSEAppearanceSlot`, `nseAppearanceSlot`, `projectNSEAppearanceSlot`, `NSEAppearanceSlotDescriptor`, `NSEAppearanceSlotProjection`, `NSEAppearanceSlotResolution`, `NSEChromeSlot`, `NSEChromePrimitiveProps.slot` | contract hooks: `[data-nse-control]`, `[data-nse-part]` and their state and variant attributes |
| `NSEWindowAppearanceRecipeId`, `NSE_WINDOW_APPEARANCE_RECIPE_IDS`, `NSEWindowFrameProps.appearanceRecipe` and `shadowRecipe`, `NSEWindowTitleBarProps.appearanceRecipe` | the window frame's `hasShadow` |
| `atmoMotion` | `NSEAnimationContext.current`; the framework owns motion |

The `@syndromatic/syncloudos/nse/themes/atmo` entry now exports only `atmoTheme`, and its `styles.css` loads the control structure and the whole Atmo bundle.

### Colours

The `--nse-app-*` properties become semantic colours: `--nse-app-background` → `--nse-colour-window-background`, `--nse-app-foreground` → `--nse-colour-label`, `--nse-app-foreground-secondary` → `--nse-colour-secondary-label`, `--nse-app-surface` → `--nse-colour-control-background`, `--nse-app-surface-border` → `--nse-colour-grid`, `--nse-app-separator` → `--nse-colour-separator`, `--nse-app-accent` → `--nse-colour-control-accent`, `--nse-app-accent-foreground` → `--nse-colour-selected-control-text`, `--nse-app-selection` → `--nse-colour-selected-content-background` and `--nse-app-critical` → `--nse-colour-system-red`. British spellings replace `textColor`, `labelColor`, `secondaryLabelColor` and `emphasized`: use `textColour`, `labelColour`, `secondaryLabelColour` and `emphasised`. The separator's `gray` variant is `grey`.

### Layout

`NSEScrollInsets` becomes `NSEEdgeInsets` (with `NSEEdgeInsetsZero` and `NSEEdgeInsetsMake`), and `NSEScrollView`'s `scrollInsets` prop becomes `contentInsets` and `scrollerInsets`, with `automaticallyAdjustsContentInsets` on by default. See [layout guides and safe areas](windows.md#layout-guides-and-safe-areas).

### Control identities

Theme and application CSS that selected the old control identities must use their replacements: `calendar`, `time-picker`, `date-time-picker` and `date-range-picker` are `date-picker` with its `date-picker-elements` and `date-picker-mode` variants; `circular-slider` and `slider-field` are `slider` with `slider-type`; `ruler` is `ruler-view`; `route-picker` is `route-picker-view`; `file-panel` is `save-panel`; `scroll-view-frame` is `scroll-view`; `toolbar-configuration-sheet` is `toolbar-customisation-palette`; and the toolbar's `root` part is `background`.

### Drawing controls

Only a theme draws NSE controls. The Developer MCP reports application CSS that selects private `.nse-*` classes, or contract hooks such as `[data-nse-control]` and `[data-nse-part]`, as `idiom.control-internals`. Draw your own content with the semantic colours and leave NSE controls to the theme.

## 9. Verify the installed consumer, not only the source tree

Test with `createSynWareTestHost({ application: AppClass, manifest })` from `@syndromatic/syncloudos/sdk/testing`, which gives you real class instances, windows, routes, commands and preferences. `host.application` is the live instance after rendering. Supply host fixtures through the test host's options, not through the application's constructor. Native keyboard events go through the production keyboard routing. See [Testing a SynWare](testing-synware.md).

Before shipping the migration:

1. Typecheck, validate and build against the packed SDK and matching MCP archives.
2. Launch the real application module; tests of the class alone won't catch a duplicate named export such as `routes`.
3. Try controls, shortcuts and modal responder changes, including disabled and checked states after the model changes elsewhere.
4. Open a secondary window and inspect its visible content, not just its registration. Close it, restore it and exercise the application's termination decision.
5. Verify existing FX, reduced motion, appearance, glyph contrast and responsive layouts in the browser.
6. Check the fresh persistence namespace, the selected integration owners, and which documents and recovery data each application can reach. Don't carry old identity data over through aliases.
7. Keep the build receipts. If authentication or a backend wasn't available, say so instead of reporting a sign-in you didn't test.
