# Webspring

Webspring is the shell of a SynCloudOS site. It presents the launcher, hosts the application stage, provides the app switcher and notifications, and runs the sign-in gate. You describe the shell with one manifest and one definition, and the browser host does the rest.

The launcher that ships with the framework is the **Board**, a paged grid of application icons inspired by iOS Springboard. Icons hold to reorder, launch with a zoom into the application stage and return with the reverse motion. The Board adapts from a phone to a desktop display.

## Define a shell

Import the host and launcher styles once in your browser entry:

```ts
import "@syndromatic/syncloudos/browser/styles.css";
import "@syndromatic/syncloudos/webspring/styles.css";
import "@syndromatic/syncloudos/nse/styles.css";
```

Declare the shell in `src/Webspring/Contents/Info.ts`:

```ts
export default {
  schemaVersion: 1,
  bundleIdentifier: "com.example.site",
  version: "0.1.0",
  displayName: "Example Site",
  webspringShell: {
    views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
    defaults: { desktop: "board", tablet: "board", mobile: "board" },
    homeRoute: "/",
    branding: {
      name: { key: "site.name", fallback: "Example Site" },
      logo: { resource: "./Resources/SiteLogo.svg", alternativeText: { key: "site.logoAlt", fallback: "Example Site" } },
    },
  },
} as const;
```

Then create the definition in `src/Webspring/Contents/index.tsx`:

```tsx
import { defineWebspring, WebspringBoardView } from "@syndromatic/syncloudos/webspring";
import manifest from "./Info";

export default defineWebspring({
  manifest,
  components: { board: WebspringBoardView },
});
```

`defineWebspring` validates the manifest, the view identifiers, the supported presentations and the component map, and it returns immutable data. Each entry in `views` names a presentation the shell can show, and `defaults` chooses which view each presentation starts with.

## The Board

The Board shows the icons of every application whose manifest sets `webspring.visible`. Position follows `webspring.order`, and `featured` and `defaultSelected` adjust emphasis and initial focus. Users interact as they would on a phone:

- Tap or click an icon to launch the application.
- Hold an icon, or press the keyboard reorder shortcut, to enter editing. Drag icons to new positions, and choose Done to keep the order or cancel to restore it.
- Move between pages by swiping, scrolling or using the keyboard.

Tap, pickup, movement and drop produce haptic feedback through HapticsFX on devices that support it, and honour the user's feedback settings. Reduced motion places icons immediately instead of animating them.

Icon reordering uses captured slot geometry for hit testing, so neighbours do not oscillate while they settle. The launcher owns pointer capture and releases it on pointer up, cancellation, leaving edit mode or unmount.

## Folders

A folder groups applications into one entry on the launcher. Declare folders in `webspringShell.folders`:

```ts
webspringShell: {
  // ...
  folders: {
    editable: true,
    initial: [
      { id: "folder.experiments", title: { key: "folders.experiments", fallback: "Experiments" }, order: 40, apps: ["com.example.lab", "com.example.sketch"] },
    ],
  },
},
```

- `id` starts with `folder.` and is unique. An application appears in at most one folder; `defineWebspring` rejects duplicates.
- `order` places the folder among the applications' `webspring.order` values. On a tie the folder comes first.
- `editable: true` lets visitors make folders by resting an application on another, add to a folder by resting on it, and take an application out by dragging it outside the open folder. A folder that loses its last application disappears. Folders visitors make are titled "Folder" (locale key `webspring.folder.untitled`).
- `editable: false` keeps membership as declared. Visitors can still reorder top-level entries.

An application that becomes visible later joins its declared folder if the visitor's layout still has that folder, and the top level otherwise. Folders whose applications are all hidden are not shown.

The layout persists under the preference key `webspring.layout.v5` as `{ version: 5, order, folders: { [id]: { apps } }, board, updatedAt, source }`, where `order` lists top-level entry keys and `apps` contains canonical case-insensitive bundle identifier keys. Earlier layouts, including v4 with the old application identities, are ignored, not migrated.

