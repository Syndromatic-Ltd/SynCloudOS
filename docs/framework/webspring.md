# Webspring

Webspring is the shell of a SynCloudOS site. It presents the launcher, hosts the application stage, provides the app switcher and notifications, and runs the sign-in gate. You describe the shell with its `WSInfo` and a `WSApplication` subclass, and the browser host does the rest.

The launcher that ships with the framework is the Board, `WSBoardViewController`, a paged grid of application icons inspired by iOS Springboard. Icons hold to reorder, launch with a zoom into the application stage and return with the reverse motion, adapting from a phone to a desktop display.

## Define a shell

Import the host and launcher styles once in your browser entry:

```ts
import "@syndromatic/syncloudos/browser/styles.css";
import "@syndromatic/syncloudos/webspring/styles.css";
import "@syndromatic/syncloudos/nse/styles.css";
```

Declare the shell in `src/Webspring/Contents/Info.ts`:

```ts
import type { WSInfo } from "@syndromatic/syncloudos/webspring";

export default {
  bundleIdentifier: "com.example.site",
  version: "0.1.0",
  displayName: "Example Site",
  homeRoute: "/",
  branding: {
    name: { key: "site.name", fallback: "Example Site" },
    logo: { resource: "./Resources/SiteLogo.svg", alternativeText: { key: "site.logoAlt", fallback: "Example Site" } },
  },
} satisfies WSInfo;
```

Then subclass `WSApplication` and create the definition in `src/Webspring/Contents/index.tsx`:

```tsx
import { WSApplication, createWebspring } from "@syndromatic/syncloudos/webspring";
import info from "./Info";

class ExampleSite extends WSApplication {}

export default createWebspring({ info, application: ExampleSite });
```

`createWebspring` validates the info and the application's statics, and returns immutable data. The framework constructs the `WSApplication` itself and calls `applicationWillFinishLaunching`, `applicationDidFinishLaunching` and `applicationWillTerminate` around the shell's life. Every presentation shows the Board unless the class names another launcher with `static mainViewController`, or one per presentation with `static viewControllers`.

## The Board

The Board shows the icons of every application whose manifest sets `webspring.visible`. Position follows `webspring.order`, and `featured` and `defaultSelected` adjust emphasis and initial focus. Users interact as they would on a phone:

- Tap or click an icon to launch the application.
- Hold an icon, or press the keyboard reorder shortcut, to enter editing. Drag icons to new positions, and choose Done to keep the order or cancel to restore it.
- Move between pages by swiping, scrolling or using the keyboard.

Tap, pickup, movement and drop produce haptic feedback through HapticsFX on devices that support it, and honour the user's feedback settings. Reduced motion places icons immediately instead of animating them.

Application-stage selection is case-insensitive, whether an app opens from a Board icon or a direct route. The stage keeps the identifier spelling declared in `Info.ts`; selecting the same app with different identifier case does not replace its native main view or discard its input and focus.

Icon reordering uses captured slot geometry for hit testing, so neighbours do not oscillate while they settle. The launcher owns pointer capture and releases it on pointer up, cancellation, leaving edit mode or unmount.

## Folders

A folder groups applications into one entry on the launcher. Declare folders in `folders` in `Info.ts`:

```ts
export default {
  // ...
  folders: {
    editable: true,
    initial: [
      { id: "folder.experiments", title: { key: "folders.experiments", fallback: "Experiments" }, order: 40, apps: ["com.example.lab", "com.example.sketch"] },
    ],
  },
} satisfies WSInfo;
```

- `id` starts with `folder.` and is unique. An application appears in at most one folder; `createWebspring` rejects duplicates.
- `order` places the folder among the applications' `webspring.order` values. On a tie the folder comes first.
- `editable: true` lets visitors make folders by resting an application on another, add to a folder by resting on it, and take an application out by dragging it outside the open folder. A folder that loses its last application disappears. Folders visitors make are titled "Folder" (locale key `webspring.folder.untitled`).
- `editable: false` keeps membership as declared. Visitors can still reorder top-level entries.

An application that becomes visible later joins its declared folder if the visitor's layout still has that folder, and the top level otherwise. Folders whose applications are all hidden are not shown.

