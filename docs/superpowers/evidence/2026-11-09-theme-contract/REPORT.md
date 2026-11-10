# Theme contract implementation report

Date: 9 November 2026. Work in progress; final Task 19 acceptance has not run.

## Authority and constraints

Worktree: `C:\Users\Kavish Krishnakumar\Developer\SynCloudOS-Workspace\.worktrees\webspring-folders\framework`.
Branch: `fix/blind-rewrite-friction`. Starting commit: `a1c3617015906b4c802bd7ef7f2183062581f3b8`.

The approved spec and plan were read in full. Tasks proceed in order, with a commit after each completed task. No subagents have been used. No pushes, bare stashes, Co-Authored-By trailers, prohibited repository access or access to ports 5210/5387 have occurred.

## Task-by-task delivery

### Task 1 — visual baseline

Completed on the unchanged framework at `a1c3617`. Framework source under `src/` and `scripts/` was unchanged throughout capture and verification.

- Catalogue: `tests/e2e/fixtures/theme-baseline/`.
- Spec: `tests/e2e/theme-baseline.spec.ts`.
- Corpus: **662 cases × light/dark × DPR 1/2 = 2,648 PNGs**.
- Every capture uses `maxDiffPixels: 0`; no masks or control-style overrides.
- Frozen corpus hashes: `baseline-sha256.json` in this evidence directory.
- Two consecutive full comparisons **without snapshot updates passed 80/80 partitions each**. Logs: `theme-baseline-final-1.log` and `theme-baseline-final-2.log`.
- Catalogue TypeScript check and `git diff --check` passed.
- The high-DPR and reduced-motion Playwright project filters include the new specs. Reduced motion uses the existing DPR 1 references.
- Task 1 commit: `af93e18a` — `test(theme): record the Atmo visual baseline`.

**The images are frozen from the Task 1 commit. They must not be updated during Tasks 2–19.**

### Task 2 — geometry types and safe-area model

Added `NSEEdgeInsets`, `NSEEdgeInsetsZero` and `NSEEdgeInsetsMake` to the public layout and NSE entries. Replaced `NSEScrollInsets` at its users, with no alias. The pure model adds physical screen, chrome and additional insets, rejects invalid obstruction thickness and converts ScreenService logical edges for LTR/RTL. It reuses the existing public `NSEScrollRect` rather than introducing an equivalent rect type.

Verification: 17 focused tests passed (12 new safe-area cases plus scroll regressions); framework typecheck passed; obsolete type search and diff check clean. Logs: `task-2-red.log`, `task-2-green.log`, `task-2-typecheck.log`. Task 2 commit: `b3ae1018` — `NSE: NSEEdgeInsets and the safe-area model`.

### Task 3 — window content layout

Commit: `5bc55461` — `NSE: windows report contentLayoutRect and contentLayoutGuide`.

Added the stable `NSEWindow.contentLayoutGuide` and its `contentLayoutRect`. Physical windows and application stages own a geometry model; title bars, toolbars, titlebar accessory rows and content borders register their obstruction. Their measurements share one ResizeObserver per window, publications are batched to one animation frame, and unchanged rects do not notify. The actual content elements publish physical `--nse-content-layout-inset-*` properties. Detachment and disposal release registrations and subscriptions. Navigation strips and source lists are adopted in Task 6 as planned.

Verification: 6 current guide tests pass; the prescribed focused regression command passed 776 tests in 66 files (including the then-five guide tests). Framework typecheck passed. The frozen baseline comparison passed **80/80 partitions, zero differences**, recorded in `task-3-baseline-final.log`; all 2,648 reference hashes are unchanged. The first comparison was interrupted by editing a module while Vite was serving it: a notification-centre capture navigated back to the initial fixture, producing a 300px body instead of its 896px reference. Its failed trace is retained as `task-3-interrupted-trace.zip`. No baseline reference was changed.

### Task 4 — view safe areas

Commit: `90e6e9b6` — `NSE: views expose safeAreaInsets, safeAreaRect and additionalSafeAreaInsets`.

