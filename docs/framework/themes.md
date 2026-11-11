# Themes

A theme decides how NSE controls and SynCloudOS chrome look: their fills, borders, shadows, artwork and colours. It doesn't decide what a control is, how big it is, how it lays out, how it moves or what typeface it uses. Those belong to the framework, so every theme behaves the same and only looks different.

Atmo is the built-in theme. It is itself a theme bundle, `Atmo.scostheme`, drawn through the same contract as any theme you write.

## What a theme is

A theme is a `.scostheme` bundle of static files: an identity, a definition and stylesheets. It contains no code that runs. It can:

- paint every control part the [theme contract](theme-contract.md) publishes, in every state and variant it lists;
- set the 48 semantic colours, in light and dark, and optionally for high contrast;
- supply named images, such as `NSGoBackTemplate`, and workspace artwork;
- choose navigation placement and the login, notification and material-lighting presentations.

It can't:

- change typography (`font`, `line-height`, `letter-spacing`, `word-spacing`, `text-transform`);
- add motion (`animation`, `transition`), because motion is framework-owned and follows the system's reduced-motion setting;
- hide or reveal semantics (`display`, `visibility`, `content` on a contract part);
- remove a focused control's focus indicator without drawing another;
- shrink a control's hit target below 24 points;
- select anything outside the contract: no classes, element names or IDs.

## Bundle layout

```text
src/Themes/
  Dusk.scostheme/
    Contents/
      Info.ts
      Theme.json
      Resources/
        theme.css
        buttons.css
        button-rounded.png
        button-rounded@2x.png
      Licences/
```

The Vite plugin discovers every bundle in `src/Themes`. Set `themesDirectory` in `synCloudOS({ … })` to look elsewhere, or `false` to disable discovery.

`Info.ts` is the theme's identity. It is read statically, never executed:

```ts
export default { bundleIdentifier: "com.example.dusk", displayName: "Dusk", version: "1.0.0", themeContractVersion: 1 };
```

`Resources/theme.css` is the entry stylesheet. It can `@import` other stylesheets in the bundle, which load in import order. `url()` references resolve relative to the stylesheet and must stay inside the bundle; `data:` URLs are allowed. Put the licences for any artwork you ship in `Licences/`.

## Theme.json

```json
{
  "colours": {
    "light": { "labelColour": "#1f2329", "controlAccentColour": "#3a6fd8" },
    "dark": { "labelColour": "#eceff3", "controlAccentColour": "#6f9bf0" },
    "highContrastLight": { "labelColour": "#000000" }
  },
  "navigation": {
    "compact": { "placement": "block-end", "flow": "overlay" },
    "regular": { "placement": "source-list", "flow": "in-flow" }
  },
  "presentation": { "login": "plain", "notifications": "plain", "materialLighting": "off" },
  "images": {
    "NSGoBackTemplate": { "files": { "1x": "Resources/back.svg" }, "pointSize": { "width": 17, "height": 17 }, "template": true }
  }
}
```

- `colours.light` and `colours.dark` name all 48 semantic colours; the example shows two. `highContrastLight` and `highContrastDark` are optional and partial. Each colour becomes a `--nse-colour-*` property on the theme's boundary, so applications that use those properties follow your theme. The [reference](theme-contract.md#colours) lists every name.
- `navigation` chooses where window navigation sits in compact and regular widths, and whether it overlays content or takes space in the layout.
- `presentation` chooses the login window's ornament, how notifications are drawn, and whether materials are lit.
- `images` maps image names to files, at `1x` and optionally `2x` and `3x`. `NSEImage.named(name)` resolves through the active theme first, then Atmo. A `template` image is drawn as a mask in the current text colour.

## Drawing controls

Theme stylesheets use plain selectors. The build places them in the `nse.theme` cascade layer, above Atmo, and scopes them to the elements your theme applies to. Inside a theme stylesheet, `:scope` is the theme's boundary element.

Select a control with `[data-nse-control]`, a part of it with `[data-nse-part]`, and narrow by state and variant attributes:

