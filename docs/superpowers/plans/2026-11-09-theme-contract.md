# Theme contract, `.scostheme` bundles and layout guides: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Commit after every task.

**Goal:** A third-party developer can write a `.scostheme` that makes SynCloudOS look as different from Atmo as Metro does, app controls and system UI included. Content never hides behind chrome, wherever the theme puts it. Atmo is rebuilt on the same public contract with no visible change.

**Architecture:**
- **Five phases, in order:**
  - **0:** visual baseline;
  - **1:** layout guides;
  - **2:** the control drawing contract (hooks, colours, system UI surfaces, the contract file);
  - **3:** `.scostheme` bundles, loading and selection;
  - **4:** Atmo rebuilt on the contract;
  - **5:** tooling and documentation.
- **Three CSS cascade layers:** framework structural CSS is `@layer nse.structure`, Atmo is `@layer nse.atmo` (always loaded, and the fallback) and the selected theme is `@layer nse.theme`. The build wraps each theme in `@scope` automatically.
- **Themes are data plus CSS.** They contain no code.

**Tech stack:** TypeScript 6, React 19, CSS cascade layers and `@scope`, Vite 7 plugin (`scripts/synware/vite-plugin.mjs`), css-tree, Vitest (jsdom), Playwright (`playwright.config.ts`, `tests/e2e`).

**Spec:** `docs/superpowers/specs/2026-11-09-theme-contract-design.md` (approved 9 November 2026). Read it in full before starting. This plan argues from it.

## Global Constraints

- **British spelling everywhere, including API names:** `Colour`, `colour`, `Grey`, `Localised`, `Licences`, `unemphasised`. Never "Color" in a name SynCloudOS defines.
- **AppKit fidelity:** where AppKit has the concept, use its name and shape (`NSEdgeInsets` becomes `NSEEdgeInsets`, `safeAreaInsets`, `contentInsets`, `bezelStyle`, `controlSize`, `isHighlighted`, `NSControl.StateValue`). "Theme" has no AppKit counterpart and uses SynCloudOS names.
- **A theme controls looks only:** no motion, no fonts or typography, no behaviour, no code (TS or JS files are rejected in a bundle).
- **Atmo is the fallback:** always loaded as `nse.atmo`. Parts a theme doesn't draw show Atmo.
- **Zero visible change to Atmo** on every surface in the Phase 0 baseline. Never update a baseline image to make a test pass. If a difference seems unavoidable, stop and report it.
- **No unrequested design changes.** No new visuals anywhere. Any visual decision goes in the final report as a question for the owner.
- **Beta 2 is the breaking-API cut line:** remove replaced APIs outright. **No shims, aliases or re-exports of old names.**
- **No Atmo vocabulary in public hook names.** Names come from AppKit or neutral structure.
- **Repository rules:**
  - no `Co-Authored-By` trailers;
  - never push;
  - never touch ports 5210 or 5387 (5173 may be used);
  - never read or modify `C:\Users\Kavish Krishnakumar\Developer\SynCloudOS-Fusion` or `SynCloudOS-Fusion-gemini`;
  - never use bare `git stash`;
  - don't edit the Syndromatic site repository (its apps are a later job).
- **Testing:**
  - run focused tests per task;
  - packed SDK tests (`tests/runtime/fx/*packed*`, `tests/packaging/**`, and anything that needs `npm run sdk:build`) run serially, after `npm run sdk:build`;
  - run the full suite only in Task 19, split as described there.

## Review Focus