Added `NSEView.additionalSafeAreaInsets`, `onSafeAreaInsetsChange`, physical `--nse-safe-area-inset-*` properties and `useNSESafeArea`. Each view intersects the window guide with its measured bounds; ancestors' additional insets are accumulated separately so chrome is not counted twice. Controller views expose `safeAreaInsets`, `safeAreaRect`, writable `additionalSafeAreaInsets` and `viewSafeAreaInsetsDidChange()`. Measurements use the window's shared observer where available; standalone views use one observer. Controller layout callbacks share that measurement rather than adding another observer.

Verification: all 33 focused tests in four files passed, including five new safe-area cases and the controller/drawing regressions. Typecheck passed. The initial 80-partition screenshot check passed; the further full comparison after observer consolidation also passed **80/80, zero differences** (`task-4-baseline-final.log`). The prior regression assertion that a released FX layer leaves no inline style now checks that FX dimensions are removed and the view's four required safe-area properties remain. No drawing was changed.

### Task 5 — automatic scroll content insets

Commit: `d954aab4` — `NSE: NSEScrollView adjusts content insets automatically`.

`NSEScrollView` defaults `automaticallyAdjustsContentInsets` to true and derives its content padding from its measured safe area. With automatic adjustment disabled, it uses explicit `contentInsets`. `scrollerInsets` adds to the content insets when sizing and placing the scroller tracks. The scrolling controller reads live inset values, so revealing a row remains correct after chrome changes. Safe-area and scroll-content measurements share the observer rather than introducing another observer. The old `scrollInsets` prop was removed and its regression fixture migrated; no alias remains.

Verification: 47 focused tests in four files passed, including four new scroll-inset tests. Typecheck passed. Frozen screenshot comparison passed **80/80 partitions, zero differences**, recorded in `task-5-baseline.log`.

### Task 6 — framework layout-guide adoption

Commit: `656a84b6` — `NSE: framework chrome and content use the layout guides`.

Adaptive compact tabs, short-window rails and regular source lists register their measured obstructions. Leading-edge chrome resolves inside the model to a physical edge before publication, including RTL changes. Adaptive allocation shares the window observer. The compact clearance comes from the measured guide; NSEScrollView no longer receives a second pseudo-element spacer. Generic scrolling surfaces retain a guide-sized trailing spacer. App body surfaces measure their own safe-area overlap instead of consuming a top-bar height offset.

Raw CSS `env(safe-area-inset-*)` uses in framework surfaces now consume ScreenService-derived screen properties, published by runtime input and overlay boundaries (including standalone and relocated overlay hosts). Screen-only padding is separate from content safe-area padding, avoiding self-referential growth of a chrome bar.

Verification: 31 focused adoption/navigation tests passed, then 59 broader navigation, safe-area, focus and runtime-boundary tests passed. Typecheck passed. The first frozen screenshot comparison passed 80/80; the final comparison after standalone screen-property publication also passed **80/80, zero differences** (`task-6-baseline-final.log`). An initial broader regression found a non-cached screen getter in the new subscription; it was corrected to `ScreenService.getSnapshot` before acceptance.

### Task 7 — hook vocabulary and structural limits

Commit: `68c26ed7` — `NSE: the theme hook vocabulary and structural limits`.

Added frozen control, part, state and variant vocabularies, `nseControlHooks`, `nsePartHooks`, and their public `nse/theme` entry. The helper emits exact AppKit-shaped state attributes and rejects unknown identities, parts, states and variant names. Structural CSS protects the 24-point regular/large minimum and the forced-colour focus outline. Normal focus retains the existing shape-specific indicator; the bundle validator and state-scoped loading protect it in Tasks 12–16. Semantic display, visibility and content restrictions are validated on theme CSS, since their correct structural values vary by part.

Verification: 3 new hook tests passed; typecheck passed. The frozen screenshot gate passed **80/80, zero differences**, recorded in `task-7-baseline.log`.

### Task 8 — hooks on controls

Buttons commit: `a0002ec8` — `NSE: publish theme hooks on buttons`.

The buttons group publishes button/switch identity, neutral background/bezel/title/image/indicator/track/fill/knob parts, AppKit variants and actual enabled, highlighted, on/off/mixed, hover and keyboard-focus drawing state. Interaction observers only publish state; native activation and the existing press/drag owners remain in charge. Each button/switch exposes a separate descendant bezel element, so the contract’s `[data-nse-control] [data-nse-part="bezel"]` drawing pattern has a target. The coverage test renders every corresponding frozen catalogue case (319 buttons and 8 switches).

