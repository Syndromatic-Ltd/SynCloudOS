# Appearance and Atmo

NSE separates what a control does from how it looks. A control declares its role, its state and its accessibility. A theme decides the visual treatment. Atmo is the default theme, a tactile material language of glossy buttons, brushed surfaces and soft depth that plays the part Aqua played on Mac OS X.

You choose a theme once, at the root of your site, and every control below it follows. To write your own, see [Themes](themes.md).

## Load Atmo

What you import depends on whether the page runs the SynCloudOS host.

| Page | Imports | Appearance |
| --- | --- | --- |
| A site or single application on `mountSynCloudOS` | `@syndromatic/syncloudos/nse/styles.css` and `@syndromatic/syncloudos/browser/styles.css`, once, in the host entry | The host installs Atmo for the shell and every SynWare it hosts. Don't import the Atmo theme stylesheet or set an appearance on the root view. |
| A standalone React page without the host | `@syndromatic/syncloudos/nse/styles.css` and `@syndromatic/syncloudos/nse/themes/atmo/styles.css` | Set an `NSEAppearance` on the page's root `NSEView`, as below. |

A SynWare never imports these stylesheets itself; the page that hosts it does. A standalone React page sets the appearance on its root view, as `NSView.appearance` does:

```tsx
import { NSEAppearance } from "@syndromatic/syncloudos/nse/appearance";
import { atmoTheme } from "@syndromatic/syncloudos/nse/themes/atmo";
import { NSEButton, NSEView } from "@syndromatic/syncloudos/nse";

const appearance = new NSEAppearance("aqua", { theme: atmoTheme });

export function Page() {
  return (
    <NSEView appearance={appearance}>
      <NSEButton title="Continue" keyEquivalent={"\r"} />
    </NSEView>
  );
}
```

Use `"darkAqua"` for the dark appearance. Views without an appearance take their superview's, as `NSView.effectiveAppearance` does.

## Axes of appearance

Appearance combines several independent settings. Each one can change without disturbing the others.

| Axis | Values | Meaning |
| --- | --- | --- |
| Theme | `atmoTheme`, or any `NSETheme` from `virtual:syncloudos/themes` | The visual language. |
| Colour scheme | `"auto"`, `"light"`, `"dark"` | The requested scheme. `auto` follows the system and resolves to light or dark. |
| Chrome | `"standard"`, `"metal"`, `"hud"` | The material of window furniture: the standard aluminium, brushed metal or a translucent heads-up panel. |
| Contrast | `"normal"`, `"high"`, `"forced"` | Increased contrast, or the operating system's forced colours. |
| Transparency | `"normal"`, `"reduced"` | Whether translucent materials render as themselves or as solid surfaces. |

Theme and colour scheme are separate choices. Atmo ships in both light and dark, and switching one leaves the other alone.

Atmo is the one theme SynCloudOS ships. It is drawn as vectors, and it styles both NSE controls and the window and application chrome around them. Dark mode is Atmo's `"dark"` colour scheme, not a different theme: request it with `colourScheme`, or leave `"auto"` to follow the system.

Atmo-Heritage and Atmo-Onyx are obsolete raster themes from earlier releases. Don't use them, don't mistake either for a dark mode, and don't copy their colours into your own stylesheet. You can build your own theme as a `.scostheme` bundle ([Themes](themes.md)); a custom theme replaces Atmo's look, it doesn't sit beside a hand-written palette.

Hard-coded colours work against this. An application stylesheet with its own hex palette doesn't follow the colour scheme, contrast or transparency settings, and the Developer MCP `validate` tool reports it as an `idiom.atmo-appearance` warning. Use NSE controls for controls, the tokens below for your own surfaces, and `[data-mode="dark"]` only where your own content needs a different treatment.

## Tokens for your own content

These custom properties are the public vocabulary for content you draw yourself: your own panels, captions, dividers and highlights. NSE controls and chrome are already styled by the theme; these are for everything else.

