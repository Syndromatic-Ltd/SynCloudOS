# Named template images

The theme supplies a small set of shared, named images, such as the back and forward arrows, so your controls match the system's own. This page shows how to use them and lists the control image slots a theme can replace.

`NSEImage.named(name)` returns the shared image for a name, or `null` if the theme has no image by that name. `NSEImage.goBackTemplateName` and `NSEImage.goForwardTemplateName` hold the names of the back and forward arrows (`NSGoBackTemplate` and `NSGoForwardTemplate`). The artwork's URL is resolved when you look the image up, so importing controls that don't use it needs no asset base.

```tsx
import { NSEButton, NSEImage } from "@syndromatic/syncloudos/nse/controls";

<NSEButton bezelStyle="texturedRounded" title="Sections"
  image={NSEImage.named(NSEImage.goBackTemplateName)} imagePosition="imageOnly" />
```

`NSEImage` is exported from both `nse` and `nse/controls`. A named image is immutable and has `name`, `src`, `size` and `isTemplate`. Buttons and segmented controls take it as `image`. On a button, `imagePosition` places it: `imageOnly`, `imageLeading` or `imageTrailing` next to the title, or `noImage`. An image-only button uses its title as its accessible name, and the image itself is decorative. A template image takes the control's content colour, so it follows the appearance and dims when the control is disabled. When the active theme replaces a named image, controls draw the theme's version. You can still pass a URL or a React element as an image, and `NSEImageView` accepts a named image's `src` as its URL.

Atmo draws both arrows at 17 × 17 points. The back arrow is the path `M15 4 L7 12 L15 20` with a round 3-point stroke in a 24-point view box. The forward arrow is a separate asset with its own path, not a mirrored copy. Preferences and the open panel use these shared images for navigation.

## Control image slots

A system theme can replace these images through the `images` object in its `Theme.json`. Any slot you leave out uses Atmo's artwork. Controls keep each slot's size and pick the file for the display's pixel density. A template slot uses only the image's alpha channel, tinted by the control. A coloured slot draws the artwork as supplied.

| Name | Control glyph | Drawing |
| --- | --- | --- |
| `NSGoBackTemplate` | Back arrow | Template |
| `NSGoForwardTemplate` | Forward arrow | Template |
| `NSRightFacingTriangleTemplate` | Disclosure triangle in buttons and outlines | Template |
| `NSEStepperIncrementTemplate` | Stepper increment | Template |
| `NSEStepperDecrementTemplate` | Stepper decrement | Template |
| `NSEPopUpButtonChevron` | Pop-up chevron | Coloured |
| `NSTouchBarSearchTemplate` | Search field magnifier | Template |
| `NSESearchFieldCancel` | Search field cancel | Coloured |

Atmo's `images` object also holds the workspace document and folder icons (for example `document-generic:48` and `folder-ordinary:96`), each at 24, 48 and 96 points.
