# Window management: one window model, one title bar, real full screen

Owner: Kavish. Investigation and plan: Claude (2026-11-14). Builder: Codex (Sol). Visual gates: Claude and the owner.

This plan replaces the overlapping chrome systems with the NSE/AppKit model: an application describes its
`NSEWindow`, the system draws it, and a host adapter decides how that looks in a browser, an installed web app
or (later) Electron. Every finding below was checked against the source on `origin/master` at `556cb260`.
Docs and tests are **not** authority: several describe behaviour that is wrong or dead. Where a test asserts
something this plan removes, replace that specific assertion; do not keep the behaviour to satisfy it. Keep the
behavioural protection the test gave (lifecycle, close transactions, key/main, focus return, restoration,
custom-chrome fallback): rewrite it against the new model rather than deleting it.

Revised 2026-11-14 after an external review (GPT-6 Astra). Its source claims were checked and hold; the changes
are window identity across presentations, a transfer prototype before the host API is fixed, modality and
document-local focus, full-screen transition states, restoration migration, and measured title-bar geometry.

## Why

- SynCloudOS should be a real AppKit-shaped framework, good enough to rebuild a demanding Electron app (T3 Code)
  on. Today an app's window chrome is configured three ways (manifest `frame`, manifest `windowDefaults.chrome`,
  and `NSEWindow`), drawn by three components, and only half of `NSEWindow` actually works.
- GPT-5.5-era leftovers (manifest `frame` settings, dead manifest fields, `AppFrame`) must go, with no aliases.

## Rules for the builder

1. NSE names in the API, AppKit names in comments: `NSEWindow.styleMask` (NSWindow.styleMask). No new
   non-AppKit concepts where AppKit has one. NSE extensions only where AppKit has nothing (and say so in the doc
   comment, as `bottomBarAccessory` does).
2. No aliases, shims, deprecation periods or compatibility flags. Removed means removed; migrate every caller
   in the framework **and** the site (`webspring-folders/site`) in the same change.
3. Preserve the Atmo look. Each visual gate collects before and after screenshots for desktop and phone,
   light and dark, and Cumulus and Metal. Record what changed and why in the evidence README. Continue through
   the phases for one design review with Claude and the owner. Keep the frozen baseline and screenshot
   assertions intact. Leave intended visual failures visible and list them under Pending design review.
4. Theme CSS follows the theme validator (`scripts/synware/theme-bundles.mjs`): no `.nse-` classes, keyframes,
   transitions, `font-*`, or `display`/`content` on semantic parts in theme files. Structure goes in framework CSS.
5. Windows checkout: write files with LF. Python: `open(p, "w", newline="")`. After scripted edits, compare
   carriage-return counts with HEAD.
6. Commit each phase locally in its worktree. Run the affected checks, followed by the full runtime and test
   suites against frozen framework source, both typechecks and both browser suites. Record their outcomes and
   the retired-name search. Leave master and remote branches alone.
7. Keep comments short (two sentences at most).

## What is true today (verified)

Paths are under `src/` unless noted.

### Window model

- `SynCloudOS/Windows/WindowManager.ts` is a sound window server: create/open/close transactions, ordering,
  key and main, sheets, bounds scheduling, minimise, zoom, restoration. Keep it as the single authority.
- **No full screen.** `WindowRecord` (`SynCloudOS/Windows/windowTypes.ts:270`) has `zoomed` but no full-screen
  state; no `toggleFullScreen` anywhere. Whether an app is "full screen" is fixed in its manifest
  (`presentation: "appView" | "windowedView"`).
- **Full-screen apps are not windows.** `resolveApplicationWindow` returns `null` for `appView`
  (`SynCloudOS/Runtime/createSynCloudOS.ts:488`); they render on the Webspring stage
  (`Webspring/ApplicationStageLayer.tsx`, `ApplicationStageView.tsx`) and their `NSEWindow.id` is `null`
  (`NSE/Application/NSEWindowController.ts:57`). The stage and the window layer (`Webspring/WindowLayer/`) are
  two separate hosting paths.
- **Style and chrome are per application, not per window.** Windows an app opens take `app.window.style` and
  `app.window.chrome` from the manifest (`SynCloudOS/AppSDK/appRuntimeFacade.ts:1413`). `NSEWindow` exposes no
  style mask, and nothing can change style or chrome after creation.
- Presentation is already projected per screen in `resolveWindowPresentation`
  (`SynCloudOS/Windows/WindowRestoration.ts:265`: `desktop-window`, `mobile-sheet`, `hidden`, …). Full screen
  belongs here as another presentation kind.
- **Two app-facing window APIs.** Class apps use `NSEWindowController`/`NSEWindow`. Hooks use
  `AppWindowClient` (`SynCloudOS/AppSDK/appClientTypes.ts:644`: focus, minimise, zoom, setTitle, close,
  openDocumentWindow) via `useWindow()`, plus `useWindowChrome()`. The hooks API has no toolbar, accessories or
  subtitle. Every site app is a class app; only the gallery's window example uses `AppWindowClient`.
- No native host exists: no Electron adapter, no native window port. All windows are drawn inside the page.
- **Keep:** key and main are separate (a panel becomes key while its document stays main;
  `tests/runtime/window-focus-ordering.test.ts:24`). Every host must preserve this.
- **Stage and windows use different controllers on purpose today.** `ApplicationSession.controllerFor(null)`
  builds a stage controller; each window record gets its own (`SynCloudOS/AppHosting/applicationSession.ts:302`),
  and `tests/runtime/nse-window-controller-class.test.tsx:396` protects that separation. Removing the `appView`
  exception alone would create a second controller instead of moving the existing one.