Verification: 360 focused tests passed, including the 327 catalogue cases and press, key-equivalent and scroll-control regressions; typecheck passed. The first screenshot comparison caught the initial structural minimum rule reducing existing larger minimum heights to 24. The bound now uses `max(24px, var(--nse-control-minimum-block-size))` and its inline equivalent. Atmo's existing minimum declarations publish the identical metric alongside their existing CSS. The failed actual/diff/trace are retained as `task-8-minimum-*`; no reference was changed. The follow-up found the same larger-minimum interaction in path cells; their existing 26-point/36-point metrics now publish through the bound too. A subsequent run had no pixel mismatches but one page failed to load a module with Chromium `ERR_NO_BUFFER_SPACE`; its trace is retained as `task-8-startup-buffer-trace.zip`. Final button comparison with two workers passed **80/80, zero differences**, recorded in `task-8-buttons-baseline-complete.log`. All 2,648 reference hashes remain unchanged.

Value-controls commit: `1e31a59d` — `NSE: publish theme hooks on value controls`.

The value-controls group adds state/variant hooks to linear and circular sliders, rounded/capsule/textured segmented controls, radio cells, steppers, level indicators and progress indicators. `circular-slider` becomes `slider` with `slider-type="circular"`; the linear `slider-field` wrapper becomes `slider` with `slider-type="linear"`. The native range is its `field` part. Radio-group structure uses AppKit's `matrix` identity; a segmented projection publishes `segmented-control`. No old identity alias remains.

The first value screenshot gate isolated the regular stepper's 22-point bezel being widened by the 24-point interaction minimum. The actual bezel now stays 22×34, with a surrounding 24×48 interaction area, symmetric negative margins preserving its original layout footprint, and separate increment/decrement dispatch from the enlarged regions. Both pointer regions are at least 24×24. Atmo paints the same clipped bezel and glyphs. The failed image/diff/trace are retained as `task-8-stepper-minimum-*`. Twelve focused visual comparisons passed, followed by the full **82/82** acceptance (80 frozen image partitions plus two non-image hit-target checks), with zero differences. The non-image checks add assertions only; the frozen corpus and fixture are unchanged. All **479 focused tests** in six files and typecheck passed. Logs: `task-8-values-*`, `task-8-stepper-baseline.log`, `task-8-stepper-hit-targets.log`.

Text commit: `510e80a6` — `NSE: publish theme hooks on text`.

The text group publishes identities, parts, hover/focus and editable/enabled metadata for text, search, secure, combo and token fields, text views/input hosts and rulers. The text session remains the canonical editing owner. `ruler` becomes `ruler-view`. British API corrections remove `textColor`, `labelColor`, `secondaryLabelColor` and `emphasized`; the replacements are `textColour`, `labelColour`, `secondaryLabelColour` and `emphasised`, with no aliases.

Verification: **568 focused tests across 8 files passed**, typecheck passed, and the full frozen screenshot comparison passed **82/82 with zero differences** (`task-8-text-baseline.log`). All 2,648 reference hashes were verified unchanged.

Containers commit: `87f48457` — `NSE: publish theme hooks on containers`.

The container group adds box, view, stack, grid, split, drawer, clip/scroll, image, data-view and page identities and parts, including selected and disabled rows. `scroll-view-frame` becomes `scroll-view`; its clip viewport retains `clip-view`. `NSEBox.fillColor`/`borderColor` and `NSEShadow.shadowColor` become `fillColour`/`borderColour` and `shadowColour`, with owning callers and documentation migrated and no aliases.

The first container screenshot gate found a composing colour-list clip part being overwritten by the new clip-view default. That removed the palette list's existing border in light mode (DPR 1/2). The clip now preserves the composing part. An explicit regression failed before the fix and passes afterwards. Failed images/traces are retained as `task-8-container-clip-*`; references were untouched. Four focused light/dark DPR comparisons passed. Final full acceptance passed **82/82, zero differences** (`task-8-containers-baseline-final.log`). The final focused run passed **754 tests in 19 files**; 39 additional stack/page/layout regressions and typecheck passed. All 2,648 frozen hashes are unchanged.

Menus/toolbars commit: `0ccbde2d` — `NSE: publish theme hooks on menus and toolbars`.

