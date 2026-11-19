# Themes

A theme supplies the fills, borders, shadows, artwork, colours and typography of NSE controls and SynCloudOS chrome. The framework owns control semantics and interaction; a theme times its transitions through the framework's motion roles.

Atmo is the built-in theme. It is itself a theme bundle, `Atmo.scostheme`, drawn through the same contract as any theme you write.

## What a theme is

A system theme is a `.scostheme` bundle of static files with an identity, a definition and stylesheets. It contains no code that runs. It can:

- paint every control part the [theme contract](theme-contract.md) publishes, in every state and variant it lists;
- set the 48 semantic colours, in light and dark, and optionally for high contrast;
- supply named images, such as `NSGoBackTemplate`, and workspace artwork;
- style control text and supply package-local WOFF2 fonts;
- choose navigation placement and the login, notification and material-lighting presentations;
- time its transitions with springs or timing curves for the motion roles.

It can't:

- run animations (`animation`, `@keyframes`), or give a transition a literal duration, delay or easing;
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
        fonts/
          DuskText.woff2
      Licences/
```

The Vite plugin discovers system themes in `src/Themes`. Set `themesDirectory` in `synCloudOS({ … })` to look elsewhere, or `false` to disable system theme discovery.

`Info.ts` is the theme's identity. It is read statically, never executed:

```ts
export default { bundleIdentifier: "com.example.dusk", displayName: "Dusk", version: "1.0.0", themeContractVersion: 1 };
```

`Resources/theme.css` is the entry stylesheet. It can `@import` other stylesheets in the bundle, which load in import order. `url()` references resolve relative to the stylesheet and must stay inside the bundle. Inline image data URLs are allowed. Put artwork and font licences in `Licences/`.

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
  },
  "motion": {
    "control": { "duration": 0.3, "bounce": 0.15 },
    "dismissal": { "duration": 0.2, "timingFunction": [0.42, 0, 1, 1] }
  }
}
```

- `colours.light` and `colours.dark` name all 48 semantic colours; the example shows two. `highContrastLight` and `highContrastDark` are optional and partial. Each colour becomes a `--nse-colour-*` property on the theme's boundary, so applications that use those properties follow your theme. The [reference](theme-contract.md#colours) lists every name.
- `navigation` chooses where window navigation sits in compact and regular widths, and whether it overlays content or takes space in the layout.
- `presentation` chooses the login window's ornament, how notifications are drawn, and whether materials are lit.
- `images` maps image names to files, at `1x` and optionally `2x` and `3x`. `NSEImage.named(name)` resolves through the active theme first, then Atmo. A `template` image is drawn as a mask in the current text colour.
- `motion` is optional and partial; a role you omit takes Atmo's timing. See [Motion](#motion).

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

Atmo is always loaded in the `nse.atmo` layer beneath installed themes. When a theme draws an element in a particular state, the build clears the underlying paint and typography on that element and its `::before` and `::after`. Other parts and states keep their underlying drawing. `validate_theme` reports coverage for a whole system theme.

Switch state labels are optional. To show them, set `--nse-switch-state-label-display: inline-block` on the switch's `label` parts. The switch reports its state through `aria-checked` whether or not the labels are drawn.

## Typography

Set `font`, its longhands, `line-height`, `letter-spacing`, `word-spacing` and `text-transform` on the parts you draw. When a drawing omits an inherited typography property, the part takes that property from its parent.

Declare custom fonts with `@font-face`. Each `src` must resolve to a WOFF2 file under the bundle's `Resources/` directory. Use a family name specific to the theme because the browser registers font families for the document.

```css
@font-face {
  font-family: "Dusk Text";
  src: url("./fonts/DuskText.woff2") format("woff2");
  font-display: swap;
}

[data-nse-control="button"] [data-nse-part="title"] {
  font-family: "Dusk Text", system-ui, sans-serif;
  letter-spacing: 0.02em;
}
```

## Motion

The framework names six motion roles: `standard`, `control`, `selection`, `presentation`, `dismissal` and `scrollBoundary`. In `Theme.json`, give a role either a spring or a timing curve:

- `{ "duration": 0.3, "bounce": 0.15 }` is a spring in Core Animation's perceptual terms. `duration` runs from 0.07 to 10 seconds, and `bounce` lies between -1 and 1: 0 is critically damped, positive bounces, negative is overdamped.
- `{ "duration": 0.2, "timingFunction": [x1, y1, x2, y2] }` is a duration in seconds with `CAMediaTimingFunction` control points.

Each role becomes `--nse-motion-<role>-duration` and `--nse-motion-<role>-easing` on the theme's boundary, in kebab case such as `--nse-motion-scroll-boundary-duration`. A spring runs for its settling time along a `linear()` curve sampled from the spring. Time every transition with these properties and nothing else; reduced motion sets every duration to zero.