- **A real React unmount revokes the application's authority** (`SynCloudOSReact/SynWareRuntimeMount.tsx:153`),
  so moving a window between the stage and the window layer cannot be an unmount/remount.
- **Modality is defined twice and disagrees.** `WindowManager.#blockedWindowIds` blocks a sheet's parent or a
  modal's relationship/application/workspace domain (`WindowManager.ts:2067`), but `FocusManager`'s modal scope
  is the top of one global stack (`SynCloudOS/Focus/FocusManager.ts:60`). `#makeKey` (`WindowManager.ts:2094`)
  can make an unrelated window key and then have its focus refused, leaving key state and the focused responder
  disagreeing. Found in source, not yet reproduced in a browser.
- **Focus and overlays assume one document.** `FocusScope.tsx:108` and `OverlayProvider.tsx:104` use the
  runtime's single document; `AppFocusScope.tsx:83` uses `ownerDocument` but then `instanceof Node`/`HTMLElement`,
  which fails across documents from another realm.
- **Restoration persists chrome fields:** `style` and `chromeMode` are stored and validated
  (`SynCloudOS/Windows/WindowRestoration.ts:110,389`).
- **Keep:** a window declared custom starts on system chrome and only switches when the custom renderer reports
  live; unmount or a crash returns it to the system bar (`Webspring/WindowLayer/WindowHost.tsx:126`).

### Title bars and toolbars

- Three components draw the top of a window:
  - `NSE/Windows/Chrome/TopBar.tsx` (Atmo Cumulus/Metal art) for stage apps (`Webspring/ApplicationStageView.tsx`)
    and the single-app host (`SynCloudOSReact/ApplicationHostTitlebar.tsx`);
  - `NSE/Windows/WindowTitleBar.tsx` (traffic lights and title) for floating windows (`StandardWindowView`,
    `PanelView`, `ModalWindowView`, `SheetView`, `PopoverWindowView`) and the installed-app overlay
    (`SynCloudOSReact/InstalledApplicationTitleBar.tsx`);
  - `WindowToolbar` (`SynCloudOS/AppHosting/windowChrome.tsx`) as an extra row under either
    (`SynCloudOS/AppHosting/applicationHosting.tsx:530`).
- **`toolbarStyle` `unified` and `unifiedCompact` do nothing.** They are accepted
  (`NSEWindowController.ts:316`) but no code or CSS reads them; only `expanded` and `preference` change layout.
  The toolbar is always a second row.
- `TopBar` has its own item model (`TopBarItemKind = "webspring" | "userInfo" | "settings" | "custom"`,
  `topBarTypes.ts`) and button (`TopBarButton.tsx`), separate from `NSEToolbar` items.
- **Two shells build the bar separately and disagree.** When the runtime boots into one app,
  `SynCloudOSReact/ApplicationHost.tsx` builds its own `TopBar` and its own app menu. Compared with the stage it
  has no source-list rail, no navigation back chrome, no folded expanded title, no dock-menu or shortcut menu
  items (`installedApplicationMenuSections`), and ignores `frame.background` and `frame.smoothSurface`.
- **Installed web app (window-controls overlay):** `InstalledApplicationTitleBar` draws a second
  `WindowTitleBar` with `document.title` into the OS title-bar area, and nothing moves the page below it, so it
  likely overlaps the stage's own bar. **Unverified**: confirm with a real install in Phase 0.
- Two custom-chrome systems: stage apps use `frame.topBar: "custom" | "none"`; windows use
  `windowDefaults.chrome: "custom"` plus an exported `windowChrome` component mounted through
  `Webspring/WindowLayer/WindowChromeBridge.tsx`. Journal and JournalOld are the only real users: a leather or
  Mountain Lion title bar with their own window buttons.

### Menus

- `NSEApplication.mainMenu` (`NSE/Application/NSEApplication.ts:135`) can be set, but the system never draws it.
  `NSEMenuBar` is a component apps must place themselves; only the gallery does.
- The app menu (About, Preferences, Log Out, Quit) is configured through the manifest (`applicationMenu`,
  `frame.rightSlot`) and built twice, by the stage and by `ApplicationHost`, both calling
  `createApplicationMenuModel` with different sections.
- **Dead manifest fields:** `commands` and `menus` (`SynCloudOS/AppSDK/manifest/manifestTypes.ts:153-164`) are
  validated and documented but nothing in the runtime, scripts or tools reads them. SynCal declares both.

### Sidebars

- The split view (`NSE/DataViews/Split/`) owns sidebars properly: item behaviours `sidebar | contentList |
  inspector`, collapse, `toggleSidebar()`/`toggleInspector()`, saved sizes. Collapse is instant (no animation).
- Manifest `frame.sourceList` makes the stage bar draw a "rail" section over the sidebar, and the stage keeps its
  own copy of the sidebar width (`ApplicationStageView.tsx:157-186`) which it pushes into the split view
  (`splitViewControllerView.tsx:152-156`). **Likely bug:** on launch the stage's 264 px default overwrites the
  split view's restored width. Prove with a test in Phase 0.

### Dead or misplaced code

- `NSE/Windows/AppFrame.tsx` and its `nse-app-frame*` CSS (`NSE/Windows/Chrome/nse-chrome.css:934`): no product
  use and not exported. Only tests and the frozen theme catalogue (`tests/e2e/fixtures/theme-additional/catalogue.tsx`,
  `stage-status-*`) use it, and it is the only producer of the `status-bar` theme part. The status line is the
  window's content border (`setContentBorderThickness`), which replaced `NSEStatusBar` on 2026-11-06.