```css
[data-nse-control="button"][data-nse-bezel-style="rounded"] {
  background: linear-gradient(var(--nse-colour-control-background), color-mix(in srgb, var(--nse-colour-control-background) 88%, black));
  border: 1px solid var(--nse-colour-grid);
  border-radius: 6px;
}

[data-nse-control="button"][data-nse-bezel-style="rounded"][data-nse-highlighted] {
  background: color-mix(in srgb, var(--nse-colour-control-accent) 22%, var(--nse-colour-control-background));
}

[data-nse-control="slider"] [data-nse-part="track"] {
  background: var(--nse-colour-separator);
}

[data-nse-control="slider"] [data-nse-part="fill"] {
  background: var(--nse-colour-control-accent);
}
```

A rule that names no state draws the resting state only. A rule for `button` doesn't also paint the button while it is hovered, highlighted, selected, focused, disabled or on, so your resting paint never leaks into those states. Name the state to draw it: `[data-nse-hovered]`, `[data-nse-highlighted]`, `[data-nse-focused]`, `[data-nse-selected]`, `[data-nse-enabled="false"]`, `[data-nse-state="on"]` and `[data-nse-key-window="false"]`. The [reference](theme-contract.md) lists the states each control publishes.

A rule for a part with no control in its selector applies wherever that part appears, but stops at the next control inside it, so nested controls keep their own drawing.

Respond to appearance with the boundary attributes: `[data-nse-colour-scheme-resolved="dark"]`, `[data-nse-contrast="high"]` and `[data-nse-transparency="reduced"]`. `@media`, `@supports`, `@container` and `@layer` are allowed.

## Sliced artwork

Draw a stretchable control from a left cap, a repeating middle and a right cap with `border-image`. `image-set()` supplies the 2× file to high-density screens:

```css
[data-nse-control="button"][data-nse-bezel-style="rounded"] {
  border-style: solid;
  border-width: 0 12px;
  border-image-source: image-set("button-rounded.png" 1x, "button-rounded@2x.png" 2x);
  /* 12px caps at each end; the middle repeats. Slices are in image pixels at 1x. */
  border-image-slice: 0 12 fill;
  border-image-repeat: repeat;
  background: none;
}

[data-nse-control="button"][data-nse-bezel-style="rounded"][data-nse-highlighted] {
  border-image-source: image-set("button-rounded-pressed.png" 1x, "button-rounded-pressed@2x.png" 2x);
}
```

SVG works the same way, as a file or a `data:` URL, and stays sharp at every density. CSS gradients, shadows and masks need no files at all; Atmo draws almost everything that way.

## What Atmo provides underneath

Atmo is always loaded, in the `nse.atmo` layer beneath every theme. Any part your theme doesn't draw keeps Atmo's drawing, so a theme can start small, with colours and a few controls, and grow. `validate_theme` lists the parts you haven't drawn yet.

Control structure (size, layout, typography, motion) lives in `nse.structure` and Atmo's layer and applies under every theme. A theme repaints a control; it never re-lays it out.

## Using a theme

Name it in the host:

```tsx
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { themes } from "virtual:syncloudos/themes";

const host = await mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.hello" }, theme: themes["com.example.dusk"] });
```

`themes` holds every discovered bundle's `NSETheme`, keyed by bundle identifier. A theme's stylesheets are built only if the host names it or your code references it through `themes`. Without `theme`, the host uses Atmo.

A standalone React page sets it on its root view: `<NSEView appearance={new NSEAppearance("aqua", { theme: themes["com.example.dusk"] })}>`.

## Nesting

Every theme boundary carries `data-nse-theme="<bundleIdentifier>"`. A provider inside another provider starts a new boundary. The inner theme's rules apply inside it, the outer theme's stop at it, and the inner boundary resets every semantic colour so nothing is inherited from outside.

## Scaffolding and validating

The Developer MCP has two tools for themes:

- `scaffold_theme` creates a complete bundle: `Info.ts`, a `Theme.json` that starts from Atmo's colours, navigation and presentation, marked for replacement, and a `theme.css` with an empty, commented rule for every control part in the installed contract. It never overwrites anything.
- `validate_theme` checks a bundle against the installed contract without running anything. Errors are rule violations and hard limits; warnings list the parts the theme doesn't draw yet, with coverage counts.

The `validate` tool also applies the theme rules to any `.scostheme` in the project. See [Developer MCP](developer-mcp.md) and the [idiom rules](developer-mcp/idiom-rules.md).

## Contract versions

`themeContractVersion` in `Info.ts` names the contract a theme was written against. Adding parts or states is compatible and keeps the version; renaming or removing them changes it. The [contract reference](theme-contract.md) is generated from the published contract and lists every control, part, state, variant, colour and limit.
