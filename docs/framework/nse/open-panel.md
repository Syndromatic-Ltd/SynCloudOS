# Open panels, folders and application storage

`NSEOpenPanel` lets the user choose files, folders or media to bring into your application. It's an object you configure and present. Atmo draws its source list, search field, collection and grey plate, as a sheet on desktop and as a compact Sources list you drill into on narrow screens. This page also covers your application's own storage directory.

```ts
import { NSEModalResponse, NSEOpenPanel } from "@syndromatic/syncloudos/nse";

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
      const data = await url.read(this.ownerSignal); // NSEData
      // Import data; url.name and url.mediaType retain the file metadata.
      url.release("caller-finished");
    }
  }
}
panel.dispose();
```

Set `canChooseFiles` (default `true`), `canChooseDirectories` (`false`), `allowsMultipleSelection` (`false`), `allowedContentTypes` (empty allows everything), `directoryURL`, `prompt` (`"Open"`) and `message` before you present the panel. `beginSheetModal(window, completionHandler?)` attaches the panel below that window's title bar and toolbar, blocks the window's controls and resolves when the panel closes. `begin(completionHandler?)` and `runModal()` are modal to the whole application. Each returns a promise for `NSEModalResponse.OK` or `NSEModalResponse.cancel`; nothing blocks the JavaScript thread while the panel is open. `cancel()` closes it. `urls` and `url` hold what the user accepted, and `result` tells you whether they cancelled or what typed error occurred.

`allowedContentTypes` accepts MIME types, MIME families such as `image/*`, extensions with a leading dot, and the type identifiers `public.item`, `public.data`, `public.image`, `public.movie`, `public.audio` and `public.text`. The filter only looks at a file's metadata and name, so check the bytes you import before trusting their format. Folders stay visible so the user can still move through a filtered collection. `directoryURL` is a browser directory handle, such as the one the application-support lookup below returns.

Browsers don't reveal lasting OS file paths, so each `NSEOpenPanelURL` is either a browser file reference or an item from a media provider, and it keeps the identity its source gave it rather than a made-up path. A file reference (`kind` `"ephemeral-file"` or `"file-handle"`) has `read(signal?)`, and a chosen folder has `kind: "directory-handle"`. Release file references once you've imported them. The panel keeps provider items alive until it's presented again or disposed, so import or copy their content before then.

## Sources

Folders lists the directories the user has granted with Add Folder…. The browser keeps their handles in IndexedDB, separately for each application bundle. A saved folder isn't a permanent permission: opening the panel calls `queryPermission`, and a folder that isn't granted, or has been revoked, appears with a lock. Choosing a locked folder calls `requestPermission` straight from that click. Restoring saved folders and listing their contents never prompt. Browsing keeps a history of the path, lists folders first and searches the current folder.

Media lists the providers in `panel.mediaSources`, and their items come back through the same results as files. Each provider supplies `id`, `label` and `query(query, signal)`, and may add `release(items)` and `requiresUserActivation`. A query returns `{ items, nextCursor }`, and each item has `id`, `providerId`, `kind` (`image`, `video` or `audio`), `name`, `mimeType` and optionally `source`, `thumbnailUrl` or `fileReference`. Ordinary sources can be searched and paged. A source that needs user activation is only queried when the user acts on it, never when the panel mounts.

App Storage opens your application's private Application Support directory, where you can create folders of your own, such as Scratch Disk or Media.

System Chooser… opens the browser's own file chooser straight from its button, and cancelling it returns to the panel. Where the drawn panel isn't supported, or the page isn't a secure context, presenting goes straight to the browser chooser. If there's no user activation at that moment, it fails at once with a typed denial instead of waiting for a later click.

## Explicit system-only presentation

```ts
import { NSEOpenPanel } from "@syndromatic/syncloudos/nse";

const panel = new NSEOpenPanel();
panel.usesSystemFileChooser = true;
const response = await panel.runModal(); // call directly from the click/key handler
```

`usesSystemFileChooser` (default `false`) skips the drawn panel and uses the browser's file chooser. It's a separate Boolean because choosing where files come from is independent of whether the panel is a sheet or application-modal, which the `begin` methods already decide.

The browser chooser can pick files or a single folder, but not a mix of both or several folders; use the drawn panel for those. In browsers without `showDirectoryPicker`, such as Firefox, Folders is hidden, and without the origin private file system (OPFS), App Storage is hidden. Media can still be available either way. The browser's own permission and chooser dialogs still need testing by hand.

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

`SCOS.fileManager.urls` supports one directory and domain pair, `applicationSupportDirectory` and `userDomainMask`. It returns an empty array when OPFS isn't available, and rejects once your application's mount has ended. The runtime creates `SynCloudOS-Application-Support/<encoded bundle identifier>` under `navigator.storage.getDirectory()`, so each application gets its own directory, which stays the same across reloads and sessions. The browser's quota, persistence and clearing rules for the site still apply: the space isn't unlimited and the folder isn't visible in the OS. Applications on the same origin trust one another, so the per-bundle folder isn't a security boundary.

Use it when an editor, importer or media application needs a lasting working directory. `SCOS.filePanels.open` only gives you files the user picked, and preferences only store JSON, so neither can do this. Direct IndexedDB, picker and OPFS access stays inside the runtime's browser adapter, and no storage root or host identity is exposed.

## Reading and exporting bytes

An accepted selection keeps its file or provider identity. An `"ephemeral-file"` reference keeps the browser's `File` in `reference.file`. Reading any file reference returns `Promise<NSEData>`, and the MIME type is in `reference.mediaType`. A `"file-handle"` reference offers permission-checked operations without exposing the browser's handle.

An export payload is `{ fileName, mediaType, data: NSEDataConvertible }`, and a writable file destination accepts `NSEDataConvertible | string`. Only the browser adapter turns these into buffers or download `Blob`s, and the browser handles behind folders and saved folders stay private to it.

```ts
await target.sink.write({ fileName: "drawing.pdf", mediaType: "application/pdf", data: pdfData }, signal);
```