- Manifest duplicates: `frame.smoothSurface` and `windowDefaults.smoothSurface`; `frame.topBar` and
  `windowDefaults.chrome`.
- **Apps draw their own system chrome on phones.** Journal, JournalOld, MemoJournal and SynCal draw their own
  Return to Webspring and app-menu buttons from `site/src/SynWare/Libraries/PhoneChrome/glyphs.ts`, duplicating
  the host's controls.

## Owner decisions (2026-11-14)

1. One title bar, fed only by `NSEWindow`. `TopBar`'s look is kept; its separate item model, settings and the
   duplicate shells go.
2. Toolbar items sit **in** the title-bar row for `unified`/`unifiedCompact` (and `automatic` where Atmo
   chooses unified). `expanded` keeps title above toolbar. This overturns the 2026-11-06 "toolbar under the
   title bar" decision.
3. Return to Webspring is **window chrome**, like the traffic lights: shown by the system only when the window
   is full screen on the Webspring stage. Windowed apps use the window controls; apps without Webspring never
   see it. Apps cannot add or remove it.
4. Settings and user info become **standard toolbar items** an app opts into. Apps without settings, or with
   Preferences in the menu bar, leave them out.
5. The File / Edit / View menu bar and the application-menu toolbar button are independent opt-ins.
   `NSEApplication.mainMenu` supplies the menu bar, and the system prepends the standard application menu.
   `NSEToolbarItem.applicationMenu` opens the same menu using the app's gear or person glyph.
   Apps may set either, both, or neither. The app icon is not a menu trigger.
6. When an app has a menu bar, the system draws it **above** the title bar/toolbar, with the metal app colours
   and the same noise texture.
7. Full screen is a window state apps can enter and leave. In a browser it becomes the full-screen stage
   presentation (as SynWare on the Syndromatic site is today); in Electron it becomes real OS full screen.
8. Delete dead code, dead fields and duplicates outright.
9. `NSEWindow.titlebarPresentation` is an NSE extension with `"attached"` (default) and `"floating"`.
   Floating works with every toolbar style. Atmo detaches only Cumulus and caps its width on wide windows.
   Textured Metal stays attached. Inset toolbar groups use the same appearance and behavior in both
   Cumulus presentations. Floating art is pending design; ship semantic parts and existing-token paint.

## Target architecture

### What an app writes (class apps)

```ts
class EditorWindowController extends NSEWindowController<EditorApp> {
  windowDidLoad() {
    const window = this.window;
    window.styleMask = ["titled", "closable", "miniaturizable", "resizable", "fullSizeContentView"];
    window.toolbarStyle = "unified";                 // items share the title row
    window.titleVisibility = "visible";              // NSWindow.titleVisibility
    window.titlebarAppearsTransparent = false;       // NSWindow.titlebarAppearsTransparent
    window.collectionBehavior = ["fullScreenPrimary"];
    window.toolbar = new NSEToolbar({
      identifier: "editor",
      items: [...appItems, NSEToolbarItem.toggleSidebar, NSEToolbarItem.sidebarTrackingSeparator,
              NSEToolbarItem.flexibleSpace, NSEToolbarItem.showPreferences],
      defaultItemIdentifiers: [...],
    });
  }
}

class EditorApp extends NSEApplication {
  applicationDidFinishLaunching() {
    this.mainMenu = buildMainMenu();                 // optional; drawn by the system
  }
}

window.toggleFullScreen();                           // NSWindow.toggleFullScreen(_:)
window.isFullScreen;                                 // derived from styleMask contains "fullScreen"
```

