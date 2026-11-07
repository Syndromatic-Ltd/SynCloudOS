# Open panels, folders and application storage

`NSEOpenPanel` is an object, after `NSOpenPanel`. AppKit defines the architecture; Atmo draws its source list, search capsule, collection and grey plate. The owner approved a desktop sheet and compact Sources drill-in on 2026-11-07.

```ts
const panel = new NSEOpenPanel();
panel.canChooseFiles = true;
panel.canChooseDirectories = false;
panel.allowsMultipleSelection = true;
panel.allowedContentTypes = ["image/*"];
panel.prompt = "Open";
panel.message = "Choose images for this document.";
if (await panel.beginSheetModal(this.view.window!) === NSEModalResponse.OK) {
  for (const url of panel.urls) {
    if ("read" in url) {
      const file = await url.read(this.ownerSignal);
      // Import the file into the document.
      url.release("caller-finished");
    }
  }
}
panel.dispose();
```

Configure `canChooseFiles` (default true), `canChooseDirectories` (false), `allowsMultipleSelection` (false), `allowedContentTypes` (empty means all), `directoryURL`, `prompt` and `message` before presenting. `beginSheetModal(window, completionHandler?)` attaches below that window's title bar and toolbar, blocks the parent's controls and resolves when it closes. `begin(completionHandler?)` and `runModal()` are application-modal. Each returns a promise for `NSEModalResponse.OK` or `.cancel`; JavaScript does not run a blocking native modal loop. `cancel()` ends the session. `urls` and `url` contain the accepted selection; `result` preserves cancellation and typed errors.

`allowedContentTypes` accepts MIME types, MIME families, dotted extensions, and the Foundation identifiers `public.item`, `public.data`, `public.image`, `public.movie`, `public.audio` and `public.text`. Filtering is based on file metadata and name. Applications must inspect imported bytes before trusting their format. Folders remain visible so a filtered collection can still be traversed. `directoryURL` is a browser directory handle, including one returned by the application-support lookup below.

The web platform does not reveal durable OS file URLs. `NSEOpenPanelURL` is consequently a browser `FilePanelReference` or a provider's `MediaPanelItem`, preserving the source's real identity. A directory selection has `kind: "directory-handle"`; a file can be read through its reference. It is never turned into a fabricated path. Release file references after importing them. A panel retains accepted provider resources until its next presentation or `dispose()`; import or copy provider content before then.

## Sources

**Folders** lists actual directory handles granted with **Add Folder…**. The browser platform port persists them by structured clone in IndexedDB, scoped to the application bundle. These are the web analogue of security-scoped bookmarks, rather than a grant of permanent permission: opening a panel calls `queryPermission`; ungranted or revoked bookmarks remain visible with a lock. Choosing a locked row calls `requestPermission` directly from that user action. Neither restoring a bookmark nor background enumeration prompts for permission. Browsing uses `values()`, retains path history, sorts folders first and searches the current directory.

**Media** lists `panel.mediaSources`, using the providers formerly supplied to the separate media panel. There is one panel and one result contract. Each provider supplies `id`, `label` and `query(query, signal)`, and may supply `release(items)` and `requiresUserActivation`. A provider query returns `{ items, nextCursor }`; each item carries `id`, `providerId`, `kind` (`image`, `video`, `audio`), `name`, `mimeType` and optional `source`, `thumbnailUrl` or `fileReference`. Ordinary sources are searchable and paginated. Activation-only sources are queried by an explicit source action, never by a mount effect.

**App Storage** opens the current bundle's origin-private application-support directory. It is labelled Application Support; an application can create its own Scratch Disk or Media subdirectory there.

**System Chooser…** invokes the existing browser file chooser directly from its button. Cancelling that chooser returns to the drawn panel. Unsupported or insecure drawn-panel environments take the system path at `begin` time. With no current activation that path returns a typed denial immediately; it never waits for a later click.

## Explicit system-only presentation

```ts
const panel = new NSEOpenPanel();
panel.usesSystemFileChooser = true;
const response = await panel.runModal(); // call directly from the click/key handler
```

`usesSystemFileChooser` is a deliberate SynCloudOS extension, default false. AppKit has no reason to distinguish a browser's chooser from its own. A `uses…` Boolean fits its property vocabulary and names the developer's explicit choice. A presentation-style enum would mix this acquisition decision with sheet versus application modality, which the existing begin methods already express.

The native browser chooser can select files or one directory; it cannot return a mixed selection or multiple directories. Use the drawn collection for those combinations. Without `showDirectoryPicker`, Folders is hidden (including Safari and Firefox); without OPFS, App Storage is hidden. Media can remain available in either case. Native permission and picker UI still require manual browser acceptance testing.

## Application-support access

```ts
const [support] = await SCOS.fileManager.urls(
  "applicationSupportDirectory", "userDomainMask",
);
if (support) {
  const scratch = await support.getDirectoryHandle("Scratch Disk", { create: true });
  const handle = await scratch.getFileHandle("working-data.bin", { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}
```

This is the minimal `FileManager.urls(for:in:)` analogue. The only supported directory/domain pair is `applicationSupportDirectory` / `userDomainMask`. It returns an empty collection when OPFS is unavailable; an ended application mount rejects the lookup. The runtime creates `SynCloudOS-Application-Support/<encoded bundle identifier>` under `navigator.storage.getDirectory()`. Separate apps get separate directory handles, stable across reloads and application sessions. Browser origin quota, persistence and clearing rules apply; the API does not promise unlimited space or an OS-visible directory. Same-origin application code is mutually trusted; bundle scoping is not an additional browser security sandbox.

The new capability serves editors, document importers and media applications that need a persistent working directory. `SCOS.filePanels.open` can only acquire user-picked references, and preference persistence stores JSON; neither provides this directory. The implementation uses the injected runtime platform/storage port, with raw IndexedDB, picker and OPFS access confined to the browser adapter. No storage root, host identity or temporary gallery helper is public.