1. **Nested themes:** a view given a different theme through `NSEAppearance` inside a window of another theme. Neither theme's paint or custom properties leak across the boundary, and Atmo fallback still applies inside the nested theme. Test it in Task 13.
2. **Chrome changing at run time:** a toolbar is toggled, the tab strip appears when an app gains a second destination, the window resizes across the compact/regular boundary, or a foldable changes posture. Insets update in the same frame, never in a resize-observer loop, and the content never jumps. Test it in Tasks 3 and 6.
3. **Right-to-left layouts:** safe-area insets stay physical (`left`/`right`, as AppKit's are), but a source list in RTL sits on the right and must inset the right edge. Test it in Task 6.
4. **Increased contrast and forced colours:** the focus indicator must remain visible even when a theme's CSS tries to remove it, and `data-nse-contrast="forced"` keeps working. Test it in Task 16 (the audit and validator) and Task 7 (structural CSS).
5. **A theme that draws only part of a control:** for example the bezel but not the highlighted state. The highlighted state falls back to Atmo's drawing of that part, and `validate_theme` lists `button.bezel[highlighted]` as undrawn. Test it in Tasks 13 and 17.

---

## Phase 0: Baseline

### Task 1: Visual baseline of everything Atmo paints

**Files:**
- Create: `tests/e2e/fixtures/theme-baseline/` (a catalogue host), `tests/e2e/theme-baseline.spec.ts`, `tests/e2e/theme-baseline.spec.ts-snapshots/` (committed images)
- Modify: `tests/e2e/vite.config.ts` only if the fixture needs a new entry

**What the catalogue renders:**
- **Every public NSE control** (`src/NSE/public/*.ts`) in every state (normal, hover, highlighted, on/off/mixed, selected, disabled, focused) and every `bezelStyle`, `controlSize` and `segmentStyle` it supports.
- **Window chrome** for `standard`, `metal` and `hud`, key and inactive, for each `toolbarStyle`.
- **Overlays:** menus, popovers, sheets and alerts.
- **System UI:** the login window (plain and ornamented, at its resting frame), notification banners and the notification centre, and the Webspring Board with an icon, a folder tile and the open folder presentation. Also the compact tab strip with "More", and the source list.
- **Framework apps:** About and Settings.

**What is captured:** light and dark in the `chromium` and `chromium-high-dpr` projects. Animations are frozen with the reduced-motion project, or by waiting for presentation to settle, never by sleeping.

- [ ] **Step 1:** Build the catalogue host and the spec. Use `expect(locator).toHaveScreenshot(name, { maxDiffPixels: 0 })`, one screenshot per surface and state.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/theme-baseline.spec.ts --project=chromium --project=chromium-high-dpr --update-snapshots` on the **unchanged** tree.
- [ ] **Step 3:** Run it again without `--update-snapshots`. Expected: every screenshot passes twice in a row, so the baseline is deterministic. Fix any flake now (fonts loaded, carets hidden, timers settled). A flaky baseline is worthless for this job.
- [ ] **Step 4:** Commit the spec, fixture and snapshots: `test(theme): record the Atmo visual baseline`.

This spec is the zero-change gate for every later task that touches rendering. Run it after Tasks 6, 8, 9, 10, 13, 14 and 15.

---

## Phase 1: Layout guides (spec Part 1)

### Task 2: Geometry types and the safe-area model

**Files:**
- Create: `src/NSE/Layout/NSEEdgeInsets.ts`, `src/NSE/Layout/safeAreaModel.ts`, `tests/runtime/nse-safe-area-model.test.ts`
- Modify: `src/NSE/Scroll/scrollTypes.ts` (delete `NSEScrollInsets`), its two users, `src/NSE/public/layout.ts`

**Interfaces:**
- **Produces:**
  - `interface NSEEdgeInsets { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number }` (AppKit's `NSEdgeInsets`, same field order), with `NSEEdgeInsetsZero` (frozen) and `function NSEEdgeInsetsMake(top: number, left: number, bottom: number, right: number): NSEEdgeInsets`.
  - `interface NSERect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }`, unless an equivalent public type exists; reuse that if so.
  - `function resolveSafeAreaInsets(input: { screen: NSEEdgeInsets; chrome: readonly NSEChromeObstruction[]; additional: NSEEdgeInsets; bounds: NSERect }): NSEEdgeInsets`
  - `interface NSEChromeObstruction { readonly edge: "top" | "left" | "bottom" | "right"; readonly thickness: number; readonly translucent: boolean }`
  - It converts `ScreenService`'s logical `safeAreaInsets` (blockStart and so on) to physical, given the writing direction.

- [ ] **Step 1: Failing tests:**
  - with no chrome, the screen insets pass through unchanged;
  - a 44-point top title bar plus a 20-point screen top inset gives `top: 64`;
  - a bottom overlay tab bar of 72 plus a 34-point home indicator gives `bottom: 106`;
  - additional insets add per edge;
  - negative or NaN thickness throws a `TypeError`;
  - an RTL logical `inlineStart: 10` maps to `right: 10`.
- [ ] **Step 2:** Run `npx vitest run tests/runtime/nse-safe-area-model.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Replace `NSEScrollInsets` with `NSEEdgeInsets` at both users. No alias.
- [ ] **Step 4:** Run it again. Expected: PASS. Then run `npm run typecheck`.
- [ ] **Step 5:** Commit: `NSE: NSEEdgeInsets and the safe-area model`.

### Task 3: `NSEWindow.contentLayoutRect` and `contentLayoutGuide`

**Files:**
- Modify: `src/NSE/Application/NSEWindowController.ts` (the `NSEWindow` interface, about line 51, and its implementation, about line 319), the window host that renders the title bar, toolbar, tab strip and content border (`src/Webspring/WindowLayer/WindowHost.tsx`, `src/Webspring/AppViewChrome.tsx`, `src/NSE/Navigation/NSETabBar.tsx`; find the exact owners with grep)
- Create: `src/NSE/Layout/NSELayoutGuide.ts`, `src/NSE/Layout/windowChromeObstructions.ts`, `tests/runtime/nse-window-content-layout.test.tsx`

**Interfaces:**
- **Produces:**
  - `NSEWindow.contentLayoutRect: NSERect` and `NSEWindow.contentLayoutGuide: NSELayoutGuide`
  - `interface NSELayoutGuide { readonly frame: NSERect; observe(listener: (frame: NSERect) => void): () => void }`
  - `function useNSEWindowChromeObstruction(edge, thickness, translucent): void`: each bar that obstructs content registers itself (title bar, toolbar, compact tab strip, bottom content border, source list).
  - On the window's content element, the custom properties `--nse-content-layout-inset-top`, `-left`, `-bottom` and `-right` (in px).