The menus/toolbars group publishes pop-up and pull-down identity (including native fallback), menu surfaces and menu items, toolbar surfaces/items/customisation palettes, path controls and tab views/navigation. Command state and the existing hovered/focused/pressed state remain authoritative. `toolbar-configuration-sheet` becomes `toolbar-customisation-palette`; the toolbar's `root` part becomes `background`. Existing neutral part names remain documented. Navigation tab views publish `style="navigation"`.

The first menu screenshot gate caught the generic tab-view scroll rule clipping the compact strip's existing shadow in light mode at both DPRs. The rule now owns only direct content tab lists and excludes navigation. Eight focused tab comparisons pass. The failed actual/diff/trace are retained as `task-8-tab-shadow-*`. No reference was changed. Final menu acceptance passed **82/82, zero differences** (`task-8-menus-baseline-final.log`); **711 focused tests across 9 files** and typecheck passed. All frozen hashes remain unchanged.

Windows/overlays commit: `64f146f5` — `NSE: publish theme hooks on windows and overlays`.

The date/panel/window group unifies the date, time and range renderers under `date-picker`, with `date-picker-mode`, `date-picker-elements` and `date-picker-style` variants. Drawing context adds no layout element. The calendar is the graphical date mode; the clock is a drawable part of the time mode. The old `time-picker`, `date-time-picker`, `date-range-picker`, `calendar` and `clock` control identities are removed. `route-picker` becomes `route-picker-view`; `file-panel` becomes `save-panel`. Generic `overlay` becomes the real menu, popover, tooltip or sheet identity, while `role="overlay"` identifies shared surface structure. No old identity aliases remain. The initial overloaded `picker-mode` hook was corrected during the additional Task 9 probes: AppKit’s `datePickerMode` (`single`/`range`) and `datePickerElements` are published separately; no `picker-mode` alias remains.

Panels, windows and overlays publish their real parts, window chrome/toolbar variants and inactive-window state. Colour/font/file panels retain their existing neutral parts. Composite button and overlay hosts now preserve the composing control's identity and named part; the existing interaction and accessibility owners remain in charge.

The first full image gate found the graphical time picker receiving a calendar-only layout rule after identity unification. The calendar selector now also requires date mode, with unchanged specificity. Eight focused clock comparisons pass; failed images/traces are retained as `task-8-clock-mode-*`. The expanded regression run passed **954 tests in 30 files** and typecheck passed. Final full visual acceptance passed **82/82, zero differences** (`task-8-panels-baseline-final.log`). All 2,648 reference hashes remain unchanged.

Public system-controls commit: `47893020` — `NSE: publish theme hooks on public system controls`.

The final public system-control group adds the existing badge surface (`badge`) and the sprite loading indicator (`progress-indicator`, spinning style and status role). Its normal/emphasised background-style variant distinguishes the existing contrasting artwork. The image, dimensions, filter and motion stay exactly as before. The focused run passed **800 tests across 14 files** and typecheck passed; full visual acceptance passed **82/82, zero differences** (`task-8-system-controls-baseline.log`). The frozen hashes remain unchanged. The system alert presenters are explicitly assigned to Task 9.

### Task 9 — system surfaces

Login, notifications, system alerts, About/preferences panels, Board icons, folder tiles/presentation, application-stage chrome, Quick Switch and the status-bar slot publish public identities and neutral parts. Existing native handlers, commands, focus scopes, capture geometry and framework effects retain ownership. The existing menu bar already publishes its hooks through Task 8.

Separate comparisons against unchanged `a1c3617` source cover Quick Switch, disclosed recovery alerts, stage/status-bar key state and combined/range date pickers. All **40 comparisons are byte-identical**, including two identical captures per side. The same fixture bytes run against both source trees. The first accepted comparison and the repeat after the AppKit date-property correction are retained under `additional-parity/`. These are additional source comparisons; the frozen Task 1 images were not added to or replaced.

The system catalogue's ten cases pass; targeted stage key-state, status-slot, Quick Switch selection and folder-rendering assertions also pass. Their added assertions were verified to fail against the previous implementations, then passed with the new hooks. **787 focused tests across 19 files**, framework typecheck and the additional fixture typecheck pass. The final frozen visual gate passed **82/82 with zero differences** (`task-9-baseline-final.log`), and all 2,648 frozen image hashes are unchanged. Login retains its existing ornamented presentation. The separate plain-login review image belongs to the later presentation-selection task.

