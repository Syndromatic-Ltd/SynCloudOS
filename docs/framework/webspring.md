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
  id: "com.example.site",
  version: "0.1.0",
  title: "Example Site",
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

The layout persists under the preference key `webspring.layout.v4` as `{ version: 4, order, folders: { [id]: { apps } }, board, updatedAt, source }`, where `order` lists top-level entries. Layouts stored under an earlier version are ignored.

On the Board, tapping a folder opens it with the definition's `folderPresentation`. The default is the iOS 6 split: the stage is captured and parted below the folder's cell (its icon and label), revealing the folder's applications on a linen underlay. Escape, or a tap on either half, closes it; reduced motion crossfades instead. Configure or replace it in the definition:

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

A presentation may also carry three optional functions. `prepare(stage)` starts the work an opening needs as the user reaches for a folder. `keepPrepared(stage)` keeps that work done ahead of any reach while the view is at rest, and returns the function that stops it. `warm()` loads what the presentation needs ahead of any folder.

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

### Preparing a folder to open

The split can only begin once the stage is captured, so the split presentation keeps a snapshot ready:

- **At rest**, it keeps a current snapshot of the stage. Any change to the stage's content, text or attributes (other than ARIA state), any scroll and any resize make the snapshot stale; it is retaken at idle once the stage has been quiet for 300 ms, at most every two seconds, and never while a finite animation is running in the stage. Because that covers everything a view draws from its DOM, a background snapshot does not expire. A tap with no hover before it opens from this snapshot at once.
- **On a reach** (hover, press or focus), it holds the current snapshot, or takes one if there is none. The press and the opening change the stage themselves, so a held snapshot ignores changes for four seconds; after that a changed snapshot is dropped and, at rest, retaken.

A view drives this with one hook:

```tsx
import { useWebspringFolderPreparation } from "@syndromatic/syncloudos/webspring";

const prepareFolder = useWebspringFolderPreparation(folderPresentation, hasFolders ? stageElement : null, {
  atRest: !launching && !editing && !dragging && !folderOpen,
});

<button onPointerEnter={prepareFolder} onPointerDown={prepareFolder} onFocus={prepareFolder} onClick={open}>…</button>
```

The hook warms the presentation while it has a stage, keeps an opening prepared while `atRest` is true, and returns a stable function that calls `prepare` with the stage. Pass a null stage while the view shows no folders. The Board is at rest when no launch, entrance, edit, drag or open folder is under way, and prepares on a folder's hover, press and focus.

## Branding

Branding lives in `webspringShell.branding`. The host resolves the logo resource before the shell and sign-in gate mount. Light, dark and compact variants fall back to the primary logo, and then to the localised site name. A SynWare reads the same values from the session:

```tsx
import { useSynWare } from "@syndromatic/syncloudos/sdk";

export function AppHeader() {
  const { branding } = useSynWare();
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
import { bundles, shell, shellResources } from "virtual:syncloudos/composition";

const host = await mountSynCloudOS({
  element: document.getElementById("root")!,
  bundles,
  shell,
  shellResources,
  authentication: "disabled",
});

await host.dispose("application shutdown");
```

The Vite plugin builds the virtual composition module from your shell and bundles. By default it looks in `src/SynWare/*.app` and `src/Webspring/Contents/index.tsx`. `synCloudOS({ appsDirectory, webspringEntry })` chooses other locations, and `webspringEntry: false` produces a composition of applications alone. Discovery requires each bundle to have `Contents/Info.ts` and `Contents/index.tsx`. It rejects symbolic links, duplicate paths and resources that escape the bundle, and it watches for bundles added or removed while the dev server runs.

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

Applications report remote failures through their existing `useSynWare().errors.capture` client. Pass `code: "CONNECTION_ERROR"` for a known transport failure, or `code: "APP_NOT_RESPONDING"` with `timeoutMs` for a deadline. A `TimeoutError` is recognised as a deadline automatically. Supply `retry` only when there is an actual operation to repeat; a retry failure is reported again, and closing the mounted owner prevents late results from creating alerts. Ordinary programming errors, including arbitrary `TypeError` instances outside the HTTP response reader, are not inferred to be network failures.

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

A custom view owns its markup, styles and choreography. The host owns sessions, routing, application lifecycle, focus, overlays and cleanup, so a view never creates runtime sessions or reads host services. Use `model.presentationTraits.reducedMotion` to choose a static response when the user prefers less motion.

A view declares which return tracks it reports by setting `returnTracks` on the component, for example `Object.assign(MyLauncher, { returnTracks: ["material", "icons"] as const })`. A view that declares none is expected to report both.

The pieces the Board is built from are public, so a custom launcher can share its behaviour:

| Export | Purpose |
| --- | --- |
| `WebspringLaunchDim`, `resolveWebspringLaunchDimMotion` | The dim drawn over the launcher while an application opens. |
| `WebspringDragProxy`, `useWebspringDragProxyPosition` | The icon or folder that follows the pointer while the user reorders. |
| `captureWebspringDragReorderSlots`, `getWebspringDragReorderTargetFromPoint` | Hit testing for drag reordering against the slots the view draws. |
| `WebspringFolderTile`, `createWebspringFolderSplitPresentation`, `useWebspringFolderPreparation` | A folder's icon tile of its members, the default folder presentation, and preparing a folder to open. |
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
