# Path controls and workspace icons

`NSEPathControl` corresponds to AppKit's `NSPathControl`. It draws the standard path style using Atmo's path bezel. Supply `url` (a URL or absolute URL string), or supply `pathItems` when browsing handles that do not have OS paths. Each `NSEPathControlItem` has a `title`, optional image source and optional URL. The explicit items take precedence over URL-derived components.

```tsx
const projects = new NSEPathControlItem({
  title: "Projects",
  image: NSEWorkspace.shared.icon("public.folder", 24),
});
<NSEPathControl pathStyle="standard" pathItems={[projects]}
  onAction={sender => navigateTo(sender.clickedPathItem)} />
```

A React ref exposes `url`, `pathItems` and `clickedPathItem` through `NSEPathControlHandle`. `clickedPathItem` is set before `onAction` runs. Standard NSE `action`/`actionPayload` connections are also supported: by default the action payload is the clicked item. Native NSEButton keyboard and command validation semantics apply to each component. `isEnabled={false}` disables the path.

`NSEWorkspace.shared` corresponds to `NSWorkspace.shared`. `icon(contentType, size?, scale?)` is the `icon(for: UTType)` lookup, accepting a uniform type identifier or MIME type. `iconForFile(file, size?, scale?)` is the `icon(forFile:)` lookup. Supply a path string (ending in a slash for a directory) or `{ name, kind }` from a file-system handle. It performs no file-system access and fabricates no browser file URLs. Both return image-source strings directly accepted by `NSEImageView`. Size is 24, 48 or 96 points; scale is 1 or 2 (defaults: 48 points, scale 2).

Atmo owns the artwork under `src/NSE/Themes/Atmo/Resources/workspace/`. Documents, Downloads and Music use the owner's Cirrus originals. Application Support uses Documents. Two stable slots await owner artwork: `folder-ordinary-*` (ordinary folders) and `document-generic-*` (all file content types without a thumbnail). Both provisionally use Documents artwork; replace their PNGs at the same paths with no code change. There is no newly drawn generic file icon. Source hashes, output hashes and the Lanczos3 resizing script are in the foundation evidence directory for 7 November 2026.

The Open panel uses these APIs in its source list, path and collection. Visible image cells use the mounted ImageFX client to decode real file bytes or provider thumbnails. Their generic icon remains until decode succeeds; cells release image resources on replacement and unmount. Browsing/searching does not request permission, and a failed thumbnail does not prevent opening the file.
