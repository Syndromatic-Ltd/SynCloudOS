# Themes and Appearance

A **Theme** is a complete visual language. **Appearance** is the requested `auto`, `light`, or `dark` mode within that theme; resolved appearance is always `light` or `dark`. `SCOS.appearance` remains the preference service. Component recipes are static semantic slot mappings, not executable renderers.

## Beta migration: choose a host theme explicitly

**Breaking change:** an omitted `theme` in generic `mountSynCloudOS` now selects the neutral framework presentation. It no longer silently imports or selects Atmo. A product host that wants the familiar presentation must select the peer package explicitly:

```tsx
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import "@syndromatic/syncloudos/browser/styles.css";
import { atmoTheme } from "@syndromatic/syncloudos/nse/themes/atmo";

await mountSynCloudOS({ element, composition, theme: atmoTheme });
```

The TextSystem example's trusted host bootstrap makes this choice and accepts an optional replacement theme. This is an example default, not a hidden default in the generic framework. A Metro-only host imports `metroTheme` from `@syndromatic/syncloudos/nse/themes/metro` instead. Importing a first-party theme entry includes that peer's stylesheet; core NSE styles do not import either peer. App-owned custom content, artwork and background choices are not forcibly rewritten.

A host may select a discovered static package by its registered identifier. Unknown identifiers and duplicate catalogue entries fail rather than falling back to a different theme. Runtime and app theme identity is read-only; theme selection is a trusted host operation.

## Standalone components

```tsx
import { NSEThemeProvider } from "@syndromatic/syncloudos/nse/theme";
import { metroTheme } from "@syndromatic/syncloudos/nse/themes/metro";

<NSEThemeProvider theme={metroTheme} appearance="auto">
  <Application />
</NSEThemeProvider>
```

`auto` follows the host appearance service when provided, or a browser colour-scheme subscription for a standalone root; server rendering uses a deterministic light fallback. Nested providers inherit the surrounding appearance unless explicitly overridden.

Use `useNSETheme()` for the visual language and `useNSEAppearance()` for `{ requested, resolved }`. `useNSEVisualEnvironment()` is the composite framework-facing hook. The old theme-shaped `NSEAppearanceDefinition`, `defineNSEAppearance`, `NSEAppearanceProvider`, `atmoAppearance`, and mount `appearance` option have been replaced by their Theme equivalents. Old colour-scheme aliases are removed. Existing CSS `data-mode` compatibility is internal; semantic boundaries expose `data-nse-theme` and `data-nse-appearance`.

## Static .scostheme packages

Packages contain `Contents/Info.ts`, `Theme.json`, `styles.css`, optional `Fonts.json`, and bounded package-local resources/licences. `Info.ts` is parsed as static metadata, not executed. Theme definitions are validated immutable data: no callbacks, functions, getters, renderer plugins, cycles or exotic objects. Unknown contract fields are rejected. JSON paint tokens allow scalar colours, dimensions, variables, gradients and bounded colour/math functions, not quoted strings, escapes, comments, resource functions or executable paint hooks. Put assets and font families in validated package CSS/Fonts.json instead.

The Vite theme discovery option is `themesDirectory` (default `src/Themes`, or a path/`false`). Discovered packages populate `composition.themes`. CSS imports and resources must stay package-local; remote/traversal/escaped resource bypasses, symlinks and executable SVG are rejected. Packages cannot register executable application UI.

A recipe's semantic slot identifies component, part and state. Slots no longer include a `1x`/`2x` density suffix. Raster scale remains possible through package-local CSS `image-set()` and media queries. It is not a semantic renderer identity.

## Scope and nested boundaries

Theme CSS is scoped to its own identifier and stops matching at foreign theme boundaries. The compiler inventories custom-property declarations reachable from the stylesheet entry, including generated theme font roles. A nested provider resets inherited foreign-only inventory keys. Theme font roles are separate from explicit host font choices; font-family names are package-scoped.

**Supported authoring constraint:** when two themes own the same custom-property name, the inner theme must declare its intended default at its root. A property declared by the inner theme only under a conditional selector can inherit the outer value before that condition matches. Selector scope does not itself stop custom-property inheritance. The implementation does not inject runtime cascade layers or claim arbitrary CSS isolation. Explicit root defaults preserve authored cascade-layer ordering and predictable peer composition.

## Navigation and motion

Themes select declarative peer arrangements: tab strips or source lists, placement, in-flow or overlay layout, labels/icons, and scroll or More overflow. Explicit application arrangements override theme defaults. A single stable keyed destination host retains mounted inputs, scroll positions and component state when layouts, theme or appearance change. Outgoing visual panels are inert and hidden from accessibility while animations finish.

Motion is a declarative theme policy, not an `if Metro` branch. Peer, shell, login and overlay intents select bounded effects/durations/easing through framework animation authority. Repeated navigation interrupts prior motion; reduced motion settles without movement. Control feedback remains CSS-driven within the package. Application-owned presentation motion remains application-owned.

Metro's choreography is informed by original Microsoft navigation and WinJS guidance, not modern Fluent materials. Adapted values are not claims of exact Windows Phone pivot timings. See the Metro package's design/provenance documentation and browser gallery for visual review.

## Validation gallery

The real framework gallery is `tests/e2e/fixtures/theme-gallery.html`. It exposes peer themes, appearances, phone width, reduced motion, RTL, live controls, retained navigation, window chrome, dialogs and a non-authenticating sign-in preview. Build with `node scripts/themes/build-gallery.mjs`; typecheck with `tsc -p tsconfig.theme-gallery.json`. Browser assertions live in `tests/e2e/theme-packages.spec.ts`. DOM tests do not replace rendered browser inspection.
