# Webspring

Webspring is the shell of a SynCloudOS site. It presents the launcher, hosts the application stage, provides the app switcher and notifications, and runs the sign-in gate. You describe the shell with its `WSInfo` and a `WSApplication` subclass, and the browser host does the rest.

The launcher that ships with the framework is the Board, `WSBoardViewController`: a paged grid of application icons that works on a phone and on a desktop display. You hold an icon to reorder, and launching zooms into the application stage and reverses on the way back.

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

Then default-export a `WSApplication` subclass from `src/Webspring/Contents/index.tsx`, the same way an application's `index.tsx` default-exports its `NSEApplication` subclass:

```tsx
import { WSApplication } from "@syndromatic/syncloudos/webspring";

export default class ExampleSite extends WSApplication {}
```

The Vite plugin pairs `Info.ts` with that class. With `Info.ts` alone it uses the base `WSApplication`, and with neither file the site mounts the base `WSApplication` as "SynCloudOS" (`org.syncloudos.webspring`), unless `webspringEntry` is `false`. Without the plugin, `createWebspring({ info, application })` builds the same definition for unit tests or for `mountSynCloudOS({ element, shell })`. It validates the info and the class's statics and returns immutable data. The framework constructs the `WSApplication` itself and calls `applicationWillFinishLaunching`, `applicationDidFinishLaunching` and `applicationWillTerminate` around the shell's life. Every presentation shows the Board unless the class names another launcher with `static mainViewController`, or one per presentation with `static viewControllers`.

## The Board

The Board shows the icon of every application whose manifest sets `webspring.visible`. Icons are placed by `webspring.order`, and `featured` and `defaultSelected` adjust emphasis and initial focus. It works much like a phone's home screen:

- Tap or click an icon to launch the application.
- Hold an icon, or press the keyboard reorder shortcut, to enter editing. Drag icons to new positions, and choose Done to keep the order or cancel to restore it.
- Move between pages by swiping, scrolling or using the keyboard.

Tapping, picking up, moving and dropping an icon give haptic feedback through HapticsFX on devices that support it, following the user's feedback settings. With reduced motion, icons move to their places without animating.

The application stage matches bundle identifiers without regard to case, whether an application opens from a Board icon or a direct route. It keeps the spelling declared in `Info.ts`, and opening the same application with different capitalisation doesn't replace its main view or lose its input and focus.

While you reorder, hit testing uses the slot positions captured when the drag began, so neighbouring icons don't jitter as they settle. The launcher holds pointer capture and releases it on pointer up, cancellation, leaving edit mode or unmount.

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

The layout is saved under the preference key `webspring.layout.v5` as `{ version: 5, order, folders: { [id]: { apps } }, board, updatedAt, source }`, where `order` lists the top-level entry keys and `apps` holds bundle identifiers normalised for case. Earlier layouts, including v4 with the old application identities, are ignored instead of migrated.

On the Board, tapping a folder opens it with the shell's `static folderPresentation`. The default is a split: the stage parts below the folder's icon and label to reveal the folder's applications on a linen underlay. Escape, or a tap on either half, closes it, and with reduced motion it crossfades instead. Configure or replace it on the `WSApplication` subclass:

```tsx
import { WSApplication, createWSFolderSplitPresentation } from "@syndromatic/syncloudos/webspring";

export default class ExampleSite extends WSApplication {
  static override folderPresentation = createWSFolderSplitPresentation({
    underlay: { image: "/assets/textures/linen.webp", size: "cover", colour: "#2b3038" },
    panelHeight: "content", // or a height in pixels
    notch: true,
    edgeShadow: 0.55, // 0 to 1
    duration: 0.42, // seconds
  });
}
```