### Task 10 — semantic colours

Commit: `1aae8d50` — `NSE: semantic colours shaped like NSColor`.

Published the 48 frozen British semantic/system colour names and their CSS-property mapping. Atmo supplies both palettes in colours.json for transfer to its bundle in Task 14. The ten old colour names map to their closest semantic names with their existing values preserved. Non-colour variables sharing the old prefix were also renamed; src/ and scripts/ contain no --nse-app-* uses. The exact mapping, every chosen value, source precedent and owner-review flag are retained in semantic-colour-decisions.json.

Verification: **131 focused tests across 10 files passed**, framework typecheck passed, and the frozen image gate passed **82/82 with zero differences** (task-10-baseline.log). All 2,648 reference hashes are unchanged. The focused run initially exposed three pre-guide top-bar expectations and one old-prefix documentation parser; the assertions now match the already-established guide contract and the renamed properties. No rendering fix or baseline change was needed.

### Task 11 — generated contract and drift gate

Commit: `3d2cb143` — `NSE: publish the theme contract and guard it against drift`.

Generated tooling/nse-theme-contract.json from all 662 frozen catalogue cases, ten additional specimens, and nine supplemental public-entry specimens. The inventory contains **71 controls, 362 control/part pairs and 48 colours**, with rendered states and variant values, appearance attributes, navigation, presentation, limits and migration metadata. Supplemental specimens cover radio matrices, swatches, virtual viewports, tooltips and configured/customising toolbars without changing any frozen catalogue bytes. Unused vocabulary entries are not claimed as rendered controls.

The SDK offline-data writer and reviewed package inventory publish only the new filename. The MCP contract reader recognises version 1; its old recipe-based provisioning implementation is scheduled for replacement by the bundle tooling in Task 17. No compatibility contract is emitted.

Verification: **687 focused tests across three files passed**, including 681 rendered specimens; framework and additional-fixture typechecks passed. A deliberate unrendered button part made the drift comparison fail, then the original JSON was restored and the clean comparison passed. A direct offline-data writer check confirmed byte-identical new contract output and absence of the old file. jsdom reports its known canvas-context limitation for colour panels; pixel rendering remains covered by the frozen browser gate. No rendering source changed in this task.

### Task 12 — NSETheme and bundle validation

Commit: `ec5bd191`.

Added the readonly NSETheme, NSEThemeNavigation, NSEThemePresentation and NSEThemeImage interfaces. Framework-created theme values own deeply frozen copies. Atmo is now selected by atmoTheme with bundle identifier com.syndromatic.atmo. Appearance selection carries theme; provider.theme and data-nse-theme replace the definition-valued provider prop and boundary identity. No old name is re-exported.

Removed the definition factory, definition/input/recipe types, slot resolver and projections, chrome-slot type and props, and window-recipe registry/props. Controls draw through their existing public parts and states. The window frame uses the AppKit-shaped hasShadow flag instead of an artwork recipe identifier. CSS selectors changed identity at equal specificity, with their declarations retained. The catalogue imports and providers were migrated to the new API; all frozen images remain untouched.

Ported only the static bundle discovery/validation from origin/feature/theme-packages-metro at f6866cf1753a929614dfc206f1615c4028c7c690, read with git show. Fonts and motion were excluded. Validation covers metadata, known colours and both palettes, navigation/presentation choices, local resources, symlinks/case collisions, executable content, safe SVG, missing image/resolution files, slice bounds, contract selectors, focus/semantic limits, import cycles, and the PR's file/bundle/count/depth limits. Saxes is now an explicit dependency for the ported SVG parser. Rejected bundles and portable limit/link/collision descriptors are committed under tests/fixtures/themes/.

Verification: **1,691 focused tests across 32 files passed**, including 33 bundle cases and the rendered contract drift gate. Framework and catalogue typechecks pass. Both the first and final frozen browser gates passed **82/82, zero differences** (task-12-baseline.log and task-12-baseline-final.log). All 2,648 image hashes are unchanged. The initial wider regression run exposed escaped old identity expectations, a recipe-valued shadow expectation and a naive comma splitter that misparsed nested selectors; these assertions now test the current identifiers, shadow part and CSS parser's real selector list.

The MCP recipe scaffolder and its old tests await their explicitly scheduled bundle-tooling replacement in Task 17; packed validation remains for Tasks 17 and 19. No compatibility implementation was introduced.

