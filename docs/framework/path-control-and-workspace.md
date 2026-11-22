# Path controls and workspace icons

`NSEPathControl` shows where the user is in a hierarchy as a row of clickable components, and `NSEWorkspace` supplies the standard file and folder icons to go with it. Both are exported from `@syndromatic/syncloudos/nse` and `@syndromatic/syncloudos/nse/controls`.

## Path control

`NSEPathControl` draws the standard path style with Atmo's path bezel. Give it a `url` (a `URL` or an absolute URL string), or give it `pathItems` when you're browsing something that has no OS path, such as file-system handles. Each `NSEPathControlItem` has a `title`, an optional `image` source and an optional `url`. When you supply items, they replace the components derived from the URL.

```tsx
import { NSEPathControl, NSEPathControlItem, NSEWorkspace } from "@syndromatic/syncloudos/nse/controls";

const projects = new NSEPathControlItem({
  title: "Projects",
  image: NSEWorkspace.shared.icon("public.folder", 24),
});
<NSEPathControl pathStyle="standard" pathItems={[projects]}
  onAction={sender => navigateTo(sender.clickedPathItem)} />
```

The control's ref is an `NSEPathControlHandle` with `url`, `pathItems` and `clickedPathItem`, and `onAction` receives the same handle. `clickedPathItem` is set before `onAction` runs. You can also connect the control with the usual NSE `action` and `actionPayload` props; if you don't give a payload, it's the clicked item. Each component behaves like an `NSEButton` for keyboard use and command validation, and `isEnabled={false}` disables the whole path.

## Workspace icons

`NSEWorkspace.shared` looks up file and folder icons. `icon(contentType, size?, scale?)` takes a uniform type identifier or MIME type and returns the folder icon for `public.folder`, `public.directory` and `inode/directory`, and the generic document icon for anything else. `iconForFile(file, size?, scale?)` takes a path string (ending in a slash for a directory) or `{ name, kind, type? }` from a file-system handle. Folders named Documents, Downloads or Music get their own icons, Application Support and App Storage use the Documents icon, and other folders get the ordinary folder icon. Neither method touches the file system or makes up browser file URLs. Both return an image source that `NSEImageView` accepts directly. The size is 24, 48 or 96 points and the scale is 1 or 2, with defaults of 48 points at scale 2.

The artwork belongs to Atmo, under `src/Themes/Atmo.scostheme/Contents/Resources/workspace/`, as `folder-documents`, `folder-downloads`, `folder-music`, `folder-ordinary` and `document-generic` at each size and at 1x and 2x.

The open panel uses these APIs in its source list, path and collection. Its visible image cells decode the real file bytes, or a provider's thumbnail, through the mounted ImageFX client, and show the generic icon until decoding succeeds. Cells release their image resources when they're replaced or unmounted. Browsing and searching never ask for permission, and a failed thumbnail doesn't stop the user opening the file.
