# Themes and Appearance

A **Theme** is a visual language: Atmo, Metro, or a host-selected third-party language. **Appearance** independently means `auto`, `light`, or `dark`. Framework controllers continue to own navigation, commands, focus, lifetime, accessibility and authentication. Themes contain static paint, metrics and supported presentation choices, never executable renderers or service hooks.

## Packages and discovery

`synCloudOS()` discovers immediate `.scostheme` folders under `src/Themes`. Set `themesDirectory` to a different host directory, or `false` to disable discovery. Both first-party themes follow precisely the same format:

```
Paper.scostheme/
  Contents/
    Info.ts
    Theme.json
    Fonts.json                 # optional
    styles.css
    Resources/
      paper.css
      artwork.svg
      Localised/Base.locale/Localisable.strings
    Licences/
      LICENSE
```

`Info.ts` default-exports a statically parsed literal: `bundleIdentifier`, `displayName`, semantic `version`, `themeContractVersion: 1`, `definition: "Theme.json"` and `stylesheet: "styles.css"`. Theme.json has matching identity and metadata, recipes with semantic `component.part.state` slots, tokens, and presentation. Its contract is validated by the exact shared runtime `defineNSETheme` function.

A stylesheet's selectors must contain the exact theme boundary selector and be inside a nested-host cutoff:

```css
@scope ([data-nse-theme="org.example.paper"]) to ([data-nse-theme]:not([data-nse-theme="org.example.paper"])) {
  :scope[data-nse-theme="org.example.paper"] .nse-control-button { border-radius: 0; }
}
```

`styleTokenNames` records all `--nse-*` declarations in entry-reachable stylesheets and generated font roles. Discovery derives this inventory and verifies any supplied version matches exactly. The runtime uses it to reset foreign inherited custom properties at nested theme boundaries. First-party direct imports carry the identical checked-in inventory; after editing their styles, run `node scripts/synware/update-theme-inventories.mjs`.

All imports and file URLs must remain package-local. CSS values are parsed as CSS, including escaped function names and image-set string sources, rather than scanned with URL regexes. Missing assets, traversal, case collisions, symlinks, cyclic imports, unsupported executable files, dynamic URL constructions and installed-font local() lookup fail validation. Every CSS resource is validated, including unused and uppercase-extension sheets; only reachable sheets contribute the active property inventory. SVG files and inline SVG data reject executable elements, event handlers, external references and unsafe CSS. Raster data URLs are allowed for supported image MIME types; arbitrary data URLs are not.

Packages have limits of 4,096 files, 20 directory levels, 32 MiB per resource, 128 MiB total, and 4 MiB SVG text. This is a build-time consistency boundary for trusted host-selected source, not a hostile-code sandbox. Runtime upload/install of untrusted themes is not supported.

## Optional fonts and notices

Fonts.json uses the shared FontDeclaration schema: resources, families, aliases and roles. Resources must point to local Resources font binaries. Theme font roles are `ui`, `body`, `title`, `label`, and `monospace`. Discovery namespaces browser families and aliases with theme ID and version, validates all files, and emits scoped `--nse-theme-font-*` defaults via the ordinary Vite asset pipeline. Explicit host `--font-*` roles win. Theme CSS must not force application document typography.

CSS @font-face is also supported with a family prefixed by the theme ID and a hyphen. No installed-font probing is permitted; ordinary CSS fallback family lists are fine. Localised metadata belongs under Resources/Localised and distributable notices under Contents/Licences. Atmo retains the original first-party artwork and adapted vector-art licensing notices.

## SDK and hosting

`@syndromatic/syncloudos/nse/theme` exports the theme contract. The `nse/themes/atmo` and `nse/themes/metro` entries each select complete styles. Their corresponding `/styles.css` entries contain the same complete dependencies, not just a partial paint sheet. `nse/styles.css` remains neutral. The SDK also ships the validated original `themes/Atmo.scostheme` and `themes/Metro.scostheme` packages and their notices.

Host selection and Appearance are separate. Atmo requests layered bottom peer chrome and ornamented login; Metro requests a scrolling in-flow top peer strip and plain login. App-owned custom backgrounds remain authoritative. Explicit application navigation intent overrides defaults, while semantics, retained destination content and accessibility stay with the framework.

## Metro language and motion

Metro prioritises generous lightweight headings, unboxed Pivot labels, square fields/buttons, outlined rectangular switches, content-led lists and flat opaque planes. It does not emulate Fluent acrylic, rounded desktop cards, or hidden-only navigation. A Pivot is not a Panorama; the framework does not turn arbitrary apps into horizontally scrolling hubs.

Control press feedback uses restrained compression and short transitions. The easing `cubic-bezier(.1,.9,.2,1)` and 167ms pointer-down / 0.975 press scale have a primary WinJS precedent in [the pinned WinJS Animations source](https://github.com/winjs/winjs/blob/6843afad6f4cf046deae208708814d2e65713a5d/src/js/WinJS/Animations.js). The chosen 300ms peer slide and 180ms overlay timing are deliberate SynCloudOS adaptations, not historical measurements. The framework handles retained outgoing/incoming destinations and modal lifetimes; CSS never runs a competing alert or Pivot timeline. Reduced motion becomes immediate, and focus remains distinct from selection.

Custom-property isolation has an explicit authoring boundary: the inventory resets foreign-only names. If themes share a CSS variable name, each must declare a root default rather than only a conditional override. CSS `@scope` limits selectors, not inheritance of custom properties.

Metro includes the unmodified Microsoft Selawik 1.01 open font in Light (300), Regular (400), and Semibold (600), under the included SIL OFL 1.1. This is a cross-platform fallback inspired by Segoe UI metrics, not a redistribution of proprietary Segoe UI or a claim of identical typography. `Fonts.json` is the source declaration; the checked-in `Resources/fonts.css` supplies the same scoped registrations for direct stylesheet and installed SDK consumers. Host font roles remain authoritative. Provenance and the original licence ship inside the package.

### Scope-root paint and typography

Inside a bounded `@scope`, anchor package boundary declarations to `:scope[data-nse-theme="your.package.id"]`. Repeating a bare boundary selector inside the scope does not reliably select the outer scope root: it can leave the outer provider without font and colour tokens while only nested boundaries receive them. Use the explicit scope anchor for descendant control rules too. Verify actual computed styles at the outermost provider in a real browser; CSS parsing and jsdom checks alone do not establish that package paint renders.