### Task 13 — discovery, loading, layers and selection

Commit: `b2d81a26`.

Implemented bundle discovery, `themesDirectory` (including `false`), the typed `virtual:syncloudos/themes` registry, build-time CSS selection, automatic theme scoping and layer declarations. Unreferenced themes do not emit CSS; static unknown identifiers fail the build and dynamic unknown lookup throws. A theme boundary resets every semantic colour. Browser host selection now takes `theme?: NSETheme`.

Named images resolve against the view's selected theme with Atmo fallback, point sizes, template tint and resolution variants. Login ornaments, notification slicing and reactive material lighting follow the theme's presentation data. All four navigation placements support both flows, measure their physical obstruction, and preserve content clearance in LTR and RTL.

The existing mixed control sheets are temporarily retained in the Atmo fallback layer to preserve their cascade while Task 14 separates structure, typography, motion and paint declaration by declaration. Scope-root alternatives preserve existing portal drawing; a popup has one theme boundary on its host, with appearance attributes on the inner surface and menu. Document defaults remain inherited from the document root, so they cannot overwrite theme spacing at each boundary. This task introduces no new drawing.

Verification: **807 focused tests across nine files passed**, including **691 rendered contract specimens**. Framework typecheck passed. The final standalone browser run passed **118/118 checks**: 82 baseline checks and 36 nesting, navigation and plain-login checks across DPR 1 and 2. Log: `task-13-browser-verified.log`. All **2,648 frozen PNG hashes are unchanged**. Earlier unaccepted cascade differences and corrected loader/type errors are retained in the task logs; no reference image was updated. The preceding run passed 117/118 with a fixture-startup timeout before its catalogue appeared, then the complete standalone rerun passed. No rendering source was edited during the accepted run.

Owner review: `plain-login-chromium.png` and `plain-login-chromium-high-dpr.png` show the existing login window with ornaments switched off. They are separate evidence, not parity baselines. No plain-login design was added.

### Task 14 — Atmo bundle (in progress)

The push-button slice is complete. Created the static `Atmo.scostheme` metadata, colour maps, image data and byte-preserved artwork. Ported **58 drawing rules / 189 selectors** for push, image, textured and disclosure buttons into two bundle stylesheets. Their selectors use public hooks. Typography, motion and interaction layout remain framework-owned; later slices continue the separation and connect the bundle as the built-in value.

The source-build CSS compiler scopes built-in drawings into `nse.atmo`; emitted SDK CSS retains its wrapper without requiring a host plugin. The bundle validator now accepts state predicates nested inside an anchored selector and rejects negative-only or unanchored universal alternatives.

Published the existing button configuration as `appearance-name`, `key-equivalent`, `has-destructive-action` and `image-position` variants. Cell tracking is a separate drawing state (`data-nse-tracking="true"/"false"`), and retained highlights publish the selected drawing flag. This preserves the existing distinction between a retained highlight, logical state and an active press. Native tab cells publish their existing appearance and bezel configuration; navigation cells publish their role and resolved control size. No interaction behaviour or artwork changed.

Verification: **55 focused tests in seven files**, **691 rendered contract specimens**, framework typecheck and bundle validation passed. The complete frozen baseline passed **82/82, zero differences**, in `task-14-buttons-browser-css-ready.log`. All **2,648 PNG hashes remain unchanged**. Earlier selector collisions were corrected; a paired original/current-style diagnostic found no non-transient differences across the catalogue after those corrections.

The earlier screenshot run passed 78/82 and exposed CSS background/mask artwork captured before decoding (metal header/glyphs and folder texture). The fixture now waits for CSS image decoding after selecting each interaction state, in addition to HTML images. The unchanged references then passed completely. Original expected/actual/diff PNGs and traces from that run are retained in `task-14-button-capture-failures`. This is a fixture readiness fix, not a baseline replacement or parity exception.

Remaining Task 14 slices: checkbox/radio, value, text, containers, menus/toolbars, windows, overlays and system UI; final built-in data connection, structure split and removal of the old theme directory.

### Tasks 15–19

Pending. Final split-suite and packed SDK acceptance remain for Task 19.

## Initial capture correction and retained evidence