On the Board, tapping a folder opens it with the definition's `folderPresentation`. The default is the iOS 6 split: the stage is copied and parted below the folder's cell (its icon and label), revealing the folder's applications on a linen underlay. Escape, or a tap on either half, closes it; reduced motion crossfades instead. Configure or replace it in the definition:

```tsx
import { createWebspringFolderSplitPresentation, defineWebspring, WebspringBoardView } from "@syndromatic/syncloudos/webspring";

export default defineWebspring({
  manifest,
  components: { board: WebspringBoardView },
  folderPresentation: createWebspringFolderSplitPresentation({
    underlay: { image: "/assets/textures/linen.webp", size: "cover", colour: "#2b3038" },
    panelHeight: "content", // or a height in pixels
    notch: true,
    edgeShadow: 0.55, // 0 to 1
    duration: 0.42, // seconds
  }),
});
```

A custom presentation is a component receiving `WebspringFolderPresentationProps`: `folder`, `stage` (the element to present over), `anchor` (the rect of the folder's cell, icon and label), `reducedMotion`, `renderApp(app, index)` and `onClose`. Mark the panel holding the applications with `data-webspring-folder-panel`; the Board takes an application out of the folder when a drag leaves that element.

### Folder icons

Every view draws a folder's icon in one appearance, set with `folderAppearance` in the definition. `WebspringFolderTile` reads it, so a custom view that renders the tile needs no styles of its own:

```tsx
export default defineWebspring({
  manifest,
  components: { board: WebspringBoardView },
  folderAppearance: {
    shape: { kind: "roundedRect", smoothSurface: { radius: "36%", curve: "squircle", smoothing: 0.6 } },
    fill: { kind: "texture", image: "/assets/textures/cotton.jpg", size: "128px", colour: "#20242c" },
  },
});
```

- `shape` is `{ kind: "roundedRect", smoothSurface? }` or `{ kind: "circle" }`. A rounded rectangle is clipped to NSESmoothSurface geometry measured from the tile. `smoothSurface.radius` is a percentage of the tile's shorter side up to `"50%"` (which keeps the shape as the tile scales), pixels, or an NSE radius token. `curve` is `arc`, `squircle`, `superellipse` or `clothoid`, and `smoothing` runs from 0 to 1. The default is `{ kind: "roundedRect", smoothSurface: { radius: "36%", curve: "squircle", smoothing: 0.6 } }`.
- `fill` is `"inset"`, the dark translucent well (the default), or `{ kind: "texture", image, size?, colour? }`: the image URL, a CSS `background-size` (default `cover`) and a CSS colour beneath it (default `transparent`).
- Either fill is pressed into the surface: an inner shadow and a lower highlight inside the shape, and a light lip below it. While an application rests on the folder to join it, the tile grows and a ring follows the shape outside it. In a circle, the member icons are inset to fit inside it.

`defineWebspring` throws a `TypeError` for an unknown field, shape or curve, a radius over `50%`, a smoothing outside 0 to 1, or a texture without an image. A view drawing folder-shaped artwork of its own, such as the well an application rests on before it makes a folder, reads the resolved appearance with `useWebspringFolderAppearance()`.

The open folder's underlay is set separately, on the presentation.

### How the split opens

The split presentation copies the stage's DOM into each half, so it captures nothing and opens without a wait. A copy carries no pixels of its own, so canvases in the stage are drawn across into it; the split's own overlays are left out, every `id` is dropped, and the copy takes no pointer input and is not announced.

Clones keep the stage's full dimensions when its edge is outside the viewport, and are rebuilt when its visible rectangle changes. They are inert as well as hidden from assistive technology; modal focus traversal skips hidden and inert subtrees, so Tab and Shift+Tab stay among the folder's real application controls and never enter either copy.

Every icon in a copy is marked with `data-webspring-folder-backdrop`: `backdrop` for the icons and labels that fade back as the halves part, and `anchor` for the opened folder's own icon, which stays at full strength. A view names its icons with `data-webspring-item-id`, as the Board and the dial do, for the presentation to tell them apart. Styles read these properties on `.webspring-folder-split`:

| Property | Default | Meaning |
|---|---|---|
| `--webspring-folder-backdrop-icon-opacity` | `0.22` | Opacity of the icons and labels behind an open folder. |
| `--webspring-folder-backdrop-icon-saturation` | `0.35` | Saturation of those icons; the wallpaper is untouched. |
| `--webspring-folder-edge-shadow` | `0.55` | Strength of the seam shadows, from the `edgeShadow` option. |
| `--webspring-folder-duration` | `0.42s` | How long the halves take to part or rejoin, from the `duration` option. |
| `--webspring-folder-easing` | `cubic-bezier(.3, .72, .18, 1)` | Shared timing curve for the split, icon fade and seams. |

The fade runs with the halves and reverses as they rejoin.

The triangle is part of the top seam from the first frame, fixed at 14 px deep rather than grown: the stage above the seam dips 14 px into the linen below the folder's cell, with `notch` off meaning a straight seam. At rest the bottom half reaches those 14 px above the seam, so it covers the triangle and the stage reads as unbroken; opening moves the bottom half down, uncovering the triangle first, and closing brings it back over the triangle until it sinks into the bottom seam. The lit seam and its shadow follow the straight edge and the triangle's two edges, deepest at the tip, because the clip sits inside the wrapper that casts them; the bottom seam carries its own light line above the panel's shadow, drawn once the halves have parted. Everything is a CSS filter: no SVG filter references.

The top wrapper uses `drop-shadow(0 1px 0 rgba(255,255,255,.3)) drop-shadow(0 3px 7px rgba(0,0,0,.85))`. The bottom edge uses `inset 0 1px 0 rgba(255,255,255,.3)`, with an outer shadow of `0 -2px 8px rgba(0,0,0,.33)` at the default `edgeShadow`. The triangle's base is 28 px wide, and the seam starts 6 px below the folder cell. The bottom half paints above the top half so it covers the fixed triangle when shut.

With reduced motion the halves do not move; the presentation crossfades between the closed and open states and draws the seams and triangle where they sit.

## Branding

Branding lives in `webspringShell.branding`. The host resolves the logo resource before the shell and sign-in gate mount. Light, dark and compact variants fall back to the primary logo, and then to the localised site name. A SynWare reads the same values from the session:

```tsx
import { useSCOS } from "@syndromatic/syncloudos/sdk";

export function AppHeader() {
  const { branding } = useSCOS();
  return (
    <header>
      {branding.logoUrl ? <img src={branding.logoUrl} alt={branding.logoAlt} /> : null}
      <span>{branding.name}</span>
    </header>
  );
}
```

`branding` is immutable and has the shape `{ name, logoUrl, lightLogoUrl, darkLogoUrl, compactLogoUrl, logoAlt }`. Declare `branding.compactLogo` when a small mark suits the sign-in placard better than the full lockup. Declare `branding.homeIcon` (a single-shape SVG) to draw the top bar's "return to Webspring" button; the theme colours it in its normal, pressed and selected states. Without it the button shows a generic house.

Host recovery alerts distinguish application, site and framework ownership.
Application failures use the registered icon resolved from the app's resources
(for example, `webspring.icon: "./Resources/AppIcon.png"`). Site failures,
including the protected-launch login-session guard, use the configured site logo
and its appearance variants. Framework and root-watchdog failures use the
SynCloudOS logo. The host composes the caution badge at runtime; an unavailable
app or site logo receives caution alone. No precomposed error artwork is needed.

This recovery presentation belongs to the browser host. Applications compose
their own alerts with the existing `NSEAlert` content slot and controls.

## Background and size of the Board

Left alone, the Board is a tinted cotton texture with a spotlight: lighter in the centre, darker at the edges. `background` changes it. `launcher` paints the icon area; `shelf` paints the widget area and is drawn only when the definition has widgets.

```tsx
import { defineWebspring, WebspringBoardView, WebspringSurface } from "@syndromatic/syncloudos/webspring";
import manifest from "./Info";

export default defineWebspring({
  manifest,
  components: { board: WebspringBoardView },
  background: {
    launcher: { ...WebspringSurface.cotton(), tint: { colour: "#7a4a4a", opacity: 0.12 } },
    shelf: WebspringSurface.plain("#0b0d11"),
  },
});
```

A `WebspringSurface` is a plain object. Every field is optional:

| Field | Meaning |
| --- | --- |
| `colour` | The base colour, under the texture. |
| `texture` | `{ image, size?, repeat?, position? }`, or `"none"`. The image tiles unless `repeat` is `false`. |
| `tint` | `{ colour, opacity }`: a wash over the texture. |
| `vignette` | `{ centre?, edge? }`: a spotlight. `centre` lightens the middle with white and `edge` darkens the rim with black, each from 0 to 1. `false` draws none. |
| `overlay` | `{ image, size?, opacity?, blend? }`: an image over everything else, such as a glow. |

`WebspringSurface.cotton()` is the default. `WebspringSurface.plain(colour)` is a flat colour. Spread a preset to change one field. The Board sets the surface as CSS custom properties (`--webspring-launcher-*` and `--webspring-shelf-*`), so a theme can still override them. The framework ships no other Board artwork: supply your own images for a metal or paper look.

The Board scales to the screen. An icon is the largest size that still lets a whole page (four columns by the page's rows) fit without scrolling: the smaller of what the width and the height allow, held between 54 and 180 CSS pixels. On a phone the width decides; on a desktop the height does.

## Widgets on the Board

A widget is a titled panel below the icons that loads its own data, such as a list of recent posts. Declare it with `defineWidget` and list it in the definition. With no widgets there is no shelf at all.

```tsx
import { defineWebspring, defineWidget, WebspringBoardView, type WebspringWidgetViewProps } from "@syndromatic/syncloudos/webspring";
import manifest from "./Info";

interface Post { readonly id: string; readonly title: string }

function LatestView({ data, refresh }: WebspringWidgetViewProps<readonly Post[]>) {
  return <>
    <ul>{data.map((post) => <li key={post.id}>{post.title}</li>)}</ul>
    <button type="button" onClick={refresh}>Refresh</button>
  </>;
}

const latest = defineWidget({
  id: "latest",
  title: { key: "site.latest", fallback: "Latest" },
  icon: "./Resources/news.svg",
  load: async (signal) => {
    const response = await fetch("/api/public-posts?limit=6", { credentials: "same-origin", signal });
    if (!response.ok) throw new Error(`Public posts request failed: ${response.status}`);
    return (await response.json()) as readonly Post[];
  },
  view: LatestView,
  whenEmpty: "hide",
});

export default defineWebspring({
  manifest,
  components: { board: WebspringBoardView },
  widgets: [latest],
});
```

- `load(signal)` returns the data, of any shape. The framework owns the promise. The signal aborts when the Board unmounts, when the person retries or the widget refreshes, and when the load times out.
- `view` is a React component that receives `{ data, refresh }` once the load has succeeded. A view that throws shows the error state; the rest of the Board is untouched.
- `whenEmpty` is `"hide"` (the widget disappears, and so does the shelf if every widget is hidden) or `{ message }` (the message shows in its place). Empty means an empty array, `null` or `undefined`; `isEmpty(data)` replaces that rule.
- The framework draws the other states. While loading it shows a placeholder. A rejected load shows an error with **Retry**. A load that has not settled after `timeout` milliseconds (10 000 by default) is aborted and shows a timeout error with **Retry**, so a widget can never stay on "Loading…".
- `title` is a string, or `{ key, fallback }` looked up in the app's strings. `icon` is a resource path, resolved through the shell's resources.

The endpoint behind `load` decides what is public. Filter drafts, future dated items and deleted records there.

## Mount the shell

Mount the shell through the browser host, as the [runtime guide](runtime.md#mount-a-runtime) describes:

```tsx
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";

const host = await mountSynCloudOS({
  element: document.getElementById("root")!,
  authentication: "disabled",
});

await host.dispose("application shutdown");
```

The Vite plugin discovers `src/SynWare/*.app`, `src/Preferences/*.prefPane`, `src/Widgets/*.widget`, `src/Integrations/*.integration.ts` and the optional shell in `src/Webspring/Contents/index.tsx`. It injects that project into `mountSynCloudOS` automatically. Each application requires `Contents/index.tsx` and `Info.ts` with explicit `bundleIdentifier`, `displayName` and `version`; only schema version, icon and locale resources are filled in. Directory options and `webspringEntry: false` customise discovery. It rejects symbolic links and path/resource collisions, and watches additions and removals.

## Authentication

Pass `"disabled"` for a public site. For server backed sign-in, pass `{ policy: "optional" | "required", service, loginComponent? }`. Optional mode keeps public content available and adds a Sign In control. Required mode holds protected shell content until the server confirms the session. Disabled mode makes no authentication requests and never offers Log Out. An app intended for anonymous launching declares `runtime.policy.public: true`. See [Authentication](authentication.md).

When a gate is configured, the host presents the sign-in window after the icons settle, dims the launcher behind it and keeps the launcher inert until the window has left. Visits without a gate, and visits that are already authenticated, enter without interruption. A tab-local marker in session storage preserves only the held presentation across provider redirects. It stores no identity and grants no access.

## System Preferences

System Preferences is a list of panes. The framework ships six, each one a module of its own: **Account** (only when sign-in is on), **Appearance**, **Audio & Haptics** (`sounds`), **Motion**, **Notifications** and **Language**. Add your own with `definePreferencePane`, and list them in the shell definition.

```tsx
import { defineWebspring, definePreferencePane, type PreferencePaneViewProps } from "@syndromatic/syncloudos/webspring";
import billingIcon from "./Resources/billing.svg";

function BillingPane({ settings, appearance, locale }: PreferencePaneViewProps) {
  return <p className="nse-prefs-note">{locale.activeLocale}, {appearance}</p>;
}

const billing = definePreferencePane({
  id: "billing",
  title: { key: "billing.title", fallback: "Billing" },
  icon: billingIcon,
  order: 600,
  view: BillingPane,
});

export default defineWebspring({
  manifest,
  components: { board: WebspringBoardView },
  preferences: { panes: [billing], hide: ["sounds"] },
});
```

- `view` is a React component. It receives `settings` (the person's current settings), `appearance` (`"light"`, `"dark"` or `"auto"`) and `locale` (the active locale and the supported ones). It re-renders when any of them changes.
- `title` is a string, or `{ key, fallback }` looked up in the system dictionary. `icon` is your artwork, a URL (import the SVG), shown beside the title in the list.
- Panes list in ascending `order`, ties broken by `id`. The built-ins sit at 50 (Account), 100 (Appearance), 200, 300, 400 and 500 (Language).
- Optional `summary` (the line under the title, usually the current value) and `accessory` (a control on the list row, such as a master switch) are React components that receive the same props.
- `hide` removes built-in panes by `id`: `appearance`, `sounds`, `motion`, `notifications`, `language`, `account`. A developer pane with a built-in's `id` replaces that built-in instead. `hide` never removes a developer pane.
- A pane that throws shows "This preference pane could not be loaded." in its place, and System Preferences stays open. A summary that throws shows "Unavailable"; a throwing accessory is dropped.

Themes restyle the window through custom properties alone (`--nse-prefs-panel-background`, `--nse-prefs-selection-background` and the rest, listed at the top of `nsePreferencesToast.css`); the sidebar list layout is the same in every theme. Use the `nse-prefs-section`, `nse-prefs-note` and `nse-prefs-empty` classes and the NSE controls inside a pane so it follows the theme.

## Recovery alerts

The host distinguishes failed communication from a missed response deadline. `CONNECTION_ERROR` means a transport or response-body read failed; the message uses the browser's offline signal when available without claiming which endpoint lost connectivity. `SITE_NOT_RESPONDING` and `APP_NOT_RESPONDING` mean a site or application operation exceeded its deadline. Explicit HTTP errors and invalid server responses retain their authentication or protocol meaning.

HTTP authentication bounds the request and response body together to 15 seconds by default. Set `requestTimeoutMs` on `createHttpAuthentication` to choose another deadline. Its recovery alert offers a real session refresh, and a successful refresh clears that alert. Passive browser reconnection revalidates session reads without overtaking a pending logout or replaying sign-in and sign-out writes.

Applications report remote failures through their existing `useSCOS().errors.capture` client. Pass `code: "CONNECTION_ERROR"` for a known transport failure, or `code: "APP_NOT_RESPONDING"` with `timeoutMs` for a deadline. A `TimeoutError` is recognised as a deadline automatically. Supply `retry` only when there is an actual operation to repeat; a retry failure is reported again, and closing the mounted owner prevents late results from creating alerts. Ordinary programming errors, including arbitrary `TypeError` instances outside the HTTP response reader, are not inferred to be network failures.

The browser host also runs a private worker heartbeat while the document is visible, with a 10 second threshold. A shared main-thread stall belongs to the site because the event loop cannot establish which application caused it. The worker can observe the stall independently, but the page can display its alert only after the main thread resumes; a permanently blocked page cannot render its own recovery UI. Hidden or suspended pages reset the probe. Where a worker cannot run, a supported long-task observer reports completed stalls.

Application alerts resolve the registered AppIcon; site alerts use configured site branding, and framework errors use the SynCloudOS artwork. The caution badge and layout remain host-owned.

## Custom views

The Board is one view. You can supply another component for a view identifier, and it receives `WebspringViewProps`:

- `model` is an immutable snapshot. `model.entrancePhase` is `waiting`, `holding` or `ready`. `model.launchPhase` is `idle`, `staging`, `launching`, `covered` or `returning`. `model.presentationTraits` provides `width`, `height`, `reducedMotion` and `safeAreaInsets`, and `model.branding` holds the resolved branding.
- `model.items` lists the top-level entries in order: `{ kind: "app", id, app, dialPlacement }` or `{ kind: "folder", id, title, apps, badgeCount, dialPlacement }`. `model.apps` lists every visible application flat, folder members inline. `model.folders` holds `editable`, `openFolderId` and `dropTargetId`, and `model.layout.draggingItemId` names the app or folder being dragged.
- `actions` is the command surface for the shell: application, home, reorder, editing, drag, folder and authentication operations. Reordering is `moveItem(itemId, index)` within the item's container (the top level, or its folder) and `moveItemByKeyboard(itemId, key, columns)`. Folders use `setDropTarget(itemId | null)` while an app hovers over an entry, `dropOnItem(appId, targetItemId)` to merge, `moveAppOutOfFolder(appId, index)`, `openFolder(folderId)` and `closeFolder()`. Drags run between `beginDrag(itemId)` and `finishDrag(commit)`; changes made during a drag persist when it commits and revert when it is cancelled. A view that draws a launch or return transition reports completion with `completeLaunch(transitionId, appId)` and `completeReturnTrack("material" | "icons")`.
- `applicationOutlet` is a host-owned React node. Place it where the application should appear, and leave it as it is.
- `folderPresentation` is the definition's folder presentation. Render it while `model.folders.openFolderId` is set.

Elements a view hands to the drag hit-testing helpers carry `data-webspring-item-id` and `data-order-index`.

A drag arbitrates from the dragged icon's centre, not the pointer. `useWebspringDragProxyPosition` keeps the grab offset, so the icon's centre is what rests on a target. `createWebspringDragArbiter` times the rests and reports them to the view through four commands: `reorder(index)`, `merge(targetId | null)` for the drop well, `springOpen(folderId)` and `leavePanel(folderId)`. A custom view calls `update(centre, view)` on each pointer move with the centre and its container's entries, `clear()` when its layout changes under the drag, and `end()` on release, which reports the drop well, the folder and the index the release falls on. The rules are:

- Reorder: once the icon has rested 150 ms on the slot whose artwork is nearest its centre, it moves there. When that nearest slot is its own, nothing moves. Leaving and returning restarts the wait.
- Merge: an app whose centre rests over another app's artwork for 350 ms arms a drop well (`setDropTarget`). The label is not part of the target. Releasing on the well calls `dropOnItem`.
- Folder: a folder's artwork, with a 20 % margin around it, takes an app after 200 ms on it, as a drop well.
- Spring: an app whose centre has been on a folder for 800 ms opens it under the drag, with `openFolder(folderId, { duringDrag: true })`, and the drop well gives way to the panel. The drag continues inside the panel.
- Panel: the folder stays open while the centre is inside its panel or in the band between the folder's cell and the panel's top edge. Crossing the panel's edge calls `leavePanel`, once per departure; a member that leaves first moves out with `moveAppOutOfFolder`. Only a member reorders inside its panel. An app from the Board is held there until release and joins at the nearest member's slot.
- Folders never merge. Where the folders are fixed (`editable: false`), an app does not merge, so no drop well or spring-open arises.

`captureWebspringDragArtworkRects` measures the artwork zones the rules test against.

A custom view owns its markup, styles and choreography. The host owns sessions, routing, application lifecycle, focus, overlays and cleanup, so a view never creates runtime sessions or reads host services. Use `model.presentationTraits.reducedMotion` to choose a static response when the user prefers less motion.

A view declares which return tracks it reports by setting `returnTracks` on the component, for example `Object.assign(MyLauncher, { returnTracks: ["material", "icons"] as const })`. A view that declares none is expected to report both.

The pieces the Board is built from are public, so a custom launcher can share its behaviour:

| Export | Purpose |
| --- | --- |
| `WebspringLaunchDim`, `resolveWebspringLaunchDimMotion` | The dim drawn over the launcher while an application opens. |
| `WebspringDragProxy`, `useWebspringDragProxyPosition`, `getWebspringDragGrabOffset` | The icon or folder that follows the pointer while the user reorders, keeping the grab offset from the icon's centre. |
| `createWebspringDragArbiter`, `captureWebspringDragArtworkRects` | The Board's drag rules: artwork hit zones, rests, folder spring-open and the panel boundary. |
| `captureWebspringDragReorderSlots`, `getWebspringDragReorderTargetFromPoint` | Hit testing for drag reordering against the slots the view draws. |
| `WebspringFolderTile`, `createWebspringFolderSplitPresentation` | A folder's icon tile of its members, and the default folder presentation. |
| `useWebspringFolderAppearance` | The definition's folder appearance, for artwork that matches the folder tile. |
| `WebspringWidgetShelf`, `defineWidget` | The widget shelf for `model.widgets`: it loads each widget and draws its loading, empty, error and timeout states. |
| `WebspringSurface`, `webspringSurfaceStyle` | The surface presets, and the CSS custom properties that paint a surface. `model.background` holds the resolved launcher and shelf surfaces. |
| `WebspringIconArtwork`, `WebspringIconEffect` | An application's icon artwork, and the shell's declared icon effect. |
| `resolveWebspringIconPresentation`, `webspringIconSprings`, `getWebspringRadialExitForIcon`, `useWebspringMotion` | Icon entrance, launch and return motion, standard and reduced. |
| `getWebspringSelectorTransform`, `resolveWebspringOrbPresentation` | Selector and orb motion for a radial launcher. |
| `WEBSPRING_STAGE`, `getDesktopWebspringLayout`, `stagePointStyle` | The desktop stage geometry. Each entry's radial placement is `model.items[].dialPlacement`: the first seven entries sit on the dial, the rest on the overflow shelf. |

A radial launcher with an orb and selector can be built entirely from these exports.

## Scope

Webspring is a browser shell with a client side router and application host. It renders in the browser, so server side rendering, server rendered metadata and search indexing sit outside its scope.
