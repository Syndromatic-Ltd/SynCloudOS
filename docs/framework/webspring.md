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

On the Board, tapping a folder opens it with the definition's `folderPresentation`. The default is the iOS 6 split: the stage is captured and parted below the folder icon, revealing the folder's applications on a linen underlay. Escape, or a tap on either half, closes it; reduced motion crossfades instead. Configure or replace it in the definition:

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

A custom presentation is a component receiving `WebspringFolderPresentationProps`: `folder`, `stage` (the element to present over), `anchor` (the folder icon's rect), `reducedMotion`, `renderApp(app, index)` and `onClose`. Mark the panel holding the applications with `data-webspring-folder-panel`; the Board takes an application out of the folder when a drag leaves that element.

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

`branding` is immutable and has the shape `{ name, logoUrl, lightLogoUrl, darkLogoUrl, compactLogoUrl, logoAlt }`. Declare `branding.compactLogo` when a small mark suits the sign-in placard better than the full lockup.

Host recovery alerts distinguish application, site and framework ownership.
Application failures use the registered icon resolved from the app's resources
(for example, `webspring.icon: "./Resources/AppIcon.png"`). Site failures,
including the protected-launch login-session guard, use the configured site logo
and its appearance variants. Framework and root-watchdog failures use the
SynCloudOS logo. The host composes the caution badge at runtime; an unavailable
app or site logo receives caution alone. No precomposed error artwork is needed.

This recovery presentation belongs to the browser host. Applications compose
their own alerts with the existing `NSEAlert` content slot and controls.

## Content on the Board

A shell can show content beside the icons, such as a list of recent posts. Declare sections in the definition and provide a source for each one at mount time.

```tsx
import { defineWebspring, WebspringBoardView } from "@syndromatic/syncloudos/webspring";
import manifest from "./Info";

export default defineWebspring({
  manifest,
  components: { board: WebspringBoardView },
  content: {
    sections: [
      {
        id: "latest",
        title: { key: "site.latest", fallback: "Latest" },
        sourceId: "public-posts",
        limit: 6,
        empty: "message",
      },
    ],
  },
});
```

A source implements `WebspringContentSource`. It receives `{ limit, signal }`, returns items that carry display text, an optional image reference and a destination of `{ appId, route }`, and may resolve its own image references.

```tsx
import type { ContentItem, WebspringContentSource } from "@syndromatic/syncloudos/webspring";

export const publicPosts: WebspringContentSource = {
  async read({ limit, signal }) {
    const response = await fetch(`/api/public-posts?limit=${limit}`, { credentials: "same-origin", signal });
    if (!response.ok) throw new Error(`Public posts request failed: ${response.status}`);
    return (await response.json()) as readonly ContentItem[];
  },
  resolveImage(resource) {
    return resource.startsWith("/media/") ? resource : null;
  },
};
```

The source, or the endpoint behind it, decides what is public. Filter drafts, future dated items and deleted records there. Register sources by identifier in `contentSources` when you mount the host. A section whose source is missing follows its `empty` setting, which chooses between hiding the section and showing a message.

## Mount the shell

Mount the shell through the browser host, as the [runtime guide](runtime.md#mount-a-runtime) describes:

```tsx
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { bundles, shell, shellResources } from "virtual:syncloudos/composition";
import { publicPosts } from "./publicPosts";

const host = await mountSynCloudOS({
  element: document.getElementById("root")!,
  bundles,
  shell,
  shellResources,
  contentSources: { "public-posts": publicPosts },
  authentication: "disabled",
});

await host.dispose("application shutdown");
```

The Vite plugin builds the virtual composition module from your shell and bundles. By default it looks in `src/SynWare/*.app` and `src/Webspring/Contents/index.tsx`. `synCloudOS({ appsDirectory, webspringEntry })` chooses other locations, and `webspringEntry: false` produces a composition of applications alone. Discovery requires each bundle to have `Contents/Info.ts` and `Contents/index.tsx`. It rejects symbolic links, duplicate paths and resources that escape the bundle, and it watches for bundles added or removed while the dev server runs.

## Authentication

Pass `"disabled"` for a public site. For server backed sign-in, pass `{ policy: "optional" | "required", service, loginComponent? }`. Optional mode keeps public content available and adds a Sign In control. Required mode holds protected shell content until the server confirms the session. Disabled mode makes no authentication requests. An app intended for anonymous launching declares `runtime.policy.public: true`. See [Authentication](authentication.md).

When a gate is configured, the host presents the sign-in window after the icons settle, dims the launcher behind it and keeps the launcher inert until the window has left. Visits without a gate, and visits that are already authenticated, enter without interruption. A tab-local marker in session storage preserves only the held presentation across provider redirects. It stores no identity and grants no access.

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
- `actions` is the command surface for the shell: application, home, reorder, editing, drag, folder, authentication and content operations. Reordering is `moveItem(itemId, index)` within the item's container (the top level, or its folder) and `moveItemByKeyboard(itemId, key, columns)`. Folders use `setDropTarget(itemId | null)` while an app hovers over an entry, `dropOnItem(appId, targetItemId)` to merge, `moveAppOutOfFolder(appId, index)`, `openFolder(folderId)` and `closeFolder()`. Drags run between `beginDrag(itemId)` and `finishDrag(commit)`; changes made during a drag persist when it commits and revert when it is cancelled. A view that draws a launch or return transition reports completion with `completeLaunch(transitionId, appId)` and `completeReturnTrack("material" | "icons")`.
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
| `WebspringFolderTile`, `createWebspringFolderSplitPresentation` | A folder's icon tile of its members, and the default folder presentation. |
| `LowerContentShelfView` | The content shelf for the shell's declared sections. |
| `WebspringIconArtwork`, `WebspringIconEffect` | An application's icon artwork, and the shell's declared icon effect. |
| `resolveWebspringIconPresentation`, `webspringIconSprings`, `getWebspringRadialExitForIcon`, `useWebspringMotion` | Icon entrance, launch and return motion, standard and reduced. |
| `getWebspringSelectorTransform`, `resolveWebspringOrbPresentation` | Selector and orb motion for a radial launcher. |
| `WEBSPRING_STAGE`, `getDesktopWebspringLayout`, `stagePointStyle` | The desktop stage geometry. Each entry's radial placement is `model.items[].dialPlacement`: the first seven entries sit on the dial, the rest on the overflow shelf. |

A radial launcher with an orb and selector can be built entirely from these exports.

## Scope

Webspring is a browser shell with a client side router and application host. It renders in the browser, so server side rendering, server rendered metadata and search indexing sit outside its scope.