```css
[data-nse-control="switch"] [data-nse-part="knob"] {
  transition: left var(--nse-motion-selection-duration) var(--nse-motion-selection-easing);
}
```

CSS transitions start from rest, so an interrupted transition loses its velocity. Framework animations that need to keep it, such as scrolling, read the role from the theme.

## Using a theme

Name it in the host:

```tsx
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { themes } from "virtual:syncloudos/themes";

const dusk = themes["com.example.dusk"];
if ("kind" in dusk) throw new TypeError("The host requires a system theme.");
const host = await mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.hello" }, theme: dusk });
```

`themes` holds each discovered `NSETheme` or `NSEAppTheme`, keyed by bundle identifier. A theme's stylesheets are built only if the host names it or your code references it through `themes`. Without `theme`, the host uses Atmo.

Select a theme directly with `themes["com.example.dusk"]`. A direct runtime key such as `themes[chosenIdentifier]` includes every discovered stylesheet so the choice can be made at runtime. Copying, destructuring or passing the registry itself results in a build error with the source file and location. Select a theme before passing it to other code.

A standalone React page sets it on its root view: `<NSEView appearance={new NSEAppearance("aqua", { theme: themes["com.example.dusk"] })}>`.

## Nesting

A system theme boundary carries `data-nse-theme="<bundleIdentifier>"`. A provider inside another provider starts a new boundary. The inner theme's rules apply inside it, the outer theme's stop at it, and the inner boundary resets every semantic colour so nothing is inherited from outside.

## App themes

An app can ship a partial theme for its own window and navigation chrome. Put the bundle in the app's resources.

```text
Run.app/
  Contents/Resources/
    RunChrome.scostheme/
      Contents/
        Info.ts
        Resources/
          theme.css
```

Use the usual `Info.ts` identity and `themeContractVersion`. The Vite plugin discovers the bundle with the app. An app theme contains stylesheets and their local artwork. The enclosing system theme supplies semantic colours, navigation, presentation and named images, so omit `Theme.json`.

An app theme can draw `window`, `toolbar`, `toolbar-item`, `tab-view`, `segmented-control`, `split-view`, `menu`, `menu-item` and `popover`. A full-screen application's frame is a `window` with `data-nse-presentation="stage"`. Anchor each selector to an allowed control and use its published parts, states and variants. The app bundle validator accepts partial coverage. See [App theme controls](theme-contract.md#app-theme-controls).

```css
[data-nse-control="tab-view"] [data-nse-part="cell"][data-nse-selected] {
  background: #c8102e;
  color: white;
}
```

Set an appearance at the application, window or view level. The nearest setting takes precedence.

- `app.appearance` applies to windows, sheets, popovers and menus the application presents.
- `window.appearance` overrides the application for one window.
- `NSEView.appearance` applies to a view and its descendants.

```tsx
import { NSEAppearance } from "@syndromatic/syncloudos/nse/appearance";
import { themes } from "virtual:syncloudos/themes";

const chrome = new NSEAppearance({ theme: themes["com.example.run.chrome"] });
app.appearance = chrome;
window.appearance = chrome;
// A view can also set <NSEView appearance={chrome}>…</NSEView>.
```

Assign `null` to an application or window appearance to restore inheritance. An appearance that only sets an app theme follows the surrounding light or dark scheme, contrast and transparency.

The `data-nse-app-theme` boundary keeps the system theme and its semantic colours in effect. App drawing applies in `nse.app-theme`, above the system theme's drawing, and replaces the paint for each part and state it draws. Instance properties such as `bezelColour` take precedence. App drawing stops at a different app theme boundary and at `data-nse-system-surface`, which marks surfaces such as System Preferences, the open and save panels, and the Colour and Font panels.

## Scaffolding and validating

The Developer MCP has two tools for themes:

- `scaffold_theme` creates a complete bundle: `Info.ts`, a `Theme.json` that starts from Atmo's colours, navigation and presentation, marked for replacement, and a `theme.css` with an empty, commented rule for every control part in the installed contract. It never overwrites anything.
- `validate_theme` checks a bundle against the installed contract without running anything. Errors are rule violations and hard limits; warnings list the parts the theme doesn't draw yet, with coverage counts.

The `validate` tool also applies the theme rules to any `.scostheme` in the project. See [Developer MCP](developer-mcp.md) and the [idiom rules](developer-mcp/idiom-rules.md).

## Contract versions

`themeContractVersion` in `Info.ts` names the contract a theme was written against. Adding parts or states is compatible and keeps the version; renaming or removing them changes it. The [contract reference](theme-contract.md) is generated from the published contract and lists every control, part, state, variant, colour and limit.
