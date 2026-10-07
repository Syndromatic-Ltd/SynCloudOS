# Appearance and Atmo

NSE separates what a control does from how it looks. A control declares its role, its state and its accessibility. An appearance decides the visual treatment. Atmo is the default appearance, a tactile material language of glossy buttons, brushed surfaces and soft depth that plays the part Aqua played on Mac OS X.

You choose an appearance once, at the root of your site, and every control below it follows.

## Load Atmo

Import the base styles and the Atmo styles next to your entry point:

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/nse/themes/atmo/styles.css";
```

`mountSynCloudOS` installs the Atmo appearance for the shell and every SynWare it hosts, so a site built on the host needs nothing more. A standalone React page provides it directly:

```tsx
import { NSEAppearanceProvider } from "@syndromatic/syncloudos/nse/appearance";
import { atmoAppearance } from "@syndromatic/syncloudos/nse/themes/atmo";
import { NSEPushButton } from "@syndromatic/syncloudos/nse";

export function Page() {
  return (
    <NSEAppearanceProvider appearance={atmoAppearance} colourScheme="auto">
      <NSEPushButton tone="affirmative">Continue</NSEPushButton>
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

## Read the appearance

Components read the resolved appearance from context:

```tsx
import { useNSEAppearance } from "@syndromatic/syncloudos/nse/appearance";

export function SchemeLabel() {
  const appearance = useNSEAppearance();
  return <output>{appearance.resolvedColourScheme}</output>;
}
```

Inside a SynWare, `useSynWareAppearance()` returns the requested appearance and the resolved mode, and it re-renders when either changes. The projection adds `data-nse-*` attributes on the boundary element (`data-mode` holds `light` or `dark`), so your own CSS can respond to the scheme with a plain selector:

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

Surfaces such as brushed metal respond to a light direction. `NSEMaterialLightingProvider` supplies it, and `staticNSEMaterialLight` gives a fixed default for hosts that do not track device orientation. `NSESmoothSurface` draws continuous curvature corners (`arc`, `squircle`, `superellipse` or `clothoid`), and the manifest's `smoothSurface` fields drive the same shapes for windows and the application stage.

## Accessibility

Appearance follows the user's settings and keeps semantics intact:

- Forced colours mode replaces decorative fills with system colours and draws visible outlines around controls and focus.
- Reduced transparency swaps translucent materials for opaque ones.
- Reduced motion removes transform travel from transitions and keeps ordering, focus and completion.
- Disabled, invalid and focus states stay legible in light, dark and high contrast, and they remain native attributes when artwork is absent.