- **Consumes:** `resolveSafeAreaInsets` (Task 2) and `ScreenService` safe-area insets.

- [ ] **Step 1: Failing tests (jsdom, with sizes reported by stubbing the measurement hook):**
  - a window with a 44 title bar and a 38 toolbar reports `contentLayoutRect.y === 82`, with the height reduced to match;
  - hiding the toolbar updates the rect and notifies the `observe` listener **once**;
  - registering and unregistering an obstruction 100 times leaves no listeners behind;
  - the custom properties equal the rect's insets.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - Bars measure themselves with one shared `ResizeObserver` per window.
  - Measurements are batched to one update per animation frame, and a rect is only published when it changes, so there are no layout loops.
- [ ] **Step 4:** Run it. Expected: PASS. Run `npx vitest run tests/runtime/focus-scope.test.tsx tests/nse` to check for regressions.
- [ ] **Step 5:** Commit: `NSE: windows report contentLayoutRect and contentLayoutGuide`.

### Task 4: View safe area and `additionalSafeAreaInsets`

**Files:**
- Modify: `src/NSE/Views/NSEView.tsx`, `src/NSE/Application/NSEViewController.ts`
- Create: `src/NSE/Layout/useNSESafeArea.ts`, `tests/runtime/nse-view-safe-area.test.tsx`

**Interfaces:**
- **Produces:**
  - **On `NSEView`:** the props `additionalSafeAreaInsets?: NSEEdgeInsets` (on macOS this is an `NSView` property, not a view controller one) and `onSafeAreaInsetsChange?: (insets: NSEEdgeInsets) => void`.
  - **On the controller's view:** `NSEViewController.view.safeAreaInsets`, `safeAreaRect` and `additionalSafeAreaInsets`. `viewSafeAreaInsetsDidChange()` is called on the controller when they change.
  - **Hook:** `useNSESafeArea(): { safeAreaInsets: NSEEdgeInsets; safeAreaRect: NSERect }`.
  - **CSS:** each `NSEView` element carries `--nse-safe-area-inset-top`, `-left`, `-bottom` and `-right`.
- **Consumes:** `contentLayoutGuide` (Task 3).
- **Rule:** a view's insets are the part of the window's content-layout insets that overlaps the view, plus its own `additionalSafeAreaInsets` and its ancestors'.

- [ ] **Step 1: Failing tests:**
  - a view filling the window inherits the window's insets;
  - a view in the lower half of the window has `top: 0`;
  - `additionalSafeAreaInsets={{ top: 10, left: 0, bottom: 0, right: 0 }}` adds 10 to it and its descendants;
  - `viewSafeAreaInsetsDidChange` fires once per real change.
- [ ] **Steps 2–4:** run, implement, run. Expected: FAIL, then PASS.
- [ ] **Step 5:** Commit: `NSE: views expose safeAreaInsets, safeAreaRect and additionalSafeAreaInsets`.

### Task 5: `NSEScrollView` content insets

**Files:**
- Modify: `src/NSE/Scroll/NSEScrollView.tsx`, `src/NSE/Scroll/scrollTypes.ts`, every user of the removed `scrollInsets` prop
- Test: `tests/runtime/nse-scroll-content-insets.test.tsx`

**Interfaces:**
- **Produces:** `NSEScrollViewProps` gains:
  - `automaticallyAdjustsContentInsets?: boolean` (default `true`);
  - `contentInsets?: NSEEdgeInsets` (used when automatic is `false`);
  - `scrollerInsets?: NSEEdgeInsets`.

  The `scrollInsets` prop is removed.