The first full zero-update comparison passed 79/80 partitions. The dark DPR 2 folder presentation differed by 75 pixels. Three diagnostic captures produced the same actual PNG, SHA-256:

`be75b60569bfbf64479f270f92027c9b82f57067cfe342c16fefacfbc388d907`

The owner explicitly approved replacing **only that initial reference**, on unchanged `a1c3617`, as a capture correction rather than a parity exception. Original SHA-256:

`6c5bd4603eb1cc6996554beba72f60d24b132229d2f053efe54497c24e4c4e5e`

Retained unchanged: `task-1-folder-expected.png`, `task-1-folder-diff.png`, `task-1-folder-trace.zip`, `task-1-folder-repetitions.json`, and the stable `task-1-folder-actual.png`. The original blocker report is retained as `REPORT.task-1-blocker.md`.

Further diagnostic runs exposed folder-only capture interference and source-paint timing. The fixture now gives the folder a fresh document, decodes CSS artwork, waits for finite animations, and waits for measured SVG geometry before the presentation freezes a DOM copy. These are fixture-only waits. Twelve focused repetitions then passed, followed by the two complete 80/80 comparisons. **No additional reference images were replaced.** Intermediate diagnostic logs/evidence remain available alongside this report.

## Owner clarifications

- Baseline the existing ornamented login only. The later `presentation.login: "plain"` disables the existing ornament effect, adds no new design, and receives a separate review image under this evidence directory. It has no frozen parity reference.
- Journal is outside this job because its site repository is excluded. It was not accessed and is not in this catalogue.
- Continue autonomous implementation. Stop an affected slice only for an unavoidable visible difference or a genuine spec/plan contradiction affecting public API; commit passing work and continue independent tasks.

## Calls made by Codex

- The drawing contract publishes cell tracking separately from a retained highlight. Existing Atmo distinguishes the two; exposing the framework-owned tracking fact preserves both looks without allowing themes to control interaction.
- Public part selectors are bounded to their owning slots. In particular, a push button's title selector does not also target its nested pop-up caption or a checkbox's title.
- Screenshot readiness includes decoded CSS backgrounds, masks and border images after interaction. No reference image is changed by this wait.

- `NSEImage.named(name, theme?)` accepts an explicit theme for model-side lookup. Controls resolve symbolic named images from view context; there is no mutable global active theme.
- Dynamic indexing of the theme registry loads all discoverable candidates conservatively. Discovery scans host source, excluding test, documentation, script and generated-output directories.
- Short-window leading rails and book/fold region adaptations retain the framework's existing geometry; ordinary compact/regular windows honour the theme's placement and flow. These adaptations add no public placement.
- Portal descendants retain appearance attributes but share their host's theme boundary, allowing cross-part fallback drawing without crossing an unrelated theme boundary.

- Theme metrics remain in CSS, following the detailed schema and spec call 7; Theme.json has the four concrete data fields in Task 12.
- The retained contrast spelling is high, as the existing API and emitted attribute use; Task 11’s reference metadata was corrected from increased to high.
- Bundle identity is projected directly, so the old definition identity attribute and Atmo export are migrated now with the type removal. This avoids a temporary compatibility mapping.

1. The folder's capture gets a fresh document so prior catalogue surfaces cannot leave queued document work in the stage being copied. Its source CSS resources, finite animations and measured geometry settle before cloning. No framework rendering or artwork changed.
2. The reduced-motion project compares the DPR 1 references, avoiding a third set of initial images that Task 1 never requested.
3. Task 2 reuses the existing public `NSEScrollRect`, as the plan explicitly allows an equivalent existing rect type. The inset factory preserves finite signed geometry; safe-area resolution clips actual safe insets to view extents.

4. Screen safe-area strips are intersected with a physical window’s bounds; floating windows away from the screen edge do not inherit a notch or home-indicator inset.

5. Compact adaptive navigation is hidden with only one destination and appears when a second is added, as Task 6’s live-strip acceptance requires. Fixed segmented tab views retain their existing behaviour.
6. Framework chrome uses separate `--nse-screen-safe-area-inset-*` values when sizing its own device padding. Content uses `--nse-safe-area-inset-*`; feeding the latter back into a bar’s size would create a measurement loop.

7. The minimum interaction bound must preserve a theme’s larger minimum. `--nse-control-minimum-inline-size` and `--nse-control-minimum-block-size` supply those metrics; structural CSS clamps them to at least 24 points for regular/large controls rather than replacing a larger minimum with 24.