Names are AppKit's where AppKit has one (`styleMask` values `titled | closable | miniaturizable | resizable |
fullSizeContentView | texturedBackground | fullScreen`, `collectionBehavior`, `titleVisibility`,
`titlebarAppearsTransparent`, `standardWindowButton(_:)`, `backgroundColor`). The existing `WindowStyle` spelling
`minimisable` is the system's internal record value; the public mask uses AppKit's `miniaturizable` and the
facade maps it. **Builder:** do not rename `WindowRecord.style` values in this plan.

- **Metal vs Cumulus** (`frame.material`) becomes `styleMask` `texturedBackground` (NSWindow.StyleMask
  .texturedBackground, the original AppKit metal window).
- **Body background** (`frame.background`) becomes `NSEWindow.backgroundColor` (`"system"` default, `null`
  for unpainted, or a surface), with `isOpaque` as AppKit has it.
- **Corner shape** (`frame.smoothSurface`, `windowDefaults.smoothSurface`) becomes one window property; keep the
  existing `SmoothSurface` value type.
- **Custom title-bar looks** (`frame.topBar: custom|none`, `windowDefaults.chrome`, the `windowChrome`
  component) become a custom **frame view**, as Mountain Lion's Notes, Calendar and Contacts had: AppKit drew
  the title bar in the window's frame view (`NSThemeFrame`), and those apps substituted their own frame view
  class (`+[NSWindow frameViewClassForStyleMask:]`) to change its art and metrics while AppKit kept the
  behaviour. `NSThemeFrame` and that hook were private, so this is an **NSE extension inspired by AppKit
  internals**, not an AppKit counterpart; document it as such. Prototype it against Journal's real needs (both
  variants) before fixing which metrics and stylesheet parts are public; the sketch below is a starting point,
  not the API. A frame view whose stylesheet fails to load falls back to system art, keeping today's
  custom-chrome fallback guarantee.

  ```ts
  class JournalFrameView extends NSEWindowFrameView {     // NSThemeFrame's drawing role
    static titlebarHeight = 52;                            // _titlebarHeight
    static windowButtonInset = { leading: 12, top: 0 };    // _minXTitlebarWidgetInset
    // Art: a theme-style stylesheet scoped to this frame view's parts (bezel, title, window buttons,
    // toolbar background); same part names and validator rules as Atmo.
    static appearance = new URL("./Resources/JournalFrame.css", import.meta.url);
  }
  class JournalWindowController extends NSEWindowController {
    static frameViewClass = JournalFrameView;              // +frameViewClassForStyleMask:
  }
  ```

  The system still lays out and drives everything in the bar: window buttons (with the frame view's art),
  title, toolbar items, accessories, dragging, double-click to zoom, full screen, key/main state. Variants
  (Journal's Mountain Lion and leather toolbar) are two frame view classes or one with a mode the stylesheet
  reads; switching sets `frameViewClass` on the window. The frame view never renders React content of its
  own: anything interactive is a toolbar item or titlebar accessory.
- `titlebarAppearsTransparent` + `fullSizeContentView` + `titleVisibility` remain, for the separate AppKit case
  of content running under the bar (media, maps), not for custom title-bar art.
- **Launch geometry stays in the manifest.** `windowDefaults` `title`, `width`, `height`, `minimumWidth`,
  `minimumHeight`, `resizable` and `role` are needed before the bundle loads (`createSynCloudOS.ts:486`), like a
  storyboard's initial window. Remove `chrome` and `smoothSurface` from it. A window controller can override any
  of them after load.
- **Initial presentation:** manifest `presentation: "appView" | "windowedView"` stays as launch metadata meaning
  "the main window opens full screen | windowed". It no longer decides the hosting path. `systemSheet` and
  `backgroundService` are unchanged.

### Hooks apps

`useWindow()`/`AppWindowClient` duplicate `NSEWindow`. Replace with `useNSEWindow()` returning the current
window controller's `NSEWindow` (the same object class apps use) and `useNSEApplication()` for
`openWindow`/`windows`. Delete `AppWindowClient`, `AppWindowChromeProps`, `useWindowChrome`, the `windowChrome`
export and `WindowChromeBridge`. Migrate the gallery's `GalleryWindowExample` and `GalleryViewControllers`.

### What the system draws: one title bar

A single internal view, `WindowTitlebarView` (new, `NSE/Windows/Titlebar/`), draws every window's top chrome from
its `NSEWindow` and the host's capabilities. Layout, leading to trailing:

| Slot | Contents |
| --- | --- |
| Window controls | traffic lights (desktop window), Return to Webspring (full screen on the Webspring stage), nothing (host draws native controls; reserve their rect) |
| Sidebar section | when the content's split view has a leading `sidebar` item: the title-bar section over it, width from the **split view** (NSTrackingSeparatorToolbarItem / `sidebarTrackingSeparator`), app name and QuickSwitch action as today's rail |
| Leading accessories | `NSETitlebarAccessoryViewController` with `layoutAttribute: "leading"` |
| Title | title and subtitle, placement per `toolbarStyle` and `titleVisibility`; QuickSwitch title action on the stage |
| Toolbar items | `unified`/`unifiedCompact`: inline, sharing the row; `expanded`: second row; `preference`: centred icon row |
| Trailing accessories | `layoutAttribute: "trailing"` |

Bottom accessories (`layoutAttribute: "bottom"`) stay a row under the bar. `bottomBarAccessory` and the content
border are unchanged.

The view reuses `TopBar`'s art (`topBarAssets.ts`, `topBarStyles.ts`, `nse-chrome.css`, Atmo
`atmo.window-titlebar.css`) so Cumulus and Metal look as they do now. `TopBar`'s item model, `TopBarButton`
kinds other than the Webspring return, `ApplicationHostTitlebar`, the stage's `ApplicationStageTopBar`, the
separate `WindowTitleBar` component and `InstalledApplicationTitleBar` are deleted once every caller uses the new
view. Webspring's navigation back (`NSEApplicationNavigationChrome`) keeps working: it occupies the window-controls
slot in compact presentation, as today.

### Standard toolbar items

Add to `NSEToolbar` (NSToolbarItem.Identifier): `toggleSidebar`, `toggleInspector`, `sidebarTrackingSeparator`,
`showPreferences` (sends `showPreferences` along the responder chain; validated like any action, hidden when
nothing handles it), `account` (the user-info person; opens the identity menu). `space`/`flexibleSpace`/`separator`
exist already. Add `NSEToolbarItemGroup` (NSToolbarItemGroup: `subitems`, `selectionMode`,
`controlRepresentation`), drawn with the existing `ToolButtonGroup` band (`NSE/Controls/Buttons/NSEButtonFamilies.tsx`)
until Atmo's circular group art lands (Phase 7).

### Menus

- The system draws `NSEApplication.mainMenu` (via `NSEMenuBar`) **above** the title bar when the window is key
  and the host has no native menu bar. Atmo: metal app colours and the window's noise texture (visual gate).
  Compact width collapses it into one menu button in the window-controls slot.
- The first menu is the system **application menu**, built once in one place for every shell: About (when the
  app declares about), Preferences… (`showPreferences`, enabled by validation), dock-menu and shortcut items
  (`installedApplicationMenuSections`), Sign In/Log Out, Quit. Apps add their own items to it through
  `mainMenu`'s first item, as AppKit apps do.
- `NSEToolbarItem.applicationMenu` opts into the same application menu independently of
  `mainMenu`. Migrate the site's existing settings and identity slots to this item. No toolbar item or
  menu bar is added automatically. The QuickSwitch action stays on the title.
- Delete manifest `applicationMenu`, `commands`, `menus`, `frame.rightSlot`, `menuOpensSystemPreferencesDirectly`
  special-casing that only existed for the right slot, and the second app-menu construction in `ApplicationHost`.
- Electron later maps `mainMenu` to the native menu (`Menu.setApplicationMenu`) and the system stops drawing it.

### Hosts

New host port in `SynCloudOS/Windows/` (`WindowHostEnvironment`), supplied by the platform adapter, read by the
title bar and `WindowManager`. **The shape below is provisional: it is fixed only after the transfer prototype
(Phase 0b).** Beyond capabilities it must bind windows to host surfaces and report events back, because a
native host can close, activate or lose a window on its own:

```ts
interface WindowHostEnvironment {
  readonly capabilities: {
    readonly nativeWindowControls: null | { readonly side: "leading" | "trailing" };
    readonly menuBar: "drawn" | "native";
    readonly fullScreen: "stage" | "native";
    readonly separateSurfaces: boolean;            // a window can live in its own document/OS window
  };
  // Binding: which surface presents a window. Transfers are acknowledged, never assumed.
  bind(windowId: string, surface: WindowSurfaceRequest): Promise<WindowSurfaceBinding>;
  unbind(windowId: string): Promise<void>;
  // Requests; results come back as events, so OS-initiated changes use the same path.
  requestFullScreen(windowId: string, enter: boolean): void;
  subscribe(listener: (event: WindowHostEvent) => void): () => void;
}

