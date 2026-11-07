# Appearance and Atmo

NSE separates what a control does from how it looks. A control declares its role, its state and its accessibility. An appearance decides the visual treatment. Atmo is the default appearance, a tactile material language of glossy buttons, brushed surfaces and soft depth that plays the part Aqua played on Mac OS X.

You choose an appearance once, at the root of your site, and every control below it follows.

## Load Atmo

What you import depends on whether the page runs the SynCloudOS host.

| Page | Imports | Appearance |
| --- | --- | --- |
| A site or single application on `mountSynCloudOS` | `@syndromatic/syncloudos/nse/styles.css` and `@syndromatic/syncloudos/browser/styles.css`, once, in the host entry | The host installs Atmo for the shell and every SynWare it hosts. Don't import the Atmo theme stylesheet or wrap anything in `NSEAppearanceProvider`. |
| A standalone React page without the host | `@syndromatic/syncloudos/nse/styles.css` and `@syndromatic/syncloudos/nse/themes/atmo/styles.css` | Wrap the page in `NSEAppearanceProvider`, as below. |

A SynWare never imports these stylesheets itself; the page that hosts it does. A standalone React page provides the appearance directly:

```tsx
import { NSEAppearanceProvider } from "@syndromatic/syncloudos/nse/appearance";
import { atmoAppearance } from "@syndromatic/syncloudos/nse/themes/atmo";
import { NSEButton } from "@syndromatic/syncloudos/nse";

export function Page() {
  return (
    <NSEAppearanceProvider appearance={atmoAppearance} colourScheme="auto">
      <NSEButton title="Continue" keyEquivalent={"\r"} />
    </NSEAppearanceProvider>
  );
}
```

## Axes of appearance

Appearance combines several independent settings. Each one can change without disturbing the others.

| Axis | Values | Meaning |
| --- | --- | --- |
| Theme | `atmoAppearance` | The visual language. |
| Colour scheme | `"auto"`, `"light"`, `"dark"` | The requested scheme. `auto` follows the system and resolves to light or dark. |
| Chrome | `"standard"`, `"metal"`, `"hud"` | The material of window furniture: the standard aluminium, brushed metal or a translucent heads-up panel. |
| Contrast | `"normal"`, `"high"`, `"forced"` | Increased contrast, or the operating system's forced colours. |
| Transparency | `"normal"`, `"reduced"` | Whether translucent materials render as themselves or as solid surfaces. |

Theme and colour scheme are separate choices. Atmo ships in both light and dark, and switching one leaves the other alone.

Atmo is the one theme SynCloudOS ships. It is drawn as vectors, and it styles both NSE controls and the window and application chrome around them. Dark mode is Atmo's `"dark"` colour scheme, not a different theme: request it with `colourScheme`, or leave `"auto"` to follow the system.

Atmo-Heritage and Atmo-Onyx are obsolete raster themes from earlier releases. Don't use them, don't mistake either for a dark mode, and don't copy their colours into your own stylesheet. You can still build your own SynCloudOS theme as an appearance; a custom theme replaces Atmo's look, it doesn't sit beside a hand-written palette.

Hard-coded colours work against this. An application stylesheet with its own hex palette doesn't follow the colour scheme, contrast or transparency settings, and the Developer MCP `validate` tool reports it as an `idiom.atmo-appearance` warning. Use NSE controls for controls, the tokens below for your own surfaces, and `[data-mode="dark"]` only where your own content needs a different treatment.

## Tokens for your own content

These custom properties are the public vocabulary for content you draw yourself: your own panels, captions, dividers and highlights. NSE controls and chrome are already styled by the theme; these are for everything else.

Each colour has a light and a dark value and follows the resolved colour scheme. SynCloudOS defines theme-neutral defaults, and the active theme redefines them: under Atmo they come from Atmo's own inks and materials. A custom theme sets the same names to restyle every application's content.

| Colour token | Use it for |
| --- | --- |
| `--nse-app-background` | The plain application background. |
| `--nse-app-foreground` | Body text and icons on that background. |
| `--nse-app-foreground-secondary` | Secondary text: captions, labels, metadata. |
| `--nse-app-surface` | The fill of a panel, card or inset group drawn on the background. |
| `--nse-app-surface-border` | The edge of that panel or card. |
| `--nse-app-separator` | Divider lines between rows or sections. |
| `--nse-app-accent` | Highlights, links and the active state of your own controls. |
| `--nse-app-accent-foreground` | Text or icons drawn on an `--nse-app-accent` fill. |
| `--nse-app-selection` | The fill behind selected rows or items. |
| `--nse-app-critical` | Errors and destructive states. |