- **Behaviour (AppKit's):** when automatic, the content insets equal the view's safe-area insets, so content scrolls under translucent chrome and rests clear of it. Scrollers are inset by the same amount plus `scrollerInsets`.

- [ ] **Step 1: Failing tests:**
  - with a 72-point translucent bottom bar, the scroll view's bottom content inset is 72 and the last row can be scrolled fully above the bar;
  - with `automaticallyAdjustsContentInsets={false}` and `contentInsets` of 0, there's no inset;
  - `scrollerInsets` offsets the scroller track.
- [ ] **Steps 2–4:** run, implement, run.
- [ ] **Step 5:** Commit: `NSE: NSEScrollView adjusts content insets automatically`.

### Task 6: Move framework layout onto the guides

**Files:**
- Modify:
  - every framework file that hard-codes a chrome offset. Find them with `grep -rnE "env\(safe-area-inset|calc\([^)]*(44|72|38)px|padding-(top|bottom): ?(44|72)px" src`, and check each hit;
  - the compact tab strip, which must register as an obstruction (overlay at the bottom for Atmo);
  - the source list, which registers on the leading edge, physical side per direction.
- Test: `tests/runtime/nse-layout-guide-adoption.test.tsx`, and the Task 1 spec.

- [ ] **Step 1: Failing tests:**
  - in a compact app with Atmo's bottom overlay strip, a scroll view's last item rests above the strip;
  - in RTL with a regular-width source list, the safe area insets the **right** edge;
  - toggling the strip (one destination, then two) updates insets in the same frame.
- [ ] **Steps 2–3:** run, then migrate each hard-coded offset to `--nse-safe-area-inset-*` or `contentLayoutRect`.
- [ ] **Step 4:** Run the tests. Expected: PASS. **Run the Task 1 spec. Expected: zero differences.**
- [ ] **Step 5:** Commit: `NSE: framework chrome and content use the layout guides`.

---

## Phase 2: The control drawing contract (spec Part 2)

### Task 7: The hook vocabulary, the helpers and structural CSS

**Files:**
- Create:
  - `src/NSE/Theme/contract/vocabulary.ts`: the part names, state attributes, variant attributes and control names, as frozen constant arrays (the source of truth);
  - `src/NSE/Theme/contract/hooks.ts`;
  - `src/NSE/Structure/` for framework structural CSS, starting empty;
  - `tests/runtime/nse-theme-hooks.test.tsx`.

**Interfaces:**
- **Produces:**
  - `type NSEThemeControlName` (the union of control names);
  - `type NSEThemePartName`;
  - `function nseControlHooks(input: { control: NSEThemeControlName; state?: NSEControlStateValue; highlighted?: boolean; enabled?: boolean; selected?: boolean; hovered?: boolean; focused?: boolean; variants?: Readonly<Record<string, string>> }): Record<\`data-nse-${string}\`, string>`
  - `function nsePartHooks(part: NSEThemePartName): { "data-nse-part": NSEThemePartName }`
  - These are exported publicly from `@syndromatic/syncloudos/nse/theme`, so developers' own Webspring views and custom controls can publish parts.
- **Attribute spelling (exact):**
  - `data-nse-control`, `data-nse-part`;
  - `data-nse-state` = `on` | `off` | `mixed`;
  - `data-nse-highlighted`, `data-nse-selected`, `data-nse-hovered`, `data-nse-focused` (present, empty value);
  - `data-nse-enabled="false"` (absent when enabled);
  - `data-nse-key-window="false"` on a non-key window root;
  - **variants:** `data-nse-bezel-style`, `data-nse-control-size`, `data-nse-segment-style`, `data-nse-box-type`, `data-nse-toolbar-style`, `data-nse-chrome` (`standard` | `metal` | `hud`);
  - the existing `data-nse-colour-scheme-resolved`, `data-nse-contrast` and `data-nse-transparency` stay as they are.
- **Part vocabulary (starting set; extend only with neutral names):** `bezel`, `title`, `image`, `track`, `fill`, `knob`, `indicator`, `separator`, `cell`, `header`, `content`, `border`, `background`, `arrow`, `badge`, `label`, `accessory`, `shadow`, `scroller`, `thumb`.
- **Structural hard limits** (in `src/NSE/Structure/limits.css`, `@layer nse.structure`, `!important` where needed so a theme can't override them):
  - the focus indicator stays visible (a minimum outline or ring area);
  - minimum hit targets: 24×24 for `regular` and `large`, as each control size defines today, unchanged;
  - `display`, `visibility` and `content` on semantic parts are not theme-settable.

- [ ] **Step 1: Failing tests:**
  - `nseControlHooks({ control: "button", highlighted: true, enabled: false, variants: { "bezel-style": "push" } })` returns exactly `{ "data-nse-control": "button", "data-nse-highlighted": "", "data-nse-enabled": "false", "data-nse-bezel-style": "push" }`;
  - an unknown control or part name throws a `TypeError`;
  - there are no Atmo words in any vocabulary entry. Test this against the list `["atmo", "metal-centre", "grouped-toolbutton", "bottom-fade", "top-fade", "heritage", "onyx"]`.
- [ ] **Steps 2–4:** run, implement, run.
- [ ] **Step 5:** Commit: `NSE: the theme hook vocabulary and structural limits`.

### Task 8: Hooks on every control, window and overlay

**Files:**
- Modify: every component behind a public NSE export, starting with those that lack `data-nse-control` today: `NSEButton` (push, toolbar, image, switch, check and radio types), `NSESwitch`, `NSEPopUpButton`, `NSESegmentedControl`, `NSESlider`, `NSETextField`, `NSESearchField`, `NSEBox`, `NSEMenu` and menu items, `NSEToolbar` and items, `NSEPathControl`, `NSEImageView`, `NSEDatePicker`, `NSEStackView`, `NSESplitView`, `NSEDrawer`, `NSEGridView`, popovers, sheets, alerts and the window frame and title bar. Rename existing `data-nse-control` values to AppKit kebab names where they differ (for example `circular-slider` becomes `slider` with `data-nse-slider-type="circular"`).
- Create: `tests/runtime/nse-theme-hook-coverage.test.tsx`

**Rules:**
- Every rendered drawable element carries a `data-nse-part` from the vocabulary.
- Existing ad hoc part names on `dev` (159) are mapped onto the vocabulary or added to it under neutral names. Record the mapping in the contract file's `renamedFrom` for the report only; there is no runtime alias.
- Private classes may remain for structural CSS.

- [ ] **Step 1: Failing test:** render each public control in each state from the Task 1 catalogue (jsdom) and assert:
  - its root has `data-nse-control`;
  - every element with a non-empty box has a `data-nse-part`, or is inside one;
  - the state attributes match the props.
- [ ] **Steps 2–3:** run, then add the hooks control by control, committing in groups (buttons, value controls, text, containers, menus and toolbars, windows and overlays).
- [ ] **Step 4:** The coverage test passes, `npm run typecheck` passes, and **the Task 1 spec shows zero differences.**
- [ ] **Step 5:** Commit each group: `NSE: publish theme hooks on <group>`.

### Task 9: System UI surfaces publish hooks

**Files:**
- Modify:
  - `src/SynCloudOS/RootRuntime/LoginGatePresenter.tsx` and its login window components;
  - `src/Webspring/NotificationCentrePresenter.tsx` and the banner components;
  - the system alert presenter (`src/SynCloudOSReact/SCOSAlertPresenter.tsx`, `src/NSE/Components/NSESystemDialogs.tsx`);
  - `src/Webspring/Contents/Views/WebspringBoardView/`, `src/Webspring/WebspringFolderTile*`, `src/Webspring/WebspringFolderSplitPresentation*`, `src/Webspring/WebspringIconArtwork*`, `src/Webspring/AppViewChrome.tsx` and `src/Webspring/WebspringQuickSwitchView.tsx`;
  - the system menu bar and the status layer (`src/Webspring/SystemUILayer.tsx`, `src/Webspring/WebspringStatusLayer.tsx`).
- Test: extend `tests/runtime/nse-theme-hook-coverage.test.tsx`.

**Control names (SynCloudOS's own):** `login-window`, `notification-banner`, `notification-centre`, `system-alert`, `board`, `app-icon`, `folder-tile`, `folder-presentation`, `app-view-chrome`, `quick-switch`, `menu-bar`, `status-bar`. Add others only if Atmo paints a surface not covered by these.

**Framework-built effects stay code.** They're switched by the theme's `presentation` (Task 13):
- the ornamented metal login swing;
- the `sliced-3d` notification banners;
- material lighting (`NSEMaterialLighting`, `NSEMetalThumb`).

Their parts carry hooks like everything else.

- [ ] **Steps 1–4:** as in Task 8, ending with the coverage test, typecheck and **zero differences on the Task 1 spec**.
- [ ] **Step 5:** Commit: `SynCloudOS: system UI surfaces publish theme hooks`.

### Task 10: Semantic colours shaped like `NSColor`

**Files:**
- Create: `src/NSE/Theme/contract/colours.ts` (the frozen list, the source of truth), `tests/runtime/nse-semantic-colours.test.ts`
- Modify: `src/NSE/Appearance/nse-appearance.css` and every framework use of the ten `--nse-app-*` names (`grep -rn -- "--nse-app-" src scripts`)

**Names:** British spellings of AppKit's documented semantic and system colours, as camelCase keys. The CSS property is `--nse-colour-<kebab name without "Colour">`, for example `labelColour` → `--nse-colour-label` and `systemRed` → `--nse-colour-system-red`. The list:
- label, secondaryLabel, tertiaryLabel, quaternaryLabel;
- text, placeholderText, selectedText, textBackground, selectedTextBackground, unemphasisedSelectedText, unemphasisedSelectedTextBackground;
- keyboardFocusIndicator, link, separator, grid, headerText, findHighlight, highlight, shadow;
- selectedContentBackground, unemphasisedSelectedContentBackground, alternatingContentBackground (two values: `alternatingContentBackground1` and `alternatingContentBackground2`), selectedMenuItemText;
- controlAccent, control, controlBackground, controlText, disabledControlText, selectedControl, selectedControlText, alternateSelectedControlText;
- windowBackground, windowFrameText, underPageBackground;
- systemRed, systemOrange, systemYellow, systemGreen, systemMint, systemTeal, systemCyan, systemBlue, systemIndigo, systemPurple, systemPink, systemBrown, systemGrey.

**Mapping:** each of the ten old names maps to its nearest semantic name. Atmo's current values become Atmo's values for those names, and the remaining names get Atmo values derived from what Atmo already paints (no new colours). Any name with no existing Atmo equivalent goes in the final report as a question, with the value you chose shown.

- [ ] **Steps 1–4:**
  - the test asserts the list is exactly the above, all names are British, and every name has a light and dark Atmo value;
  - `grep -rn -- "--nse-app-" src scripts` returns nothing;
  - **zero differences on the Task 1 spec.**
- [ ] **Step 5:** Commit: `NSE: semantic colours shaped like NSColor`.

### Task 11: The generated contract file and the drift test

**Files:**
- Create: `scripts/synware/build-theme-contract.mjs`, `tests/runtime/nse-theme-contract-drift.test.tsx`
- Modify: `scripts/synware/sdk-package-manifest.mjs`, `scripts/developer-mcp/build-package.mjs`, `scripts/developer-mcp/themes.mjs`, so `tooling/nse-appearance-contract.json` is replaced by `tooling/nse-theme-contract.json` (no old file left)

**Contract file shape:**

```
{ themeContractVersion: 1,
  controls: { [name]: { parts: string[], states: string[], variants: { [attr]: string[] } } },
  colours: string[], navigation: {...}, presentation: {...}, limits: {...} }
```

It's generated from the Task 7 vocabulary, the Task 10 colours, and a render of the Task 1 catalogue.

- [ ] **Steps 1–4:** the drift test renders every control in jsdom and fails if any emitted control, part, state or variant is missing from the contract or listed but never emitted. Expected: PASS after generation.
- [ ] **Step 5:** Commit: `NSE: publish the theme contract and guard it against drift`.

---

## Phase 3: `.scostheme` bundles (spec Part 3)

### Task 12: `NSETheme`, the bundle schema and validation

**Files:**
- Create:
  - `src/NSE/Theme/NSETheme.ts` (the public type);
  - `scripts/synware/theme-bundles.mjs`: discovery and validation, ported from PR #1's `scripts/synware/theme-packages.mjs` on branch `origin/feature/theme-packages-metro` (read it with `git show`) **minus fonts and motion**;
  - fixtures under `tests/fixtures/themes/` (valid, plus one per rejection rule);
  - `tests/runtime/theme-bundles.test.ts`.
- Delete: `src/NSE/Appearance/NSEAppearanceDefinition.ts`, `appearanceSlotResolver.ts`, `defineNSEAppearance` and every recipe/slot use. Replace them with `NSETheme`. No alias.

**Interfaces:**
- **`NSETheme`:** `{ readonly bundleIdentifier: string; readonly displayName: string; readonly version: string; readonly colours: { light; dark; highContrastLight?; highContrastDark? }; readonly navigation: NSEThemeNavigation; readonly presentation: NSEThemePresentation; readonly images: Readonly<Record<string, NSEThemeImage>> }`, deeply frozen.
- **`NSEThemeNavigation`:** `{ compact: { placement: "block-start" | "block-end"; flow: "in-flow" | "overlay" }; regular: { placement: "source-list" | "block-start"; flow: "in-flow" | "overlay" } }`
- **`NSEThemePresentation`:** `{ login: "plain" | "ornamented"; notifications: "plain" | "sliced-3d"; materialLighting: "off" | "on" }`
- **`NSEThemeImage`:** `{ files: { "1x": string; "2x"?: string; "3x"?: string }; pointSize: { width: number; height: number }; template?: boolean }`
- **`Info.ts` keys:** `bundleIdentifier` (reverse-DNS), `displayName`, `version` (semver) and `themeContractVersion: 1`. It's parsed statically, never executed, using the same parser as app `Info.ts`. Identity doesn't appear in `Theme.json`.
- **Validation (each with a failing fixture):**
  - unknown keys;
  - colour names not in the contract;
  - a missing light or dark value;
  - placements not in the list;
  - TS or JS files;
  - path traversal, symlinks and case collisions;
  - unsafe SVG (scripts, `on*` handlers, external references);
  - image files missing, or `@2x`/`@3x` variants declared but absent;
  - `border-image` slice insets larger than the image;
  - CSS selectors that use private `.nse-*` classes or element selectors outside contract hooks;
  - PR #1's size limits.

- [ ] **Steps 1–4:** one test per rule (failing fixture rejected with a message naming the file and the rule; valid fixture accepted), then implement until they pass. Also assert `defineNSEAppearance` is no longer exported from any public entry.
- [ ] **Step 5:** Commit: `NSE: NSETheme and .scostheme bundle validation`.

### Task 13: Discovery, loading, layers and selection

**Files:**
- Modify:
  - `scripts/synware/vite-plugin.mjs`: discovery of `src/Themes/*.scostheme`, the `themesDirectory` option (`false` disables), and the virtual module `virtual:syncloudos/themes`;
  - `src/SynCloudOSReact/browserRuntime.tsx`: the option `appearance?: NSEAppearanceDefinition` is replaced by `theme?: NSETheme`, defaulting to Atmo;
  - `src/NSE/Appearance/NSEAppearance.ts`: `options.theme` becomes `NSETheme`;
  - the presenters that read presentation choices: login, notifications, material lighting, and the tab strip and source list (navigation placement);
  - `NSEImage.named`, which resolves through the active theme's `images`.
- Create: `tests/runtime/theme-loading.test.tsx`, `tests/e2e/theme-nesting.spec.ts`

**Rules:**
- `virtual:syncloudos/themes` exports `themes: Readonly<Record<string, NSETheme>>`, keyed by bundle identifier.
- **Stylesheets:**
  - a theme's CSS is emitted only if the host's `theme` names it, or code references it through `themes["…"]`;
  - the build wraps each theme stylesheet as `@layer nse.theme { @scope ([data-nse-theme="<id>"]) to ([data-nse-theme]:not([data-nse-theme="<id>"])) { … } }`;
  - authors write plain selectors;
  - Atmo is always emitted in `@layer nse.atmo`, and the layer order is declared once: `@layer nse.structure, nse.atmo, nse.theme;`.
- **The theme boundary element:** it carries `data-nse-theme="<bundleIdentifier>"` and the theme's colour custom properties. It also resets every contract colour property, so nested themes don't inherit their outer theme's values (Review Focus 1).
- **All four navigation placements and both flows are built,** and each registers its chrome obstruction (Task 3).

- [ ] **Step 1: Failing tests:**
  - the host theme selects by identifier;
  - an unreferenced theme's CSS isn't in the build output;
  - a nested view with another theme shows that theme's colours, and the outer colours don't leak in;
  - a theme drawing only `button` `bezel` (not `[data-nse-highlighted]`) shows Atmo's highlighted bezel (Review Focus 5);
  - in Playwright, each of the four placements renders, and the content stays clear of it (`theme-nesting.spec.ts`, plus a placement fixture).
- [ ] **Steps 2–4:** implement, pass, then **zero differences on the Task 1 spec**.
- [ ] **Step 5:** Commit: `NSE: theme discovery, scoped loading and selection`.

---

## Phase 4: Atmo rebuilt (spec Part 4)

### Task 14: `Atmo.scostheme`

**Files:**
- Create: `src/Themes/Atmo.scostheme/Contents/{Info.ts, Theme.json, Resources/…, Licences/…}`
- Move:
  - paint from `src/NSE/Themes/Atmo/Resources/atmo.css`, `atmo-structure.css`, `chrome.css`, `window-titlebar.css` and `path-control.css`, plus the artwork, into the bundle;
  - **structure** (layout, box model, slots) into `src/NSE/Structure/*.css` in `@layer nse.structure`. Decide line by line: if it decides where something is or how big it is for behaviour, it's structure; if it decides how it looks, it's paint. Metrics such as padding, heights and radii are paint (spec call 7).
- Convert: `namedImages.ts` and `workspaceArtwork.ts` become `Theme.json` `images`. `motion.ts` (`atmoMotion`) moves to framework defaults in `NSEAnimationContext`, with identical values, and leaves the theme.
- Delete: the old `src/NSE/Themes/Atmo/` TypeScript and CSS once moved. The `@syndromatic/syncloudos/nse/themes/atmo` entry selects the bundle's `NSETheme`.

**Rules:**
- Every Atmo selector targets contract hooks and appearance attributes only.
- Colours come from `Theme.json`, or stay as literals inside Atmo's own CSS, which is allowed in a theme.
- Atmo's `Theme.json` uses `navigation: { compact: { placement: "block-end", flow: "overlay" }, regular: { placement: "source-list", flow: "in-flow" } }` and `presentation: { login: "ornamented", notifications: "sliced-3d", materialLighting: "on" }`. Verify these match today's behaviour, and correct them if not.

- [ ] **Step 1:** Port in slices (buttons, then value controls, text, containers, menus and toolbars, windows, overlays, system UI). After each slice, **the Task 1 spec must show zero differences** before the next.
- [ ] **Step 2:** `node scripts/synware/theme-bundles.mjs --validate src/Themes/Atmo.scostheme` (or the equivalent API in a test) reports **zero errors**.
- [ ] **Step 3:** `grep -rnE "\.nse-[a-z]" src/Themes/Atmo.scostheme` returns nothing.
- [ ] **Step 4:** Commit each slice: `Atmo: draw <slice> through the theme contract`.

### Task 15: Webspring and framework apps use only public hooks

**Files:**
- Modify: `src/Webspring/*.css` (WebspringHost.css has 10 private selectors, WebspringWidgetShelf.css 1, privacySecurityPane.css 2), the framework apps' CSS (About, Settings and the rest), and any framework CSS outside `src/NSE/Structure` and themes that targets `.nse-*` internals of controls it doesn't own.

**Rule:** Webspring and framework apps count as framework. They may use contract hooks and their own private classes, but not another component's private `.nse-*` internals. Colours come only from `--nse-colour-*`.

- [ ] **Steps 1–3:** migrate, then **zero differences on the Task 1 spec**.
- [ ] **Step 4:** Commit: `Webspring: style through public theme hooks`.

---

## Phase 5: Tooling and documentation (spec Part 5)

### Task 16: Idiom audit rules for themes and apps

**Files:**
- Modify: `scripts/synware/idiom-errors.mjs`, `scripts/synware/idiom-warnings.mjs`, `scripts/synware/idiom-audit.mjs`, `docs/framework/developer-mcp/idiom-rules.md`
- Test: `tests/runtime/idiom-errors.test.ts`, `tests/runtime/idiom-warnings.test.ts`, `tests/runtime/idiom-audit.test.ts`

**Rules:**
- **Stylesheets inside a `*.scostheme`:** contract hooks are allowed; private `.nse-*` classes are an error (`idiom.theme-private-class`); colour literals are allowed; hard-limit violations are an error (`idiom.theme-limit`), for example `outline: none` on a focused part with no replacement indicator, or `display: none` on a semantic part.
- **App and host stylesheets:** contract hooks and private `.nse-*` classes are both errors (`idiom.control-internals`, extended). Colour literals stay an error.
- **New warning `idiom.layout-guide`:** in app content (not theme or framework), raw `env(safe-area-inset-*)`, or a fixed `top`, `bottom` or `padding` equal to a known bar height next to `position: fixed` or `sticky`, gets a warning that tells the developer to use `--nse-safe-area-inset-*`, `useNSESafeArea` or `NSEScrollView`'s automatic insets.
- **Regression gate:** Atmo's bundle produces **zero** errors.

- [ ] **Steps 1–5:** a failing and a passing fixture per rule, plus a test that runs the audit over `src/Themes/Atmo.scostheme` and expects zero errors. Commit: `MCP: theme-aware idiom rules and the layout-guide warning`.

### Task 17: `validate_theme` and `scaffold_theme` on bundles

**Files:**
- Modify: `scripts/developer-mcp/themes.mjs`, `scripts/developer-mcp/tools.mjs`, `scripts/developer-mcp/server.mjs`, `tests/runtime/developer-mcp-theme.test.ts`, `scripts/synware/check-developer-mcp-consumer.mjs`

**Behaviour:**
- **`validate_theme { path }`:** validates a `.scostheme` with the Task 12 rules against the installed `tooling/nse-theme-contract.json`. It returns `errors` (rule violations, hard limits), `warnings` (undrawn parts, listed as `control.part[state]`) and `coverage` (drawn and total counts).
- **`scaffold_theme { bundleIdentifier, displayName, directory }`:**
  - creates a complete bundle;
  - every colour is stubbed in light and dark with Atmo's values, clearly marked for replacement;
  - `theme.css` holds a commented, empty rule for every control part in the contract, grouped by control;
  - `navigation` and `presentation` are given Atmo's choices;
  - it never overwrites existing files.
- **Consumer check:** the packed MCP consumer scaffolds a theme, validates it (zero errors, warnings allowed), and validates the SDK's own `themes/Atmo.scostheme` with zero errors and zero undrawn parts.

- [ ] **Steps 1–5:** tests first, then implement and pass. Run `npm run sdk:build`, then run the packed consumer serially. Commit: `MCP: validate and scaffold .scostheme bundles`.

### Task 18: Documentation

**Files:**
- Create: `docs/framework/themes.md` (theme authoring) and `docs/framework/theme-contract.md` (generated by `build-theme-contract.mjs`: every control's parts, states and variants, and every colour)
- Modify: `docs/framework/appearance.md`, `docs/framework/developer-mcp.md`, the layout documentation (add a section on layout guides), and a `docs/framework/beta-2-breaking-changes.md` entry listing every removal in this plan

**Content:**
- `themes.md` covers:
  - what a theme is, and isn't (no motion, fonts or code);
  - the bundle layout;
  - drawing parts with CSS, SVG and sliced raster (`border-image` and `image-set()` examples, a left-cap, repeating-middle and right-cap example);
  - `Theme.json`;
  - the Atmo fallback;
  - nesting;
  - validating and scaffolding.
- **Examples use only the contract.**

- [ ] Commit: `Docs: theme authoring, the contract reference and layout guides`.

### Task 19: Final verification and report

- [ ] **Step 1:** `npm run typecheck`. Expected: clean.
- [ ] **Step 2:** `npx vitest run --exclude "tests/packaging/**" --exclude "**/*packed*"`. Expected: all pass.
- [ ] **Step 3:** `npm run sdk:build`, then run `npx vitest run --no-file-parallelism --maxWorkers=1 tests/packaging tests/runtime/fx/*packed*` and every other packed acceptance script (`scripts/synware/check-*-consumer.mjs`). Expected: all pass.
- [ ] **Step 4:** `npx playwright test tests/e2e/theme-baseline.spec.ts tests/e2e/theme-nesting.spec.ts --project=chromium --project=chromium-high-dpr --project=chromium-reduced-motion`. Expected: zero differences, all pass.
- [ ] **Step 5:** Write `docs/superpowers/evidence/2026-11-09-theme-contract/REPORT.md`. It covers:
  - what was built, task by task, with commit SHAs;
  - every public API added or removed;
  - the part-name mapping from the old ad hoc names;
  - colour names given values without an Atmo precedent, with the values chosen;
  - any visual decision you had to make (should be none) and anything you could not achieve without a visible change (stopped, not changed);
  - test results with counts.
- [ ] **Step 6:** Commit: `Docs: theme contract delivery report`. Do not push.

---

## Self-review notes

- **Spec coverage:**
  - Part 1 is Tasks 2–6.
  - Part 2 is Tasks 7–11 (system UI surfaces in Task 9).
  - Part 3 is Tasks 12–13.
  - Part 4 is Tasks 14–15.
  - Part 5 is Tasks 16–18.
  - The breaking-changes list is in Task 18.
  - The out-of-scope items (Metro, iOS-style theme, motion API, `NSEColour`, `VFXPlayerView`, site apps) have no tasks, deliberately.
- **Correction to the spec:** `additionalSafeAreaInsets` is an `NSView` property on macOS (it's `UIViewController` only on iOS), so it goes on `NSEView`, not `NSEViewController` (Task 4).
- **Order:** execute Tasks 1–19 in order.