9. Date, time, combined and range editors are all NSDatePicker modes, so they share `date-picker`; AppKit’s mode, element and style attributes distinguish their drawing. Shared overlay CSS uses an overlay role rather than a fictitious AppKit control identity.

8. Painted bezel dimensions and interaction dimensions are distinct. The stepper uses `--nse-control-bezel-inline-size` and `--nse-control-bezel-block-size` for its existing art; framework-owned hit dimensions meet the minimum without moving that art or its neighbours. Passive progress/meter surfaces do not receive hit-target sizing.

## Public API accounting

Task 14's push-button slice adds `nseControlHooks`' optional `tracking` field and `data-nse-tracking` values, plus the `appearance-name`, `key-equivalent`, `has-destructive-action` and `image-position` variants. The generated contract records their actual emitted values. All existing logical button states and interaction properties retain their behaviour.

Task 13 adds `SynCloudOSViteOptions.themesDirectory`, `virtual:syncloudos/themes` with its readonly `themes` registry, `BrowserHostOptions.theme`, optional `NSEImage.named` theme selection and readonly resolution `files`. It removes the browser host's definition-valued `appearance` option. The generated contract now records login/notification presentation variants and every navigation placement/flow.

Task 12 adds NSETheme, NSEThemeNavigation, NSEThemePresentation, NSEThemeImage, atmoTheme, provider.theme, selection.theme and data-nse-theme. It removes atmoAppearance, provider.appearance, selection.appearance, data-nse-appearance, defineNSEAppearance, NSEAppearanceDefinition, NSEAppearanceDefinitionInput, NSEAppearanceRecipeDefinition, useNSEAppearanceSlot, resolveNSEAppearanceSlot, nseAppearanceSlot, projectNSEAppearanceSlot, NSEAppearanceSlotDescriptor, NSEAppearanceSlotProjection, NSEAppearanceSlotResolution, NSEChromeSlot, NSEChromePrimitiveProps.slot, NSEWindowAppearanceRecipeId, NSE_WINDOW_APPEARANCE_RECIPE_IDS, NSEWindowFrameProps.appearanceRecipe/shadowRecipe and NSEWindowTitleBarProps.appearanceRecipe. NSEWindowFrameProps.hasShadow replaces the recipe-valued shadow selection. There are no aliases.

Added: `NSEEdgeInsets`, `NSEEdgeInsetsZero`, `NSEEdgeInsetsMake`. Removed: `NSEScrollInsets` (no compatibility alias). Task 3 adds `NSELayoutGuide`, `NSEWindow.contentLayoutRect`, `NSEWindow.contentLayoutGuide` and `useNSEWindowChromeObstruction`.

Task 4 adds the `NSESafeArea` result type, `useNSESafeArea`, the two view props and three controller-view properties described above, and `NSEViewController.viewSafeAreaInsetsDidChange()`.

Task 5 adds `NSEScrollViewProps.automaticallyAdjustsContentInsets`, `contentInsets`, `scrollerInsets` and the scroller’s optional `style` prop; removes `NSEScrollViewProps.scrollInsets`.

Task 7 adds `NSEThemeControlName`, `NSEThemePartName`, `nseControlHooks`, `nsePartHooks` and the `@syndromatic/syncloudos/nse/theme` package entry.

Catalogue limitation: the About and Settings entries exercise `NSEAboutDialog` and `NSEPreferencesToast`, respectively, rather than complete routed application sessions. They prove parity for those surfaces only. No separate routed About/Settings app bundle was found in this framework; site applications are outside scope.

Part-name mappings, semantic colour values without Atmo precedent and Beta 2 removals will be recorded as their tasks are completed. No visual design decision has been made.

## Test accounting

| Check | Result |
| --- | --- |
| Final full baseline comparison 1, no updates | 80 passed, 0 failed |
| Final full baseline comparison 2, no updates | 80 passed, 0 failed |
| Focused settled-paint folder repetitions | 12 passed, 0 failed |
| Catalogue TypeScript check | Passed |
| `git diff --check` | Passed |
| Full framework Vitest suite | Not run; reserved for Task 19 |
| Packed SDK tests | Not run |

Historical capture/diagnostic failures are retained as evidence and are not counted as final acceptance passes.
