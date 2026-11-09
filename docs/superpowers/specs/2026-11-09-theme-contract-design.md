# Theme contract, `.scostheme` bundles and layout guides: design

Date: 9 November 2026. Status: draft for the owner's approval.
Replaces the theme half of PR #1 ("Theme packages, Metro and Panorama navigation"), reusing its bundle format. Whether PR #1 is closed is the owner's decision.

## Why

A SynCloudOS developer should never be tied to one look. Atmo is the theme Syndromatic ships. A developer who wants something different, flat or skeuomorphic and as different from Atmo as Metro is, should be able to write their own theme. Combined with their own motion tuning (a separate, later capability), that gives them a SynCloudOS experience that looks entirely their own.

Today that isn't possible:

- **Themes can only recolour.** The neutral appearance contract has ten `--nse-app-*` colour values. Everything else Atmo draws comes from about 1,170 selectors on private `.nse-*` classes, across `atmo.css` (6,681 lines) and `atmo-structure.css` (4,740 lines).
- **The idiom audit rejects Atmo-quality themes.** The new rules report 1,640 errors on Atmo's own stylesheets.
- **No stable drawing surface.** There's no public, stable description of what a theme may draw. A third-party theme would have to reach into implementation classes that change between betas.
- **No layout guides.** Nothing tells an app's content where the window's bars end, so a theme that moves navigation could hide content.

"AppKit defines the architecture. Atmo defines the appearance." This design makes that literal: the framework publishes what can be drawn, using AppKit's vocabulary, and a theme supplies the drawing.

## What a theme is

**A theme controls looks only.** Specifically:

- how each control part looks in each state, drawn with CSS, SVG or sliced raster artwork;
- colours;
- metrics (radii, padding, control heights);
- light and dark variants, plus increased contrast and reduced transparency;
- where navigation sits at each layout width, chosen from a fixed list;
- a small set of purely visual presentation choices.

**A theme never controls:**

- **Motion.** App opening, switching, sheets and navigation transitions belong to the framework, and later to a separate developer motion API. Atmo's `atmoMotion` curves move out of the theme into the framework's defaults.
- **Fonts and typography.** Developers set these for each site, or for each app in single-application mode.
- **Behaviour.** Focus, accessibility semantics, commands, lifetimes and when transitions happen are all framework-owned.
- **Code.** A theme is static data plus CSS and resources. It contains no JavaScript or TypeScript and never runs.

## Goals

1. Layout guides in the AppKit shape, so content always stays clear of window chrome wherever the theme puts it (Part 1).
2. A public, versioned **control drawing contract**: every public NSE control publishes its parts, states and variants as stable hooks, named in AppKit terms (Part 2).
3. **`.scostheme` bundles**: a validated package format with discovery and selection (Part 3).
4. **Atmo rebuilt as `Atmo.scostheme`** using only the public contract, with no visible change (Part 4).
5. **Tooling to match**: the idiom audit, `validate_theme` and `scaffold_theme` enforce and support the contract (Part 5).

## Non-goals (later, separate jobs)

- Metro and Panorama, rebuilt on this contract from PR #1's work.
- An iOS 27-style theme.
- The developer motion-customisation API.
- `NSEColour` and `VFXPlayerView`. The colour names below are chosen so `NSEColour` can map onto them directly later.
- End users installing untrusted themes at run time. Bundles are trusted build-time source chosen by the host.

## Anti-goals (a failure even if it technically works)

- **Atmo looks or behaves different after the rebuild,** by even one pixel or one state, on any surface. No design changes ride along with this work.
- **The public contract leaks Atmo.** No Atmo-specific names, such as "grouped-toolbutton", "bottom-fade" or "metal-centre", may appear in public hook names. Names come from AppKit (`bezelStyle`, `controlSize`, `segmentStyle`, `state`, `isHighlighted`) or neutral structure (bezel, title, image, track, knob).
- **A theme can break focus visibility, hit targets, reduced motion or accessibility semantics.**
- **The contract is a renamed copy of today's private classes.** It must be designed for a second theme, not reverse-engineered from Atmo's selectors.
- **Shims or aliases for the old API.** Beta 2 is the cut line for breaking API, so old names are removed, not kept alongside.

## Constraints

- **British spelling in every name,** including API names: `colour`, `Colour`, `Localised`, `Licences`.
- **AppKit fidelity for the API shape:**
  - classes and properties mirror AppKit where AppKit has the concept;
  - "theme" is a SynCloudOS concept with no Apple counterpart, so its names are SynCloudOS's own.