type WindowHostEvent =
  | { kind: "activated" | "deactivated"; windowId: string }
  | { kind: "closeRequested"; windowId: string }      // enters the existing close transaction; may be vetoed
  | { kind: "fullScreenChanged"; windowId: string; state: "entering" | "on" | "exiting" | "off" | "refused" }
  | { kind: "surfaceLost"; windowId: string }        // renderer/document died: not a close, not a quit
  | { kind: "titlebarAreaChanged"; windowId: string; rect: DOMRectReadOnly | null };
```

- A native close button sends `closeRequested`, which runs the existing prepare/commit/rollback close
  transaction (`LaunchServices.ts:1443`); a veto keeps the OS window. `surfaceLost` is distinct from an accepted
  close or an application quit: the window survives as a record and is rebound or reported failed.

- **Browser** (`PlatformAdapters/BrowserRuntimeEnvironment.ts`): `fullScreen: "stage"`, `menuBar: "drawn"`,
  `nativeWindows: false`, `nativeWindowControls` set only in `display-mode: window-controls-overlay` (from
  `navigator.windowControlsOverlay`, which `BrowserInstalledApplicationAdapter.ts:45` already detects). In that
  mode the key window's title bar is drawn **into** the title-bar area (CSS `env(titlebar-area-*)`), leaving the
  OS controls' rect, instead of `InstalledApplicationTitleBar`'s second bar.
- **Test adapter** for `tests/runtime` with every capability switchable.
- **Electron**: design only in this plan (Phase 8). The framework never imports Electron.

### Full screen

- `WindowManager.toggleFullScreen(id)` records **intent**; the host confirms. `WindowRecord` gains
  `fullScreen: "off" | "entering" | "on" | "exiting"`; the `fullScreen` style bit is set only on `"on"`.
  Defined outcomes for: host refusal (back to `"off"`, `windowDidFailToEnterFullScreen`), a second toggle
  during a transition (queued, last intent wins), OS-initiated enter/exit (same events), and close during a
  transition (close wins; the transition is abandoned). Delegate callbacks follow AppKit
  (`windowWillEnterFullScreen`, `windowDidEnterFullScreen`, the exit pair, the failure pair).
- Normal bounds and zoom stay in the existing geometry state (`WindowGeometryState`), not a second copy.
  `resolveWindowPresentation` adds `kind: "full-screen"` (fills the work area, no move/resize, title bar per host).
- `collectionBehavior`: `fullScreenPrimary` (can go full screen itself; default for `standard` windows of
  `appView` apps), `fullScreenAuxiliary` (an inspector or panel that may accompany a full-screen document in its
  space, but cannot go full screen itself), `fullScreenNone`. Sheets and popovers follow their parent.
- **Restoration:** the no-aliases rule covers APIs, not users' saved windows. Bump the restoration format
  version; an older record keeps its id, order, bounds, zoom and minimised state, and its `chromeMode` and
  removed style values are dropped. Test both a migrated and a rejected (corrupt) record.
- **Browser:** a full-screen window is presented by the Webspring stage, so launch zoom, MultiSwitch,
  QuickSwitch and return animations keep working, now keyed by window id. Leaving full screen on a desktop-width
  screen makes it a floating window at its normal bounds. Compact screens keep today's `mobilePolicy` behaviour.
- **`appView` apps get a real window.** `resolveApplicationWindow` stops returning `null` for `appView`; the main
  window is created full screen. `NSEWindow.id` is never `null`. This depends on window identity (next
  section): the stage controller and the main window controller become one.

### Window identity across presentations

- One window is one record, one id, one `NSEWindowController` and one root view controller for its whole life,
  whichever surface presents it (stage, floating layer, another document, an OS window). `ApplicationSession`
  keeps no separate stage controller; the test at `nse-window-controller-class.test.tsx:396` is rewritten to
  assert that the same controller survives stage → floating → stage.
- **Same-document moves are not remounts.** The window's React tree renders once into a stable container node
  the window owns; presenting it on the stage or in the floating layer moves that node (reparenting a portal
  target), so no unmount happens and no authority is revoked. Lifecycle callbacks (`windowDidLoad`,
  `viewDidAppear`) do not repeat; only `viewWillAppear/DidAppear`-style presentation callbacks may.
- **Cross-document moves** (child window, Electron) are a transfer: state that survives (controller, model,
  selection, undo, draft, toolbar and accessories), resources that are reacquired (event listeners, observers,
  focus scope, overlay root, measurement), and an acknowledged commit. A failed or interrupted transfer rolls
  back to the source surface with the window intact.
- Two ways to present in another document; the prototype decides:
  1. **Shared authority:** one runtime renders into the other document (`window.open` same-origin, or an
     Electron child window configured to share the opener's process). Keeps today's toolbar model, which holds
     `ReactNode`s and render callbacks (`toolbarTypes.ts:52`). Electron only guarantees this for suitably
     configured same-site child windows, so it is a configuration, not an identity guarantee.
  2. **Separate renderers with a protocol:** needs a serialisable view/toolbar description, a much larger change.
  Plan default: 1, unless the prototype shows it cannot hold identity.

### Modality and focus

- One definition of modality, owned by `WindowManager`: **window-modal** (sheet blocks its parent),
  **application-modal** (blocks that application's windows), **workspace-modal** (system alerts). `FocusManager`
  scopes a modal to the windows it blocks instead of applying the newest modal globally. `#makeKey` and focus
  agree: a window that cannot take focus does not become key, and a refused focus request rolls key state back.
