# Named template images

`NSEImage` corresponds to AppKit's `NSImage`. `NSEImage.goBackTemplateName` and
`NSEImage.goForwardTemplateName` are the `NSImage.Name` constants
`NSGoBackTemplate` and `NSGoForwardTemplate`. `NSEImage.named(name)` corresponds
to `NSImage(named:)`: it returns a shared image, or `null` for an unknown name.
Artwork URLs resolve on lookup, so importing unrelated controls needs no asset base.

```tsx
import { NSEButton, NSEImage } from "@syndromatic/syncloudos/nse/controls";

<NSEButton bezelStyle="texturedRounded" title="Sections"
  image={NSEImage.named(NSEImage.goBackTemplateName)} imagePosition="imageOnly" />
```

Both `nse` and `nse/controls` export `NSEImage`. Its immutable named instances expose
`name`, `src`, `size` and `isTemplate`. Buttons and segmented controls accept them
in `image`; `imageLeading` and `imageTrailing` also support titles. An image-only
button uses its title as its accessible name. Templates inherit the control's
content colour, including appearance and disabled treatment. The image is
decorative inside the named control. Existing URL and React-element images remain
supported. `NSEImageView` can use the image's `src` as its existing URL source.

Atmo owns both 17 × 17 point assets. The back path is the original Preferences
geometry (`M15 4 L7 12 L15 20`, round 3-point stroke in a 24-point view box).
Forward has its own asset and path; no CSS reflection is used. Stage, Preferences
and Open panel navigation use these shared images. Application navigation chrome
currently draws an image-only back control in its standard circular back slot.