The layout persists under the preference key `webspring.layout.v5` as `{ version: 5, order, folders: { [id]: { apps } }, board, updatedAt, source }`, where `order` lists top-level entry keys and `apps` contains canonical case-insensitive bundle identifier keys. Earlier layouts, including v4 with the old application identities, are ignored, not migrated.

On the Board, tapping a folder opens it with the application's `static folderPresentation`. The default is the iOS 6 split: the stage is copied and parted below the folder's cell (its icon and label), revealing the folder's applications on a linen underlay. Escape, or a tap on either half, closes it; reduced motion crossfades instead. Configure or replace it on the `WSApplication` subclass:

```tsx
import { WSApplication, createWSFolderSplitPresentation } from "@syndromatic/syncloudos/webspring";

class ExampleSite extends WSApplication {
  static override folderPresentation = createWSFolderSplitPresentation({
    underlay: { image: "/assets/textures/linen.webp", size: "cover", colour: "#2b3038" },
    panelHeight: "content", // or a height in pixels
    notch: true,
    edgeShadow: 0.55, // 0 to 1
    duration: 0.42, // seconds
  });
}
```

A custom presentation is a component receiving `WebspringFolderPresentationProps`: `folder`, `stage` (the element to present over), `anchor` (the rect of the folder's cell, icon and label), `reducedMotion`, `renderApp(app, index)` and `onClose`. Mark the panel holding the applications with `data-webspring-folder-panel`; the Board takes an application out of the folder when a drag leaves that element.

### Folder icons

Every launcher draws a folder's icon in one appearance, set with `static folderAppearance`. `WSFolderTileView` reads it, so a custom launcher that renders the tile needs no styles of its own:

```tsx
class ExampleSite extends WSApplication {
  static override folderAppearance = {
    shape: { kind: "roundedRect", smoothSurface: { radius: "36%", curve: "squircle", smoothing: 0.6 } },
    fill: { kind: "texture", image: "/assets/textures/cotton.jpg", size: "128px", colour: "#20242c" },
  } as const;
}
```

- `shape` is `{ kind: "roundedRect", smoothSurface? }` or `{ kind: "circle" }`. A rounded rectangle is clipped to the internal smooth-corner geometry measured from the tile. `smoothSurface.radius` is a percentage of the tile's shorter side up to `"50%"` (which keeps the shape as the tile scales), pixels, or an NSE radius token. `curve` is `arc`, `squircle`, `superellipse` or `clothoid`, and `smoothing` runs from 0 to 1. The default is `{ kind: "roundedRect", smoothSurface: { radius: "36%", curve: "squircle", smoothing: 0.6 } }`.
- `fill` is `"inset"`, the dark translucent well (the default), or `{ kind: "texture", image, size?, colour? }`: the image URL, a CSS `background-size` (default `cover`) and a CSS colour beneath it (default `transparent`).
- Either fill is pressed into the surface: an inner shadow and a lower highlight inside the shape, and a light lip below it. While an application rests on the folder to join it, the tile grows and a ring follows the shape outside it. In a circle, the member icons are inset to fit inside it.

`createWebspring` throws a `TypeError` for an unknown field, shape or curve, a radius over `50%`, a smoothing outside 0 to 1, or a texture without an image. A launcher drawing folder-shaped artwork of its own, such as the well an application rests on before it makes a folder, reads the resolved appearance with `useWebspringFolderAppearance()`.

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

The folder underlay projects 14 px above the top seam towards the originating folder icon.
The upper stage clone has an upward triangular cutout; one backdrop paints the pointer and panel
without a texture break or a straight shadow across the pointer's base. With `notch` off the seam
stays straight. At rest the bottom clone reaches 14 px above the seam and covers the cutout, so
the closed stage has no visible notch. Opening uncovers the tip first; closing covers it again
as the halves rejoin. The upper wrapper's CSS light and shadow follow the clipped contour along
both pointer edges, and the bottom seam carries its own light line. No SVG fragment references
are needed.

The top wrapper uses `drop-shadow(0 1px 0 rgba(255,255,255,.3)) drop-shadow(0 3px 7px rgba(0,0,0,.85))`. The bottom edge uses `inset 0 1px 0 rgba(255,255,255,.3)`, with an outer shadow of `0 -2px 8px rgba(0,0,0,.33)` at the default `edgeShadow`. The triangle's base is 28 px wide, and the seam starts 6 px below the folder cell. The bottom half paints above the top half so it covers the fixed triangle when shut.

With reduced motion the halves do not move; the presentation crossfades between the closed and open states and draws the seams and triangle where they sit.

## Branding

Branding lives in `branding` in `Info.ts`. The host resolves the logo resource before the shell and sign-in gate mount. Light, dark and compact variants fall back to the primary logo, and then to the localised site name. A SynWare reads the same values from the session:

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
their own alerts with the `NSEAlert` object and present custom content as a sheet (`presentAsSheet`).

## Background and size of the Board

Left alone, the Board is a tinted cotton texture with a spotlight: lighter in the centre, darker at the edges. `static launcherSurface` paints the icon area; `static shelfSurface` paints the widget area and is drawn only when the shell has widgets.

```tsx
import { WSApplication, WSSurface } from "@syndromatic/syncloudos/webspring";

class ExampleSite extends WSApplication {
  static override launcherSurface = { ...WSSurface.cotton(), tint: { colour: "#7a4a4a", opacity: 0.12 } };
  static override shelfSurface = WSSurface.plain("#0b0d11");
}
```

A `WSSurface` is a plain object. Every field is optional:

| Field | Meaning |
| --- | --- |
| `colour` | The base colour, under the texture. |
| `texture` | `{ image, size?, repeat?, position? }`, or `"none"`. The image tiles unless `repeat` is `false`. |
| `tint` | `{ colour, opacity }`: a wash over the texture. |
| `vignette` | `{ centre?, edge? }`: a spotlight. `centre` lightens the middle with white and `edge` darkens the rim with black, each from 0 to 1. `false` draws none. |
| `overlay` | `{ image, size?, opacity?, blend? }`: an image over everything else, such as a glow. |

`WSSurface.cotton()` is the default. `WSSurface.plain(colour)` is a flat colour. Spread a preset to change one field. The Board sets the surface as CSS custom properties (`--webspring-launcher-*` and `--webspring-shelf-*`), so a theme can still override them. The framework ships no other Board artwork: supply your own images for a metal or paper look.

The Board scales to the screen. An icon is the largest size that still lets a whole page (four columns by the page's rows) fit without scrolling: the smaller of what the width and the height allow, held between 54 and 180 CSS pixels. On a phone the width decides; on a desktop the height does.

## Widgets on the Board

A widget is a titled panel below the icons that loads its own data, such as a list of recent posts. Declare it by subclassing `WSWidget` and list it in `static widgets`. With no widgets there is no shelf at all.

```tsx
import { WSApplication, WSWidget, createWebspring } from "@syndromatic/syncloudos/webspring";
import info from "./Info";

interface Post { readonly id: string; readonly title: string }

class LatestWidget extends WSWidget<readonly Post[]> {
  static id = "latest";
  static title = { key: "site.latest", fallback: "Latest" };
  static icon = "./Resources/news.svg";
  static whenEmpty = "hide" as const;

  override async load(signal: AbortSignal) {
    const response = await fetch("/api/public-posts?limit=6", { credentials: "same-origin", signal });
    if (!response.ok) throw new Error(`Public posts request failed: ${response.status}`);
    return (await response.json()) as readonly Post[];
  }

  override renderView() {
    return <>
      <ul>{this.data.map((post) => <li key={post.id}>{post.title}</li>)}</ul>
      <button type="button" onClick={() => this.refresh()}>Refresh</button>
    </>;
  }
}

class ExampleSite extends WSApplication {
  static override widgets = [LatestWidget];
}

export default createWebspring({ info, application: ExampleSite });
```

- `load(signal)` returns the data, of any shape. The framework owns the promise. The signal aborts when the Board unmounts, when the person retries or `refresh()` runs, and when the load times out.
- `renderView()` (or `static view`) draws the view once the load has succeeded, reading `this.data`. A view that throws shows the error state; the rest of the Board is untouched.
- `static whenEmpty` is `"hide"` (the widget disappears, and so does the shelf if every widget is hidden) or `{ message }` (the message shows in its place). Empty means an empty array, `null` or `undefined`; overriding `isEmpty(data)` replaces that rule.
- The framework draws the other states: while loading it shows a placeholder, a rejected load shows an error with Retry, and a load that has not settled after `static timeout` milliseconds (10 000 by default) is aborted and shows a timeout error with Retry, so a widget can never stay on "Loading…".
- `static title` is a string, or `{ key, fallback }` looked up in the app's strings. `static icon` is a resource path, resolved through the shell's resources.

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

System Preferences is a list of panes. The framework ships ten, each one a module of its own: Account (only when sign-in is on), Appearance, Audio & Haptics (`sounds`), Motion, Notifications, Privacy & Security (`privacy-security`), Language, Updates, Storage and Capabilities. Add your own by subclassing `NSEPreferencePane`, and list them in `static preferencePanes` or place them in `src/Preferences/*.prefPane/index.tsx`.

```tsx
import { NSEPreferencePane, WSApplication } from "@syndromatic/syncloudos/webspring";
import billingIcon from "./Resources/billing.svg";

class BillingPane extends NSEPreferencePane {
  static id = "billing";
  static title = { key: "billing.title", fallback: "Billing" };
  static icon = billingIcon;
  static order = 700;

  override renderView() {
    return <p className="nse-prefs-note">{this.locale.activeLocale}, {this.appearance}</p>;
  }
}

class ExampleSite extends WSApplication {
  static override preferencePanes = [BillingPane];
  static override hiddenPreferencePanes = ["sounds"];
}
```

- Override `renderView()` (or declare `static view`) to render the pane. The controller receives live `this.settings` (the person's current settings), `this.appearance` (`"light"`, `"dark"` or `"auto"`) and `this.locale` (the active locale and the supported ones), and re-renders when any of them changes.
- `static title` is a string, or `{ key, fallback }` looked up in the system dictionary. `static icon` is your artwork, a URL (import the SVG), shown beside the title in the list.
- Panes list in ascending `static order`, ties broken by `static id`. The built-ins sit at 50 (`account`), 100 (`appearance`), 200 (`sounds`), 300 (`motion`), 400 (`notifications`), 450 (`privacy-security`), 500 (`language`), 600 (`updates`), 650 (`storage`) and 660 (`capabilities`).
- Optional `renderSummary()` (the line under the title, usually the current value) and `renderAccessory()` (a control on the list row, such as a master switch) read the same controller properties.
- `static hiddenPreferencePanes` removes built-in panes by `id`: `account`, `appearance`, `sounds`, `motion`, `notifications`, `privacy-security`, `language`, `updates`, `storage`, `capabilities`. A developer pane with a built-in's `id` replaces that built-in instead, and hiding never removes a developer pane.
- A pane that throws shows "This preference pane could not be loaded." in its place, and System Preferences stays open. A summary that throws shows "Unavailable"; a throwing accessory is dropped.

Themes restyle the window through custom properties alone (`--nse-prefs-panel-background`, `--nse-prefs-selection-background` and the rest, listed at the top of `nsePreferencesToast.css`); the sidebar list layout is the same in every theme. Use the `nse-prefs-section`, `nse-prefs-note` and `nse-prefs-empty` classes and the NSE controls inside a pane so it follows the theme.

## Recovery alerts

The host distinguishes failed communication from a missed response deadline. `CONNECTION_ERROR` means a transport or response-body read failed; the message uses the browser's offline signal when available without claiming which endpoint lost connectivity. `SITE_NOT_RESPONDING` and `APP_NOT_RESPONDING` mean a site or application operation exceeded its deadline. Explicit HTTP errors and invalid server responses retain their authentication or protocol meaning.

HTTP authentication bounds the request and response body together to 15 seconds by default. Set `requestTimeoutMs` on `createHttpAuthentication` to choose another deadline. Its recovery alert offers a real session refresh, and a successful refresh clears that alert. Passive browser reconnection revalidates session reads without overtaking a pending logout or replaying sign-in and sign-out writes.

Applications report remote failures through their existing `useSCOS().errors.capture` client. Pass `code: "CONNECTION_ERROR"` for a known transport failure, or `code: "APP_NOT_RESPONDING"` with `timeoutMs` for a deadline. A `TimeoutError` is recognised as a deadline automatically. Supply `retry` only when there is an actual operation to repeat; a retry failure is reported again, and closing the mounted owner prevents late results from creating alerts. Ordinary programming errors, including arbitrary `TypeError` instances outside the HTTP response reader, are not inferred to be network failures.

The browser host also runs a private worker heartbeat while the document is visible, with a 10 second threshold. A shared main-thread stall belongs to the site because the event loop cannot establish which application caused it. The worker can observe the stall independently, but the page can display its alert only after the main thread resumes; a permanently blocked page cannot render its own recovery UI. Hidden or suspended pages reset the probe. Where a worker cannot run, a supported long-task observer reports completed stalls.

Application alerts resolve the registered AppIcon; site alerts use configured site branding, and framework errors use the SynCloudOS artwork. The caution badge and layout remain host-owned.

## Custom launchers

The Board is one launcher. For another, subclass `WSLauncherViewController` and name it in `static mainViewController`, or per presentation in `static viewControllers`:

```tsx
import { WSApplication, WSIconView, WSLauncherViewController } from "@syndromatic/syncloudos/webspring";

class GridLauncher extends WSLauncherViewController {
  override renderView() {
    return <div className="grid">{this.items.map((item, index) => <WSIconView key={item.id} item={item} index={index} />)}</div>;
  }
}

class ExampleSite extends WSApplication {
  static override mainViewController = GridLauncher;
}
```

- The controller reads the shell's state through getters: `items`, `apps`, `widgets`, `folders`, `branding`, `account`, `isEditing`, `draggingItemId`, `entrancePhase` (`waiting`, `holding` or `ready`), `launchPhase` (`idle`, `staging`, `launching`, `covered` or `returning`), `presentationTraits` (`width`, `height`, `reducedMotion` and `safeAreaInsets`) and the rest. `items` lists the top-level entries in order: `{ kind: "app", id, app, dialPlacement }` or `{ kind: "folder", id, title, apps, badgeCount, dialPlacement }`; `apps` lists every visible application flat.
- Its commands act on the shell: `openApp`, `returnHome`, `beginEditing`, `finishEditing`, `moveItem(itemId, index)`, `moveItemByKeyboard(itemId, key, columns)`, `openFolder`, `closeFolder` and the rest. A launcher that draws a return transition reports it with `completeReturnTrack("material" | "icons")`.
- `renderView()`, or `static view`, which receives `controller`, draws the launcher. `WSIconView` draws one entry: it launches, opens folders, enters editing on a long press, drags and reorders from the keyboard with no code of the launcher's own.
- `WSLauncherRootView`, around every launcher, owns pointer capture, the drag proxy, the open folder, the launch dim, the live region and the application outlet. `launcherRootProps()` sets its element and attributes.
- `static mode` is `"launcher"` or `"persistent"`; a persistent launcher stays on screen, so its `homeRoute` may be an application's route. `static presentations`, `static returnTracks` (default `["material", "icons"]`) and `static launchZoom` describe the rest.
- Hooks let a launcher shape the shared behaviour: `revealItem`, `dragDidReachEdge`, `launcherDidSwipe`, `launcherWillOpenApp`, `launcherDidNotOpenApp`, `launchPhaseDidChange`, `launchCompletionDelay`, `renderFolderItem` and `folderAnchor`.

If a custom launcher throws, the shell shows an alert with Use fallback view, which puts the Board in its place for that presentation.

Elements a launcher hands to the drag hit-testing helpers carry `data-webspring-item-id` and `data-order-index`.

A drag arbitrates from the dragged icon's centre, not the pointer. `useWSDragProxyPosition` keeps the grab offset, so the icon's centre is what rests on a target. `createWSDragArbiter` times the rests and reports them to the launcher through four commands: `reorder(index)`, `merge(targetId | null)` for the drop well, `springOpen(folderId)` and `leavePanel(folderId)`. `WSLauncherRootView` drives it for `WSIconView`; a launcher drawing its own icons calls `update(centre, view)` on each pointer move with the centre and its container's entries, `clear()` when its layout changes under the drag, and `end()` on release, which reports the drop well, the folder and the index the release falls on. The rules are:

- Reorder: once the icon has rested 150 ms on the slot whose artwork is nearest its centre, it moves there. When that nearest slot is its own, nothing moves. Leaving and returning restarts the wait.
- Merge: an app whose centre rests over another app's artwork for 350 ms arms a drop well (`setDropTarget`). The label is not part of the target. Releasing on the well calls `dropOnItem`.
- Folder: a folder's artwork, with a 20 % margin around it, takes an app after 200 ms on it, as a drop well.
- Spring: an app whose centre has been on a folder for 800 ms opens it under the drag, with `openFolder(folderId, { duringDrag: true })`, and the drop well gives way to the panel. The drag continues inside the panel.
- Panel: the folder stays open while the centre is inside its panel or in the band between the folder's cell and the panel's top edge. Crossing the panel's edge calls `leavePanel`, once per departure; a member that leaves first moves out with `moveAppOutOfFolder`. Only a member reorders inside its panel. An app from the Board is held there until release and joins at the nearest member's slot.
- Folders never merge. Where the folders are fixed (`editable: false`), an app does not merge, so no drop well or spring-open arises.

`captureWSDragArtworkRects` measures the artwork zones the rules test against.

A custom launcher owns its markup, styles and choreography. The host owns sessions, routing, application lifecycle, focus, overlays and cleanup, so a launcher never creates runtime sessions or reads host services. Use `presentationTraits.reducedMotion` to choose a static response when the user prefers less motion.

The pieces the Board is built from are public, so a custom launcher can share its behaviour:

| Export | Purpose |
| --- | --- |
| `WSLaunchDim`, `resolveWebspringLaunchDimMotion` | The dim drawn over the launcher while an application opens. |
| `WSDragProxy`, `useWSDragProxyPosition`, `getWebspringDragGrabOffset` | The icon or folder that follows the pointer while the user reorders, keeping the grab offset from the icon's centre. |
| `createWSDragArbiter`, `captureWSDragArtworkRects` | The Board's drag rules: artwork hit zones, rests, folder spring-open and the panel boundary. |
| `captureWebspringDragReorderSlots`, `getWebspringDragReorderTargetFromPoint` | Hit testing for drag reordering against the slots the view draws. |
| `WSFolderTileView`, `createWSFolderSplitPresentation` | A folder's icon tile of its members, and the default folder presentation. |
| `useWebspringFolderAppearance` | The shell's folder appearance, for artwork that matches the folder tile. |
| `WSWidgetShelfView`, `WSWidget` | The widget shelf for the launcher's `widgets`: it loads each widget and draws its loading, empty, error and timeout states. |
| `WSSurface`, `webspringSurfaceStyle` | The surface presets, and the CSS custom properties that paint a surface. The launcher's `launcherSurface` and `shelfSurface` hold the resolved surfaces. |
| `WSIconArtwork`, `WSIconEffect` | An application's icon artwork, and the shell's declared icon effect. |
| `resolveWebspringIconPresentation`, `webspringIconSprings`, `getWebspringRadialExitForIcon`, `useWebspringMotion` | Icon entrance, launch and return motion, standard and reduced. |
| `getWebspringSelectorTransform`, `resolveWebspringOrbPresentation` | Selector and orb motion for a radial launcher. |
| `WEBSPRING_STAGE`, `getDesktopWebspringLayout`, `stagePointStyle` | The desktop stage geometry. Each entry's radial placement is `items[].dialPlacement`: the first seven entries sit on the dial, the rest on the overflow shelf. |

A radial launcher with an orb and selector can be built entirely from these exports.

## Scope

Webspring is a browser shell with a client side router and application host. It renders in the browser, so server side rendering, server rendered metadata and search indexing sit outside its scope.