- Focus traps, focus return and overlay listeners use the presenting window's document (`ownerDocument`), with
  realm-safe checks (`nodeType`, `ownerDocument.defaultView`) instead of `instanceof`. Required before any
  cross-document leg.
- **One shell.** `ApplicationHost` (single app, no Webspring) presents its full-screen window through the same
  stage presentation, minus the Webspring return; its separate bar and menu code go.

## Phases

Each phase ends green and committable. **Visual gate** means: stop, capture the Atmo Lab (`tests/atmo-lab`,
started with `node node_modules/vite/bin/vite.js --config tests/atmo-lab/vite.config.ts`) and the affected
site apps at desktop and phone, light and dark, Cumulus and Metal, and hand to Claude/the owner.

### Phase 0: evidence (Codex)

- Failing tests that encode the target, one per confirmed problem: unified toolbar in title row; full-screen
  toggle; `appView` window has an id; the two shells produce the same app menu; style per window; split view
  sidebar width survives a stage launch (the likely bug).
- Install the site as a web app with window-controls overlay (Chrome/Edge) and record whether
  `InstalledApplicationTitleBar` overlaps the stage bar. Record the result in this plan.
- Capture the current bars (stage Cumulus/Metal, source-list, document title bar, floating window, panel, HUD,
  installed app) as the parity reference. Commit the captures under `docs/superpowers/evidence/2026-11-14-window-management/`.
- A failing test for the modality mismatch: an application-modal in app A, then `makeKey` on a window of app B;
  key state and the focused responder must agree.

### Phase 0b: transfer prototype (Codex; throwaway branch, decides Phases 2–3)

One document editor with an inspector panel, plus an unrelated document window, moved
stage → floating → child window (`window.open`, same origin) → floating → stage. Run the stage/floating leg
first, then the two-document leg. Prove:

- the same window id, controller and root view controller; draft, selection, undo history, toolbar and
  accessories intact; exactly one live mount; no repeated `windowDidLoad`/`viewDidLoad`;
- sheets, menus and popovers stay owned by the right window; Tab/Escape, key vs main, command routing and focus
  return work in both documents;
- interrupting a transfer, closing the destination mid-transfer, vetoing an application quit and delivering
  stale focus events all roll back without losing the editor.

Write the result into this plan: the chosen presentation model (shared authority or protocol), the final
`WindowHostEnvironment` shape, and anything that changes Phases 2–3. Shipping Electron stays a separate plan.


#### Transfer prototype results (Sol)

On Chromium, a stable portal container kept the actual class-window renderer mounted while moving between
two same-document slots and then into a same-origin child document. The tests retained the draft, window
ID, load counts, toolbar and accessory. Selection and window undo survived the same-document move. Undo,
attached sheet dismissal via Escape, child close recovery, a destination closed before attachment, and an
application quit veto also passed in the child-window test.

The prototype selected shared authority. Four Chromium tests exercised the portal, same-origin child
document, rollback, and stale activation. Document-local focus and overlay tests subsequently covered
Escape, focus return and nested overlay leases.

The production Webspring integration test, `tests/runtime/application-stage-transfer.test.tsx`, launches a
class app through LaunchServices and moves its full-screen window to the floating presentation and back.
It verifies one window ID, one controller, one load, the same mounted input, the unsaved draft and DOM focus.
The browser stage binding follows committed destination slots and retains the portal when its slot moves.
Chromium captures through the site’s installed SDK show About (Cumulus) and Software (Metal)
leaving the Webspring stage for a floating window at desktop and phone sizes, in both colour schemes.
The [Phase 3 receipt](../evidence/2026-11-14-window-management/phase-3/receipt.json) records the visible destinations.

The production host port handles full-screen intent, close requests and activation events. The stable
container moves between same-document slots. Generation-fenced child-document transfer and rollback are
verified in the prototype. The production bind/unbind acknowledgement, cross-document surface-loss recovery
and launch/return motion acceptance remain open. Electron remains a separate phase.

The current production port exposes capabilities, `requestFullScreen` and the event subscription. The
browser reports `separateSurfaces: false`. Production child-window work still needs an acknowledged,
generation-scoped binding, stylesheet and overlay roots in the destination document, and paired close/loss
handling. The prototype's lifecycle and focus tests are the acceptance cases for that extension.