A custom presentation is a component that receives `WSFolderPresentationProps`: `folder`, `stage` (the element to present over), `anchor` (the rect of the folder's cell, icon and label), `reducedMotion`, `renderApp(app, index)` and `onClose`. Mark the panel holding the applications with `data-webspring-folder-panel`; the Board takes an application out of the folder when a drag leaves that element.

### Folder icons

Every launcher draws a folder's icon in one appearance, set with `static folderAppearance`. `WSFolderTileView` reads it, so a custom launcher that renders the tile needs no styles of its own:

```tsx
export default class ExampleSite extends WSApplication {
  static override folderAppearance = {
    shape: { kind: "roundedRect", smoothSurface: { radius: "36%", curve: "squircle", smoothing: 0.6 } },
    fill: { kind: "texture", image: "/assets/textures/cotton.jpg", size: "128px", colour: "#20242c" },
  } as const;
}
```

- `shape` is `{ kind: "roundedRect", smoothSurface? }` or `{ kind: "circle" }`. A rounded rectangle is clipped to smooth-corner geometry measured from the tile. `smoothSurface.radius` is a percentage of the tile's shorter side up to `"50%"` (which keeps the shape as the tile scales), pixels, or an NSE radius token. `curve` is `arc`, `squircle`, `superellipse` or `clothoid`, and `smoothing` runs from 0 to 1. The default is `{ kind: "roundedRect", smoothSurface: { radius: "36%", curve: "squircle", smoothing: 0.6 } }`.
- `fill` is `"inset"`, the dark translucent well (the default), or `{ kind: "texture", image, size?, colour? }`: the image URL, a CSS `background-size` (default `cover`) and a CSS colour beneath it (default `transparent`).
- Either fill looks pressed into the surface, with an inner shadow and a lower highlight inside the shape and a light lip below it. While an application rests on the folder to join it, the tile grows and a ring follows the shape outside it. In a circle, the member icons are inset to fit.

`createWebspring` throws a `TypeError` for an unknown field, shape or curve, a radius over `50%`, a smoothing outside 0 to 1, or a texture without an image. A launcher drawing folder-shaped artwork of its own, such as the well an application rests on before it makes a folder, reads the resolved appearance with `useWebspringFolderAppearance()`.

The open folder's underlay is set separately, on the presentation.

### How the split opens

The split copies the stage's DOM into each half, so it has nothing to capture and opens at once. A DOM copy has no pixels of its own, so canvases in the stage are drawn into it. The split's own overlays are left out, every `id` is dropped, and the copy takes no pointer input and isn't announced.

The copies keep the stage's full size when its edge is outside the viewport, and are rebuilt when its visible rectangle changes. They're inert and hidden from assistive technology, so Tab and Shift+Tab stay among the folder's real controls and never enter either copy.

Every icon in a copy is marked with `data-webspring-folder-backdrop`: `backdrop` for the icons and labels that fade as the halves part, and `anchor` for the opened folder's own icon, which stays at full strength. For the presentation to tell icons apart, a view marks each with `data-webspring-item-id`, as the Board does. Styles read these properties on `.webspring-folder-split`:

| Property | Default | Meaning |
|---|---|---|
| `--webspring-folder-backdrop-icon-opacity` | `0.22` | Opacity of the icons and labels behind an open folder. |
| `--webspring-folder-backdrop-icon-saturation` | `0.35` | Saturation of those icons; the wallpaper is untouched. |
| `--webspring-folder-edge-shadow` | `0.55` | Strength of the seam shadows, from the `edgeShadow` option. |
| `--webspring-folder-duration` | `0.42s` | How long the halves take to part or rejoin, from the `duration` option. |
| `--webspring-folder-easing` | `cubic-bezier(.3, .72, .18, 1)` | Shared timing curve for the split, icon fade and seams. |

The fade runs with the halves and reverses as they rejoin.

With `notch` on, the underlay rises 14 px above the top seam in a triangle pointing at the folder icon, and the upper half has a matching cutout, so one backdrop paints the pointer and the panel without a break in the texture. When closed, the lower half reaches 14 px above the seam and covers the cutout, so you can't see the notch. Opening uncovers its tip first, and closing covers it again as the halves rejoin. The upper half's light and shadow follow both edges of the pointer, and the lower seam has its own light line. With `notch` off, the seam is straight.

The top wrapper uses `drop-shadow(0 1px 0 rgba(255,255,255,.3)) drop-shadow(0 3px 7px rgba(0,0,0,.85))`. The bottom edge uses `inset 0 1px 0 rgba(255,255,255,.3)`, with an outer shadow of `0 -2px 8px rgba(0,0,0,.33)` at the default `edgeShadow`. The triangle's base is 28 px wide, and the seam starts 6 px below the folder cell. The bottom half paints above the top half so it covers the fixed triangle when shut.

With reduced motion the halves don't move; the presentation crossfades between closed and open, with the seams and triangle drawn in place.

## Branding

Branding lives in `branding` in `Info.ts`. The host loads the logo before the shell and sign-in gate mount. The light, dark and compact variants fall back to the primary logo, and then to the localised site name. A SynWare reads the same values from `useSCOS()`:

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

The host's recovery alerts show whose failure it was. An application failure shows the application's icon from its resources (for example, `webspring.icon: "./Resources/AppIcon.png"`). A site failure, including a failed session check before a protected launch, shows the site logo and its variants. Framework and watchdog failures show the SynCloudOS logo. The host adds the caution badge itself, and shows the badge alone when there's no logo, so you don't need to make error artwork.

These recovery alerts belong to the browser host. Applications build their own alerts with `NSEAlert`, and present custom content as a sheet with `presentAsSheet`.

## Background and size of the Board

Left alone, the Board is a tinted cotton texture with a spotlight: lighter in the centre, darker at the edges. `static launcherSurface` paints the icon area; `static shelfSurface` paints the widget area and is drawn only when the shell has widgets.

```tsx
import { WSApplication, WSSurface } from "@syndromatic/syncloudos/webspring";

export default class ExampleSite extends WSApplication {
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

`WSSurface.cotton()` is the default and `WSSurface.plain(colour)` is a flat colour; spread a preset to change one field. The Board applies the surface as CSS custom properties (`--webspring-launcher-*` and `--webspring-shelf-*`), so a theme can still override them. The framework ships no other Board artwork, so supply your own images for a metal or paper look.

The Board scales to the screen. Icons take the largest size that still fits a whole page (four columns by the page's rows) without scrolling, which is the smaller of what the width and the height allow, kept between 54 and 180 CSS pixels. On a phone the width usually decides, and on a desktop the height.

## Widgets on the Board

A widget is a titled panel below the icons that loads its own data, such as a list of recent posts. Declare it by subclassing `WSWidget`, and list it in `static widgets` or place it in `src/Widgets/<Name>.widget/index.tsx`. Discovered widgets follow the listed ones, by `static order` and then `static id`. With no widgets there is no shelf at all.

```tsx
import { WSApplication, WSWidget } from "@syndromatic/syncloudos/webspring";

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

export default class ExampleSite extends WSApplication {
  static override widgets = [LatestWidget];
}
```

- `load(signal)` returns the data, in any shape, and the framework manages the promise. The signal aborts when the Board unmounts, when the user retries or `refresh()` runs, and when the load times out.
- `renderView()` (or `static view`) draws the view once the load has succeeded, reading `this.data`. A view that throws shows the error state; the rest of the Board is untouched.
- `static whenEmpty` is `"hide"` (the widget disappears, and so does the shelf if every widget is hidden) or `{ message }` (the message shows in its place). Empty means an empty array, `null` or `undefined`; overriding `isEmpty(data)` replaces that rule.
- The framework draws the other states. While loading it shows a placeholder, and a rejected load shows an error with Retry. A load that hasn't settled after `static timeout` milliseconds (10,000 by default) is aborted and shows a timeout error with Retry, so a widget can never be stuck loading.
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

The Vite plugin discovers `src/SynWare/*.app`, `src/Preferences/*.prefPane`, `src/Widgets/*.widget`, `src/Integrations/*.integration.ts` and the shell in `src/Webspring/Contents/` (`Info.ts`, with an optional `index.tsx`), and passes that project to `mountSynCloudOS` for you. Each application needs `Contents/index.tsx` and an `Info.ts` that declares `bundleIdentifier`, `displayName` and `version`; the plugin fills in only the schema version, icon and locale resources. Directory options and `webspringEntry: false` change what it discovers. It rejects symbolic links and clashing paths or resources, and picks up files you add or remove while it runs.

## Authentication

Pass `"disabled"` for a public site. For sign-in backed by a server, pass `{ policy: "optional" | "required", service, loginComponent? }`. Optional mode keeps public content available and adds a Sign In control. Required mode holds back protected shell content until the server confirms the session. Disabled mode makes no authentication requests and never offers Log Out. An application that anyone can launch without signing in declares `runtime.policy.public: true`. See [Authentication](authentication.md).

When there's a sign-in gate, the host shows the sign-in window after the icons settle, dims the launcher behind it and keeps the launcher inert until the window has gone. Visitors who are already signed in, or sites without a gate, go straight in. A marker in the tab's session storage keeps the sign-in window up across provider redirects; it stores no identity and grants no access.

## System Preferences

System Preferences is a list of panes. The framework ships ten: Account (only when sign-in is on), Appearance, Audio & Haptics (`sounds`), Motion, Notifications, Privacy & Security (`privacy-security`), Language, Updates, Storage and Capabilities. Add your own by subclassing `NSEPreferencePane`, and list them in `static preferencePanes` or place them in `src/Preferences/*.prefPane/index.tsx`.

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

export default class ExampleSite extends WSApplication {
  static override preferencePanes = [BillingPane];
  static override hiddenPreferencePanes = ["sounds"];
}
```

- Override `renderView()` (or declare `static view`) to render the pane. The controller receives live `this.settings` (the person's current settings), `this.appearance` (`"light"`, `"dark"` or `"auto"`) and `this.locale` (the active locale and the supported ones), and re-renders when any of them changes.
- `static title` is a string, or `{ key, fallback }` looked up in the system strings. `static icon` is a URL for your artwork (import the SVG), shown beside the title in the list.
- Panes list in ascending `static order`, ties broken by `static id`. The built-ins sit at 50 (`account`), 100 (`appearance`), 200 (`sounds`), 300 (`motion`), 400 (`notifications`), 450 (`privacy-security`), 500 (`language`), 600 (`updates`), 650 (`storage`) and 660 (`capabilities`).
- Optional `renderSummary()` (the line under the title, usually the current value) and `renderAccessory()` (a control on the list row, such as a master switch) read the same controller properties.
- `static hiddenPreferencePanes` removes built-in panes by `id`: `account`, `appearance`, `sounds`, `motion`, `notifications`, `privacy-security`, `language`, `updates`, `storage`, `capabilities`. A developer pane with a built-in's `id` replaces that built-in instead, and hiding never removes a developer pane.
- A pane that throws shows "This preference pane could not be loaded." in its place, and System Preferences stays open. A summary that throws shows "Unavailable"; a throwing accessory is dropped.

Themes restyle the System Preferences window only through custom properties such as `--nse-prefs-panel-background` and `--nse-prefs-selection-background`, so the sidebar layout is the same in every theme. Inside a pane, use NSE controls and the `nse-prefs-section`, `nse-prefs-note` and `nse-prefs-empty` classes so it follows the theme.

## Recovery alerts

The host tells a failed connection apart from a missed deadline. `CONNECTION_ERROR` means the request or the reading of its response body failed; the message uses the browser's offline status when it has one, without guessing which server was lost. `SITE_NOT_RESPONDING` and `APP_NOT_RESPONDING` mean a site or application operation ran past its deadline. HTTP errors and invalid server responses keep their own authentication or protocol meaning.

HTTP authentication allows 15 seconds by default for a request and its response body together; set `requestTimeoutMs` on `createHttpAuthentication` to change it. Its recovery alert offers to refresh the session, and a successful refresh clears the alert. When the browser comes back online, the host checks the session again, without overtaking a pending log-out or repeating a sign-in or sign-out.

Applications report remote failures with `useSCOS().errors.capture`. Pass `code: "CONNECTION_ERROR"` for a known connection failure, or `code: "APP_NOT_RESPONDING"` with `timeoutMs` for a missed deadline; a `TimeoutError` counts as a deadline automatically. Supply `retry` only when there's a real operation to repeat. A failed retry is reported again, and once the application closes, late results no longer raise alerts. Ordinary programming errors, including a `TypeError` thrown anywhere but the HTTP response reader, are never treated as network failures.

While the page is visible, the browser host also runs a heartbeat in a worker with a 10-second threshold. A stall on the main thread is reported as the site's, because the event loop can't tell which application caused it. The worker notices the stall straight away, but the page can show the alert only once the main thread resumes, so a page that never unblocks can't show it at all. Hiding or suspending the page resets the check. Where a worker can't run, a long-task observer reports stalls after they finish, if the browser supports one.

As described under [Branding](#branding), application alerts show the application's icon, site alerts the site's branding and framework errors the SynCloudOS artwork. The host draws the caution badge and the layout.

## Custom launchers

The Board is one launcher. For another, subclass `WSLauncherViewController` and name it in `static mainViewController`, or per presentation in `static viewControllers`:

```tsx
import { WSApplication, WSIconView, WSLauncherViewController } from "@syndromatic/syncloudos/webspring";

class GridLauncher extends WSLauncherViewController {
  override renderView() {
    return <div className="grid">{this.items.map((item, index) => <WSIconView key={item.id} item={item} index={index} />)}</div>;
  }
}

export default class ExampleSite extends WSApplication {
  static override mainViewController = GridLauncher;
}
```

- The controller reads the shell's state through getters: `items`, `apps`, `widgets`, `folders`, `branding`, `account`, `isEditing`, `draggingItemId`, `entrancePhase` (`waiting`, `holding` or `ready`), `launchPhase` (`idle`, `staging`, `launching`, `covered` or `returning`), `presentationTraits` (`width`, `height`, `reducedMotion` and `safeAreaInsets`) and the rest. `items` lists the top-level entries in order: `{ kind: "app", id, app }` or `{ kind: "folder", id, title, apps, badgeCount }`; `apps` lists every visible application flat.
- Its commands act on the shell: `openApp`, `returnHome`, `beginEditing`, `finishEditing`, `moveItem(itemId, index)`, `moveItemByKeyboard(itemId, key, columns)`, `openFolder`, `closeFolder` and the rest. A launcher that draws a return transition reports it with `completeReturnTrack("material" | "icons")`.
- `renderView()`, or `static view`, which receives `controller`, draws the launcher. `WSIconView` draws one entry: it launches, opens folders, enters editing on a long press, drags and reorders from the keyboard with no code of the launcher's own.
- `WSLauncherRootView` wraps every launcher and handles pointer capture, the dragged icon, the open folder, the launch dim, the live region and the application outlet. `launcherRootProps()` sets its element and attributes.
- `static mode` is `"launcher"` or `"persistent"`; a persistent launcher stays on screen, so its `homeRoute` may be an application's route. `static presentations`, `static returnTracks` (default `["material", "icons"]`) and `static launchZoom` describe the rest.
- Hooks let a launcher shape the shared behaviour: `revealItem`, `dragDidReachEdge`, `launcherDidSwipe`, `launcherWillOpenApp`, `launcherDidNotOpenApp`, `launchPhaseDidChange`, `launchCompletionDelay`, `renderFolderItem` and `folderAnchor`.

If a custom launcher throws, the shell shows an alert with Use fallback view, which puts the Board in its place for that presentation.

Elements a launcher hands to the drag hit-testing helpers carry `data-webspring-item-id` and `data-order-index`.

During a drag, what counts is the dragged icon's centre, not the pointer. `useWSDragProxyPosition` keeps the offset where you grabbed the icon, so its centre is what rests on a target. `createWSDragArbiter` times how long the centre rests and reports to the launcher through four commands: `reorder(index)`, `merge(targetId | null)` for the drop well, `springOpen(folderId)` and `leavePanel(folderId)`. `WSLauncherRootView` drives it for `WSIconView`; a launcher drawing its own icons calls `update(centre, view)` on each pointer move with the centre and its container's entries, `clear()` when its layout changes under the drag, and `end()` on release, which reports the drop well, the folder and the index the release falls on. The rules are:

- Reorder: once the icon has rested 150 ms on the slot whose artwork is nearest its centre, it moves there. When that nearest slot is its own, nothing moves. Leaving and returning restarts the wait.
- Merge: an app whose centre rests over another app's artwork for 350 ms arms a drop well (`setDropTarget`). The label is not part of the target. Releasing on the well calls `dropOnItem`.
- Folder: a folder's artwork, with a 20 % margin around it, takes an app after 200 ms on it, as a drop well.
- Spring: an app whose centre has been on a folder for 800 ms opens it under the drag, with `openFolder(folderId, { duringDrag: true })`, and the drop well gives way to the panel. The drag continues inside the panel.
- Panel: the folder stays open while the centre is inside its panel or in the band between the folder's cell and the panel's top edge. Crossing the panel's edge calls `leavePanel`, once per departure; a member that leaves first moves out with `moveAppOutOfFolder`. Only a member reorders inside its panel. An app from the Board is held there until release and joins at the nearest member's slot.
- Folders never merge. Where the folders are fixed (`editable: false`), an app does not merge, so no drop well or spring-open arises.

`captureWSDragArtworkRects` measures the artwork zones the rules test against.

A custom launcher owns its markup, styles and animation. The host owns sessions, routing, application lifecycle, focus, overlays and cleanup, so a launcher never creates sessions or reads host services. Check `presentationTraits.reducedMotion` and respond without motion when the user prefers it.

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

A launcher's own layout, such as the geometry of a radial dial, is up to the launcher. Webspring hands it `items` in order and leaves placing them to it.

## Scope

Webspring is a browser shell with a client-side router and application host. It renders only in the browser, so it doesn't do server-side rendering, server-rendered metadata or search indexing.