- **No unrequested design changes.** Where the rebuild forces a visual decision, propose it to the owner rather than choosing.
- **Breaking changes are allowed now** and are listed in the Beta 2 PR's breaking-changes section.

---

## Part 1: Layout guides

### What AppKit does

- `NSWindow.contentLayoutRect` and `contentLayoutGuide` give the area of the content view not covered by the title bar, toolbar or other window chrome.
- `NSView.safeAreaInsets`, `safeAreaRect` and `safeAreaLayoutGuide` give the same for any view, inherited from the window.
- `NSViewController` adds `additionalSafeAreaInsets` for its own extra chrome.
- `NSScrollView.automaticallyAdjustsContentInsets` (on by default) pads scrolling content so it can scroll *under* translucent chrome but rests clear of it. `contentInsets` and `scrollerInsets` allow manual control.

### What SynCloudOS gets

- **`NSEWindow`:** `contentLayoutRect` and `contentLayoutGuide`. They account for the device safe area that `ScreenService` already tracks (notches, home indicator, foldable hinges), the window's own title bar and toolbar, and any navigation strip or bar the window hosts.
- **Every view:** `safeAreaInsets` and `safeAreaRect`. Controller-based views get them through `NSEViewController`, which also gains `additionalSafeAreaInsets`. Function-component views read them through a hook, whose name is left to the builder.
- **`NSEScrollView`:** `automaticallyAdjustsContentInsets` (default `true`), `contentInsets` and `scrollerInsets`.
- **CSS:** the framework publishes each view's safe-area insets as custom properties on the view's element, using logical sides (block-start, block-end, inline-start, inline-end), so ordinary CSS layout gets them too. The builder chooses the exact names, following existing `--nse-*` naming.
- **Live updates:** the guides change when bars appear, move or resize, when the window changes size class, or when a foldable changes posture. These updates never fire layout loops (they're observed, not polled).

### Behaviour

- **Atmo today:** the compact peer-navigation bar floats over content at the bottom. With guides, scrolling content scrolls under it and rests above it. A top strip, as in Metro, would push content down the same way. Nobody hard-codes an offset.
- **Existing first-party apps** keep their current layout. Where an app hard-codes a bar offset today, it moves onto the guides, with no visible change.

---

## Part 2: The control drawing contract

### Shape

Every public NSE control publishes three kinds of hook on its rendered DOM. `dev` already has a partial version of this: `data-nse-control` on 45 controls and `data-nse-part` on 159 parts, but not the basic controls. The contract completes and formalises it:

1. **Control identity:** `data-nse-control="<name>"`. The name is the AppKit class name in kebab case without the prefix, for example `button`, `pop-up-button`, `segmented-control`, `slider`, `text-field`, `search-field`, `table-view`, `outline-view`, `tab-view`, `box`, `toolbar` and `window`.
2. **Parts:** `data-nse-part="<part>"` on each drawable element inside the control. Part names come from one shared, neutral vocabulary used consistently across controls: `bezel`, `title`, `image`, `track`, `fill`, `knob`, `indicator`, `separator`, `cell`, `header`, `content` and so on. A control documents which parts it has. Parts are structural, never Atmo-specific.
3. **State and variants:** attributes that mirror AppKit properties:
   - **State:** `data-nse-state` = `on` | `off` | `mixed` (AppKit's `NSControl.StateValue`).
   - **Highlighted:** `data-nse-highlighted` while pressed (`isHighlighted`).
   - **Enabled:** `data-nse-enabled="false"` when disabled (`isEnabled`).
   - **Focus:** `data-nse-focused` when it has keyboard focus and focus should be drawn.
   - **Hover:** `data-nse-hovered`.
   - **Selection:** `data-nse-selected` on selectable items (segments, rows, tabs).
   - **Window state:** `data-nse-key-window="false"` on a window and its contents when the window is inactive. AppKit draws inactive windows differently, and themes need that.
   - **Variants:** the AppKit property values the control was configured with: `data-nse-bezel-style`, `data-nse-control-size` (`mini` | `small` | `regular` | `large`), `data-nse-segment-style`, `data-nse-box-type`, and others as each control has them.
   - **Appearance:** the existing `data-nse-colour-scheme-resolved`, `data-nse-contrast` and `data-nse-transparency` attributes stay and become part of the contract.

A theme draws by writing CSS against these hooks only, for example:

```css
[data-nse-control="button"][data-nse-bezel-style="push"] [data-nse-part="bezel"] { … }
[data-nse-control="button"][data-nse-highlighted] [data-nse-part="bezel"] { … }
```

### What the framework still draws

- **Structure belongs to the framework.** Layout, box model, slots, minimum hit targets, focus-ring placement and accessibility live in framework-owned **structural CSS**, which ships with NSE and isn't a theme. Much of today's `atmo-structure.css` is really structure and moves there. The builder decides line by line, and any line that's really paint goes to Atmo.
- **The framework ships a plain, neutral rendering** of every control, so a theme that leaves a part undrawn still produces a usable, accessible control. `validate_theme` reports parts a theme leaves undrawn as warnings, never errors.
- **Hard limits a theme can't cross:**
  - a focus indicator must remain visible;
  - minimum hit-target sizes;
  - reduced motion;
  - `display`, `visibility` and `content` on parts that carry semantics.

  The validator enforces these.

### Artwork

Themes draw with CSS, SVG or raster images:

- **Sliced raster artwork** (a left cap, a horizontally repeating middle and a right cap; the vertical equivalent; and nine-slice) uses CSS `border-image` with slice insets. Resolution variants use `image-set()` with @2x and @3x files. This covers what Journal and other apps do today.
- **Artwork that extends outside a control's box** (shadows, glows) uses the framework's existing nine-slice primitive (`NSEAppearanceNineSlice`), which becomes a documented part of the contract.
- **The bundle validator checks:**
  - every referenced file exists inside the bundle;
  - slice insets fit within the image's dimensions;
  - every declared resolution variant is present;
  - SVGs contain no scripts, event handlers or external references.

### Colours

The ten `--nse-app-*` values grow into the full semantic set AppKit's `NSColor` system colours cover, so `NSEColour` can later expose them one to one. Names are British: `labelColour`, `secondaryLabelColour`, `tertiaryLabelColour`, `controlAccentColour`, `controlColour`, `controlTextColour`, `windowBackgroundColour`, `underPageBackgroundColour`, `textBackgroundColour`, `selectedContentBackgroundColour`, `separatorColour`, `gridColour`, `findHighlightColour`, `systemRed` and the other system hues, and so on. The builder takes the list from AppKit's documented semantic colours. Each is published as a CSS custom property, and a theme supplies light and dark values for each, plus optional increased-contrast values.

### Versioning

- **The contract is data.** A machine-readable description is generated from source: every control, its parts, states and variants, every colour value, the navigation placements and the hard limits. It ships in the SDK at `tooling/`, extending today's `nse-appearance-contract.json`, and carries `themeContractVersion: 1`.
- **A test fails** whenever a control's rendered hooks differ from the published contract, so the contract can't drift quietly.
- **Changes are API changes.** Adding parts or states is compatible. Renaming or removing them bumps the version.

---

## Part 3: `.scostheme` bundles

Reused from PR #1, minus fonts and motion, and simplified.

```
Paper.scostheme/
  Contents/
    Info.ts            identity: bundleIdentifier, displayName, version, themeContractVersion
    Theme.json         colours, metrics, navigation placement, presentation choices
    Resources/
      theme.css        the entry stylesheet; may @import other stylesheets in Resources
      …                images (PNG, @2x/@3x), SVGs, further stylesheets
      Localised/Base.locale/Localisable.strings   (optional: the display name, translated)
    Licences/          (optional) licences for bundled artwork
```

- **`Info.ts`** default-exports a static literal, parsed without being executed, just as an app's `Info.ts` is. Identity lives only here. `Theme.json` doesn't repeat it (my call, removing PR #1's duplication).
- **`Theme.json`:**
  - **`colours`:** `light` and `dark` maps for the semantic colour values, plus optional `highContrast` maps for each.
  - **`navigation`:** for each layout width class (`compact`, `regular`), a placement chosen from the framework's fixed list. The list starts with `compact`: `block-start` or `block-end` strip; `regular`: `source-list` or `block-start` strip. Each also takes `flow` (`in-flow` or `overlay`). The framework still handles the automatic switch from tab strip to sidebar as the window widens, as well as foldables, focus, overflow and keeping content clear via Part 1.
  - **`presentation`:** purely visual choices only, starting with the login style (`plain` or `ornamented`). New entries are added only for real needs.
- **Discovery:** the Vite plugin discovers `*.scostheme` folders under `src/Themes` by default, with a `themesDirectory` option, as in PR #1.
- **Validation:**
  - when a bundle is discovered or built, it's validated with PR #1's rules: paths stay inside the bundle, no symlinks or case collisions, safe SVG, size limits, and no executable files;
  - additionally, theme CSS may target only contract hooks and the framework's appearance attributes, never private `.nse-*` classes or app DOM.
- **Scoping:** the build wraps each theme's stylesheet in a CSS `@scope` for that theme's boundary automatically, so authors write plain selectors and nested themes don't leak into each other. This is my call. PR #1 required authors to write the `@scope` themselves, which was error-prone.
- **Selection:**
  - the host picks the theme by bundle identifier (the browser runtime's existing `appearance` option, defaulting to Atmo);
  - `NSEAppearance` keeps its existing per-view `theme` option, as `NSView.appearance` allows a different appearance on part of a window;
  - **naming (my call):** the theme type becomes `NSETheme`, and `defineNSEAppearance` and `NSEAppearanceDefinition` are removed. This frees "appearance" to mean what `NSAppearance` means (`aqua` or `darkAqua`), as it already does for `NSEAppearance`.
- **SDK:** Atmo ships inside the SDK as `Atmo.scostheme`. The `nse/themes/atmo` entry keeps working as the way to select it.

---

## Part 4: Atmo rebuilt on the contract

- **Atmo becomes `Atmo.scostheme`.** Every selector targets contract hooks only, and every colour comes from `Theme.json` or stays as a literal inside the theme's own CSS, which is allowed. Motion moves to framework defaults.
- **Controls gain their hooks.** Each NSE control emits the Part 2 hooks, and the private classes it renders become implementation detail. They may remain for structural CSS, but no theme may depend on them.
- **Proof of zero visible change:**
  - before any Atmo change, the builder records a screenshot baseline of the NSE Control Gallery (every control in every state and variant, light and dark), the Webspring shell, the login window, and Journal, About and Settings;
  - after the rebuild, they must match;
  - any difference is a bug, or a proposal to the owner, never an accepted change.
- **The tooling check:** Atmo passes `validate_theme` and the idiom audit with zero errors.

---

## Part 5: Tooling

- **Idiom audit:**
  - **Inside a `.scostheme`:** stylesheets may target contract hooks; targeting private `.nse-*` classes is an error.
  - **App and host CSS:** may target neither contract hooks nor private classes. App colour literals stay an error, as now.
  - **New warning:** an app that hard-codes a bar offset (for example a fixed top padding matching a bar height, or raw `env(safe-area-inset-*)` inside app content) is told to use the layout guides. The builder designs the heuristic, and it stays a warning.
- **`validate_theme`:**
  - validates a whole bundle (Part 3 rules) against the installed contract;
  - reports undrawn parts as warnings;
  - reports hard-limit violations as errors.
- **`scaffold_theme`:** creates a complete bundle, with `Info.ts`, `Theme.json` with every colour stubbed for light and dark, and `theme.css` with a commented, empty rule for every control part in the contract.
- **Documentation:** a theme-authoring guide (`docs/framework/themes.md`) and a generated contract reference listing every control's parts, states and variants.

## Breaking changes (Beta 2)

- `defineNSEAppearance`, `NSEAppearanceDefinition` and the slot/recipe API are replaced by `NSETheme` and `.scostheme` bundles.
- `atmoMotion` leaves the theme.
- Private `.nse-*` classes are no longer something themes may rely on.
- The `--nse-app-*` colour names become the semantic `NSColor`-shaped set.

## Left to the builder

- The order of work within each part, and how to split it into jobs.
- Exact CSS custom property names for safe-area insets, and the hook's name for function views.
- Which parts each control has. They must use the shared neutral vocabulary, and the builder records them in the contract.
- Which lines of `atmo-structure.css` are structure and which are paint.
- The bar-offset warning's heuristic.
- The screenshot tooling for the zero-change proof, which should reuse the existing Playwright setup.

## Calls made by Claude (for the owner to check)

1. The theme type is renamed `NSETheme`, and "appearance" keeps its `NSAppearance` meaning.
2. Identity lives only in `Info.ts`, not repeated in `Theme.json`.
3. The build wraps theme CSS in `@scope` automatically.
4. Undrawn parts fall back to a neutral framework rendering and warn rather than fail.
5. Semantic colours follow AppKit's `NSColor` system colour set, in British spelling.
6. The navigation placement list starts small (two compact options, two regular options) and grows only for real needs.