### Phase 1: dead code and dead fields (Codex)

- Delete `AppFrame.tsx`, `nse-app-frame*` CSS and the `status-bar` theme part; rewrite the two tests and the
  `stage-status-*` catalogue entries to use the window's content border. **Visual gate** (frozen baseline entries change).
- Delete manifest `commands` and `menus` (types, JSON schema, generated validator, docs). Remove them from SynCal.
- Fix the sidebar-width double ownership if Phase 0 proved it: the split view controller is the only owner; the
  stage reads its width for the bar section and never writes it.

### Phase 2: the window model (Codex)

- `NSEWindow`: `styleMask`, `collectionBehavior`, `titleVisibility`, `titlebarAppearsTransparent`,
  `backgroundColor`/`isOpaque`, corner shape, `standardWindowButton(_:)`, `toggleFullScreen()`, `isFullScreen`,
  `performClose()`, `miniaturize()`. All observable; all mutable after creation.
- `WindowManager`: `setStyle(id, style)`, `toggleFullScreen(id)` with the transition states above,
  `kind: "full-screen"` presentation, restoration format bump and migration (`WindowRestoration.ts`).
- Window identity: one controller per window across presentations; `ApplicationSession` drops the separate stage
  controller; stable-container reparenting for same-document moves (per Phase 0b).
- Modality: window/application/workspace-modal in `WindowManager`; `FocusManager` scoped to match; `#makeKey`
  and focus agree. Document-local, realm-safe focus and overlays.
- `NSEWindowController` subclasses can declare defaults (`static styleMask`, etc.) applied before
  `windowDidLoad`; open options can override per window. `appRuntimeFacade.ts` stops stamping the app's style and
  chrome on every window.
- Hooks: `useNSEWindow()`, `useNSEApplication()`; delete `AppWindowClient`, `useWindow`, `useWindowChrome`,
  `AppWindowChromeProps`; migrate the gallery.
- No visual change in this phase.

### Phase 3: host port and browser adapter (Codex)

- `WindowHostEnvironment` as above, browser and test adapters, plumbed through `SynCloudOSProvider`.
- Full screen in the browser: `appView` main windows are real windows with the full-screen bit, presented by the
  stage; leaving full screen floats them. Stage bookkeeping (`Webspring/stage.ts`, `ApplicationStageLayer.tsx`,
  `quickswitchModel.ts`, MultiSwitch, `LaunchServices.ts:878`) keys on window id.
- `ApplicationHost` uses the stage presentation; remove its bar and menu code.
- **Visual gate** (stage launch/return, QuickSwitch, MultiSwitch must look and move as before).

### Phase 4: one title bar (Codex builds, Claude reviews pixels)

- Build `WindowTitlebarView` from `TopBar`'s art and switch callers one at a time: stage apps, single-app host,
  floating windows, panels/HUD/modal/sheet/popover title bars, installed-app overlay.
- Implement `unified`, `unifiedCompact`, `expanded`, `preference`, `titleVisibility`,
  `titlebarAppearsTransparent`, `fullSizeContentView`. With `fullSizeContentView`, expose
  `NSEWindow.contentLayoutRect` and a layout guide (NSWindow.contentLayoutRect/contentLayoutGuide): the region
  not covered by the bar, toolbar and accessories, built on the existing `useNSEWindowChromeObstruction`.
- **Geometry tests, not attribute tests.** Current toolbar-style tests mostly check attributes and text. Add
  measured browser tests for: item placement per style, `contentLayoutRect`, accessory sizing, toolbar overflow
  (items move to the overflow menu, none clipped), the native-control exclusion rect in window-controls overlay,
  and drag regions excluding every interactive item.
- Sidebar section derived from the content's split view; delete `frame.sourceList`, `SourceListFrameContext`'s
  width ownership and the stage rail state.
- Standard toolbar items (above). Migrate each site's `rightSlot` to its chosen gear or person
  `NSEToolbarItem.applicationMenu` (table below). `showPreferences` remains a separate action where declared.
- Remove app-drawn system chrome: Journal, JournalOld, MemoJournal and SynCal stop drawing Return to Webspring
  and app-menu buttons on phones; the window-controls slot provides them. Delete `Libraries/PhoneChrome`.
  **Visual gate** for those apps' phone layouts.
- Custom title-bar looks: add `NSEWindowFrameView` and `NSEWindowController.frameViewClass`; the title bar
  view applies the frame view's metrics and scopes its stylesheet to that window's chrome parts (run it through
  the theme validator). Migrate Journal and JournalOld's two variants to frame views, with their art ported from
  `JournalWindowChrome.tsx` and its CSS, and their variant preference switching `frameViewClass`. Delete
  `windowChrome`, `WindowChromeBridge`, `chromeMode`, `windowDefaults.chrome`, `frame.topBar`.
  **Visual gate:** both Journal variants must match their current look.
- Replace `frame.material`/`background`/`smoothSurface` with window properties; delete `frame` from the manifest
  except `presentationMotion` (launch choreography metadata, used by Chronosphere).
- Delete `TopBar` item model, `TopBarButton` kinds except the Webspring return, `ApplicationHostTitlebar`,
  `ApplicationStageTopBar`, `WindowTitleBar`, `InstalledApplicationTitleBar`.
- **Visual gate** for every surface in the Phase 0 captures. Recorded differences only where the owner decided
  them (toolbar now inline in unified).

### Phase 5: menus (Codex builds, Claude designs the bar)