Each colour has a light and a dark value and follows the resolved colour scheme. SynCloudOS defines theme-neutral defaults, and the active theme redefines them: under Atmo they come from Atmo's own inks and materials. A custom theme sets the same names to restyle every application's content.

| Colour token | Use it for |
| --- | --- |
| `--nse-colour-window-background` | The plain application background. |
| `--nse-colour-label` | Body text and icons on that background. |
| `--nse-colour-secondary-label` | Secondary text: captions, labels, metadata. |
| `--nse-colour-control-background` | The fill of a panel, card or inset group drawn on the background. |
| `--nse-colour-grid` | The edge of that panel or card. |
| `--nse-colour-separator` | Divider lines between rows or sections. |
| `--nse-colour-control-accent` | Highlights, links and the active state of your own controls. |
| `--nse-colour-selected-control-text` | Text or icons drawn on an `--nse-colour-control-accent` fill. |
| `--nse-colour-selected-content-background` | The fill behind selected rows or items. |
| `--nse-colour-system-red` | Errors and destructive states. |

The text colours keep at least 4.5:1 contrast against `--nse-colour-window-background`, and the accent at least 3:1, in both schemes.

```css
.readout { background: var(--nse-colour-control-background); border: 1px solid var(--nse-colour-grid); }
.readout-caption { color: var(--nse-colour-secondary-label); }
.readout-row + .readout-row { border-top: 1px solid var(--nse-colour-separator); }
.readout-value[data-alarm] { color: var(--nse-colour-system-red); }
```

| Purpose | Tokens |
| --- | --- |
| Type | `--nse-text-body-size`, `--nse-text-body-line`, `--nse-text-callout-size`, `--nse-text-caption-size`, `--nse-text-footnote-size`, `--nse-text-headline-size`, `--nse-text-headline-weight`, `--nse-text-label-size`, `--nse-text-label-weight` and `--nse-text-secondary-opacity`. |
| Spacing | `--nse-space-1` to `--nse-space-8` (4 to 40 px), `--nse-spacing-tight`, `--nse-spacing-standard`, `--nse-spacing-inline`, `--nse-spacing-related`, `--nse-spacing-group`, `--nse-content-margin` and `--nse-content-spacing`. |

For a tint the set does not name, mix from a token rather than inventing a colour, so it still follows the scheme and theme: `color-mix(in srgb, var(--nse-colour-control-accent) 12%, transparent)`.

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

## Custom themes

A theme is a `.scostheme` bundle: an identity, a `Theme.json` with colours, navigation, presentation and images, and stylesheets that draw controls through the public theme contract. Themes contain no code, and they don't change typography, motion or layout. [Themes](themes.md) covers writing, loading, nesting and validating one; the [theme contract reference](theme-contract.md) lists every control part, state, variant and colour a theme can draw.

## Materials and lighting

Material lighting and the smooth geometry renderer are theme internals. Windows, app views, menus, popovers and toolbars retain their existing smooth-corner rendering. Application views and AFX layers use `cornerRadius` with `cornerCurve: "continuous"` (`CALayer.cornerCurve`); the default curve is `"circular"`. Atmo draws a continuous corner as a squircle through CSS `corner-shape`; browsers without that property retain the circular radius fallback. The internal manifest-driven geometry remains available for existing host surfaces.

Custom `NSEBox` properties select Atmo's well, frame or floating plate. `NSEShadow` is an `NSShadow`-shaped value assigned to `NSEView.shadow` or `NSEBox.shadow`. Properties are projected as data attributes and CSS variables; Atmo owns the look and suppresses decorative shadows under reduced transparency or forced colours. Explicit box fill, border, radius and transparency values take precedence over sprite artwork. See the [property-to-look table](nse/boxes-and-shadows.md).

## Accessibility

Appearance follows the user's settings and keeps semantics intact:

- Forced colours mode replaces decorative fills with system colours and draws visible outlines around controls and focus.
- Reduced transparency swaps translucent materials for opaque ones.
- Reduced motion removes transform travel from transitions and keeps ordering, focus and completion.
- Disabled, invalid and focus states stay legible in light, dark and high contrast, and they remain native attributes when artwork is absent.