The text colours keep at least 4.5:1 contrast against `--nse-app-background`, and the accent at least 3:1, in both schemes.

```css
.readout { background: var(--nse-app-surface); border: 1px solid var(--nse-app-surface-border); }
.readout-caption { color: var(--nse-app-foreground-secondary); }
.readout-row + .readout-row { border-top: 1px solid var(--nse-app-separator); }
.readout-value[data-alarm] { color: var(--nse-app-critical); }
```

| Purpose | Tokens |
| --- | --- |
| Type | `--nse-text-body-size`, `--nse-text-body-line`, `--nse-text-callout-size`, `--nse-text-caption-size`, `--nse-text-footnote-size`, `--nse-text-headline-size`, `--nse-text-headline-weight`, `--nse-text-label-size`, `--nse-text-label-weight` and `--nse-text-secondary-opacity`. |
| Spacing | `--nse-space-1` to `--nse-space-8` (4 to 40 px), `--nse-spacing-tight`, `--nse-spacing-standard`, `--nse-spacing-inline`, `--nse-spacing-related`, `--nse-spacing-group`, `--nse-content-margin` and `--nse-content-spacing`. |

For a tint the set does not name, mix from a token rather than inventing a colour, so it still follows the scheme and theme: `color-mix(in srgb, var(--nse-app-accent) 12%, transparent)`.

Other `--nse-*` properties belong to individual controls and themes and may change between releases. A name that isn't defined at all, such as `--nse-label-primary`, resolves to its `var()` fallback or the property's initial value, so it never follows Atmo; `validate` reports it as `idiom.nse-token`.

## Read the appearance

Components read the resolved appearance from context:

```tsx
import { useNSEAppearance } from "@syndromatic/syncloudos/nse/appearance";

export function SchemeLabel() {
  const appearance = useNSEAppearance();
  return <output>{appearance.resolvedColourScheme}</output>;
}
```

Inside a SynWare, `useAppearance()` returns the requested appearance and the resolved mode, and it re-renders when either changes. The projection adds `data-nse-*` attributes on the boundary element (`data-mode` holds `light` or `dark`), so your own CSS can respond to the scheme with a plain selector:

```css
[data-mode="dark"] .note-surface {
  background: #1d1f24;
}
```

## Slots and recipes

Each themed control part has a **slot**, a semantic name such as `toolbar.item.pressed.1x`. An appearance maps slots to **recipes**, which describe the artwork or vector construction for that part in that state. `useNSEAppearanceSlot(slot)` resolves one slot for the current appearance, and `resolveNSEAppearanceSlot` does the same outside React. Custom controls use slots to pick up the theme without knowing which one is active.

Atmo draws most of its surfaces as vectors, which keeps edges sharp at every pixel density and lets one definition serve light and dark.

## Define an appearance

`defineNSEAppearance` validates and freezes an appearance definition:

```ts
import { defineNSEAppearance } from "@syndromatic/syncloudos/nse/appearance";

export const brandAppearance = defineNSEAppearance({
  id: "brand",
  displayName: "Brand",
  recipes: [{ slot: "toolbar.surface.normal.1x", recipeId: "brand.toolbar.surface.normal.1x" }],
});
```

The `id` uses lowercase letters, digits and hyphens. Recipes named in a definition must be supplied by the styles you load with it.

## Materials and lighting

Material lighting and the smooth geometry renderer are theme internals. Windows, app views, menus, popovers and toolbars retain their existing smooth-corner rendering. Application views and AFX layers use `cornerRadius` with `cornerCurve: "continuous"` (`CALayer.cornerCurve`); the default curve is `"circular"`. Atmo draws a continuous corner as a squircle through CSS `corner-shape`; browsers without that property retain the circular radius fallback. The internal manifest-driven geometry remains available for existing host surfaces.

Custom `NSEBox` properties select Atmo's well, frame or floating plate. `NSEShadow` is an `NSShadow`-shaped value assigned to `NSEView.shadow` or `NSEBox.shadow`. Properties are projected as data attributes and CSS variables; Atmo owns the look and suppresses decorative shadows under reduced transparency or forced colours. Explicit box fill, border, radius and transparency values take precedence over sprite artwork. See the [property-to-look table](nse/boxes-and-shadows.md).

## Accessibility

Appearance follows the user's settings and keeps semantics intact:

- Forced colours mode replaces decorative fills with system colours and draws visible outlines around controls and focus.
- Reduced transparency swaps translucent materials for opaque ones.
- Reduced motion removes transform travel from transitions and keeps ordering, focus and completion.
- Disabled, invalid and focus states stay legible in light, dark and high contrast, and they remain native attributes when artwork is absent.