- System-drawn `NSEApplication.mainMenu` above the title bar, with compact collapse and one application-menu
  builder. The menu bar and the toolbar's `NSEToolbarItem.applicationMenu` are independent opt-ins. Route
  `showPreferences` through the responder chain and delete the manifest menu, `rightSlot` and duplicate builders.
- The menu bar's Atmo art (metal colours, noise) is drawn by Claude in the theme; Codex supplies the structure and
  semantic parts (`data-nse-control="menu-bar"` etc.). **Visual gate.**

### Phase 6: docs and cleanup (Codex)

- Rewrite `docs/framework/windows.md`, `docs/framework/synware-manifest.md`,
  `docs/framework/nse/menus-toolbars-and-inspectors.md` and `docs/framework/appkit-counterparts.json` to the new
  truth. Delete docs for removed APIs. Update the developer MCP idiom rules that mention removed fields.
- Grep for every removed name across framework, site, tests, docs and `scripts/`; nothing may remain.

### Phase 7: item 3 layout features (after Phase 4; Claude leads visuals)

- Three-pane split in Atmo (the model already supports it; needs Atmo seams and a lab page).
- Sidebar and inspector collapse **animation** in `splitViewControllerView.tsx` (reduced motion: instant), wired
  to the `toggleSidebar`/`toggleInspector` items.
- `NSEToolbarItemGroup` with Atmo's circular grouped buttons.
- `NSEWindow.titlebarPresentation` selects attached or floating independently of toolbar style.
  Float Cumulus with a desktop maximum width, while Metal stays attached. Use the same inset groups
  for attached and floating Cumulus. Floating paint is pending design.
- Bottom-bar accessories checked on every host and presentation.

### Phase 8: Electron host (written plan only)

See [Electron window host](2026-11-14-electron-window-host.md).

- Electron adapter implementing `WindowHostEnvironment`: native traffic lights/caption buttons with the title bar
  reserving their rect, real OS full screen, native menu from `mainMenu`.
- Builds on Phase 0b's answer. The Electron-specific questions left for its own plan: child-window
  configuration that keeps shared authority, event-confirmed native full screen on macOS, native menus from
  `mainMenu`, and renderer-crash recovery through `surfaceLost`. No code from this phase lands without its own
  approved plan.

## Site migration inventory (`webspring-folders/site/src/SynWare`, verified)

| Field or API | Apps |
| --- | --- |
| `frame.topBar` | About, AnimationFX, Chronosphere, Diagnostics, Journal, JournalOld, JournalPublisher, MemoJournal, NSEControlGallery, Portfolio, Software, SynCal |
| `frame.rightSlot` | About, Chronosphere, Diagnostics, Journal, JournalOld, JournalPublisher, MemoJournal, NSEControlGallery, Portfolio, Software, SynCal |
| `frame.sourceList` | NSEControlGallery, Software |
| `frame.material` / `background` / `smoothSurface` | the `frame.topBar` apps (check each Info.ts; `background` is also set by some) |
| `frame.presentationMotion` (kept) | Chronosphere |
| `windowDefaults.chrome` / `windowChrome` | Journal, JournalOld |
| App-drawn phone chrome (own Return to Webspring and app-menu buttons, `Libraries/PhoneChrome/glyphs.ts`) | Journal (`JournalPhoneChrome.tsx`), JournalOld, MemoJournal (`MemoJournalViews.tsx`), SynCal (`SynCalViews.tsx`) |
| `applicationMenu` | Journal, JournalOld, JournalPublisher, Portfolio, SynCal |
| `commands` / `menus` (dead) | AnimationFX, Diagnostics, JournalPublisher, NSEControlGallery, SynCal / NSEControlGallery, SynCal |
| `NSEMenuBar` / `mainMenu` | NSEControlGallery |
| `useWindow` / `AppWindowClient` | NSEControlGallery (`GalleryWindowExample.tsx`, `GalleryViewControllers.tsx`) |

The framework's own fixtures (`src/FrameworkTests/`, `tests/e2e/fixtures/`, `tests/runtime/fixtures/`) migrate
in the same commits as the API they use.

## Decisions still open

1. **(Builder)** Drag regions for `fullSizeContentView` content (not frame views, which the system drags):
   `isMovableByWindowBackground` plus the existing chrome-element registration, or a documented drag-region view.
2. **(Builder)** Whether `appView` vs `windowedView` should remain separate manifest values or become one
   `initialWindowState` field. Keep the current values unless the change is free.

## Acceptance

- One title-bar component in `src/`; `rg "TopBarItemKind|ApplicationHostTitlebar|InstalledApplicationTitleBar|AppFrame|rightSlot|sourceList|chromeMode|windowChrome|AppWindowClient|phoneChromeGlyphs"` finds nothing in the framework or site outside git history.
- Every `toolbarStyle` value changes layout as specified, with a runtime test per value.
- A window can enter and leave full screen at runtime in the browser host; an `appView` app's window has an id.
- The single-app host and the stage produce the same title bar and the same application menu for the same app.
- `NSEApplication.mainMenu` appears without the app placing `NSEMenuBar`.
- Every site app runs with no manifest `frame` settings other than `presentationMotion`.
- A window keeps its id, controller and state through stage ↔ floating moves with one live mount (and, if
  Phase 0b chose it, through a child-document round trip); interrupted transfers roll back.
- Key state and the focused responder never disagree; modals block only their domain.
- Full-screen transitions handle refusal, re-toggle, OS-initiated changes and close mid-transition.
- Saved windows from before the change restore with their geometry.
- Runtime, typecheck and e2e outcomes are recorded on frozen source. The single design review owns the
  disposition of any pending visual changes against the preserved baseline.
