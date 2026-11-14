# Performance, Lifecycle and Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (the owner must be asked before any subagent is used). Steps use checkbox (`- [ ]`) syntax for tracking. Tick a box in the same commit that completes it, so the next worker can resume from `git log` and this file alone.

**Goal:** Make app launch, QuickSwitch and section changes fast again after the theme-contract migration, move heavy work off the main thread through DispatchFX, make the framework's implicit state machines explicit, fix the two reported lifecycle defects, give every internal `NSE*` name an AppKit counterpart, and restructure `src/` (the last only after the owner approves the proposed names).

**Architecture:** The public theme contract stays `data-nse-*` attributes; the build rewrites contract attribute selectors to private mirror classes and one runtime choke point writes those classes beside the attributes, so Chrome can index the rules. DispatchFX gains its already-designed worker pool (Tier 1) and the four hand-rolled worker protocols move onto it. One internal state-machine primitive in `src/SynCloudOS/Statechart/` replaces scattered phase strings and guard `if`s. Lifecycle callbacks all go through the class-aware `Lifecycle` operations.

**Tech Stack:** TypeScript 6, React 19, Vite 7, Vitest 4, Playwright 1.61 (Chromium, CDP tracing), css-tree, PostCSS.

**Spec:** The owner's brief of 11 November 2026 (reproduced under "Global Constraints" and each workstream's "Findings"). Supporting, already approved documents the executor must read for the workstream they touch:
- `docs/superpowers/specs/2026-11-09-theme-contract-design.md` (the public hook contract);
- `docs/superpowers/reviews/2026-11-08-dispatchfx-design.md` and `docs/superpowers/plans/2026-11-08-dispatchfx-plan.md` (Tier 1 pool, Tasks 7–10 and 12–15);
- `docs/framework/applications.md` (the lifecycle order Beta 2 promises).

**Worktrees:** framework `SynCloudOS-Workspace/.worktrees/webspring-folders/framework` (branch `fix/blind-rewrite-friction`, plan written at `90e7fbf9`); site `…/webspring-folders/site` (branch `prerelease`, vendoring `90e7fbf9` with a `dirty` receipt).

## Global Constraints

- Do not push. No `Co-Authored-By` trailers. One commit per slice (each `### Task` below is one slice unless it says otherwise).
- No shims or aliases. Public API maps to real AppKit; FX maps to Apple's Core frameworks. A renamed or removed name is removed everywhere in the same commit.
- No unrequested design changes. Anything visible that is not pixel-identical is a proposal to the owner, not a change.
- British spelling in names, comments and documents.
- Comments are short and developer-like, two sentences at most.
- The frozen theme baseline must pass **123/123 with `maxDiffPixels: 0`**: `npx playwright test theme-baseline --workers=1` (41 tests × `chromium`, `chromium-high-dpr`, `chromium-reduced-motion`). **Never** run with `--update-snapshots`; never edit `tests/e2e/theme-baseline.spec.ts-snapshots/` or `docs/superpowers/evidence/2026-11-09-theme-contract/baseline-sha256.json`.
- Ports: the site dev server is 5387 only (restarting it is fine). 5377 is for end-to-end tests; stop whatever you started there when done. Never touch 5210.
- Never commit `docs/superpowers/evidence/2026-11-08-dispatchfx/task-6-installed.json`. Stage files by explicit path; never `git add -A` (the worktree holds about 1,350 untracked evidence files from earlier jobs).
- Never use a bare `git stash`.
- Ask the owner before using subagents.
- On a rate-limit warning: commit what compiles, tick the boxes done, add a line under "Resume notes" at the end of this file, stop.

## Verification commands (used by every slice)

| Name | Command (run in the framework worktree) | Pass |
| --- | --- | --- |
| typecheck | `npm run typecheck` | exit 0 |
| focused | `npx vitest run <paths named by the task>` | all pass |
| full | `npx vitest run` | no failures (last recorded: 1,019 files, 9,819 tests) |
| packaging | `node --test tests/packaging/*.test.mjs` | 8/8 |
| boundaries | `npm run boundaries:architecture` | no violations |
| baseline | `npx playwright test theme-baseline --workers=1` | 123 passed |
| perf | `node scripts/perf/style-recalc.mjs --base http://127.0.0.1:5387` (Task 1) | prints the scenario table |

Every slice runs typecheck and its focused tests. Any slice that touches CSS, a rendered attribute, a class name or a component's DOM also runs baseline. The full suite, packaging and boundaries run at the end of each workstream and in Task 28.

## Measurements (the "before")

Recorded on 11 November 2026 by `scripts/perf/style-recalc.mjs` (Task 1) against the site dev server (5387, vendoring `90e7fbf9`), headless Chromium 1440×900, signed in with the local test account, median of 5 passes; the file is `docs/superpowers/evidence/2026-11-11-performance/baseline.json`. "Style" is the sum of `UpdateLayoutTree` trace events; "full recalc" forces every element to re-match (toggle an attribute on `<html>` that a `[attr] *` rule depends on, read a computed style; median of 9).

| Scenario | Elements | Style total | Largest single recalc | Longest task |
| --- | --- | --- | --- | --- |
| Cold load `/` (login board) | 208 | 77 ms | 15 ms | 206 ms |
| Launch About from the board | 319 | 168 ms in 200 recalcs | 28 ms | 71 ms |
| QuickSwitch open | 367 | 22 ms | 8 ms | 63 ms |
| QuickSwitch select | 319 | 21 ms | 3 ms | 51 ms |
| Return to Webspring | 177 | 48 ms | 17 ms | 95 ms |
| Cold load `/__syncloudos/nse-gallery` | 985 | 1,905 ms in 215 recalcs | 217 ms | 369 ms |
| Gallery section change → Tables & Trees | 1,223 | 446 ms | 71 ms | 648 ms |
| Gallery section change → Buttons | 1,223 | 436 ms | 147 ms | 549 ms |
| Gallery section change → Menus & Popups | 1,463 | 188 ms | 84 ms | 367 ms |
| Gallery hover sweep (82 pointer moves) | 982 | 266 ms | 8 ms | 107 ms (3,032 ms of script) |
| Gallery forced full recalc | 985 | **193 ms** | n/a | n/a |
| About forced full recalc | 319 | 21 ms | n/a | n/a |

These agree with the owner's figures for the same build (182 ms full recalc, 435 ms section change). The first numbers taken while planning read twice as high because a stray headless browser from an experiment was holding the CPU; they are not used.

**Design experiment (planning, not committed).** In the live gallery page, every `[data-nse-<name>]` and `[data-nse-<name>="<value>"]` selector in the served stylesheets (207,006 occurrences) was rewritten to a class selector and each element given matching classes (1,661 mirrored attributes). Under the same CPU contention, gallery forced full recalc fell from 400 ms to 84 ms (to 21%); mirroring only `control` and `part` reached 26%. This agrees with the owner's experiment (182 → about 45 ms) and fixes the design of Workstream A. The mirrored vocabulary covers 51,026 of the 51,076 hook selectors in the Atmo, structure and appearance sources; the other 50 use `menu-variant`, `theme-authority`, `nine-slice`, `overlay-kind` and `chrome-active`.

## Owner decisions needed

None of these block Workstreams A–E. Each has a default the executor follows until the owner says otherwise.

1. **Restructuring names (Workstream G).** Nothing is moved until the owner approves or edits the tables in Tasks 24–27. Default: do not start G.
2. **`framework:sync` and the dirty worktree.** The sync script refuses a dirty framework. The worktree is dirty for two reasons that are not this job's: `task-6-installed.json` is rewritten by `tests/runtime/fx/dispatch-packed.test.ts` on every run, and about 1,350 evidence files are untracked. Default (Task 28): the test writes its receipt under `.artifacts/` instead (root cause), the tracked file is left as it is in `HEAD`, and the sync runs from a clean detached checkout of `HEAD` (`git worktree add --detach <scratch>/fwsync HEAD`, then `npm run framework:sync -- <scratch>/fwsync`), which is how `fbb473a` was adopted. Alternative: the owner commits or ignores the evidence files.
3. **Internal names with no AppKit counterpart (Workstream F).** Task 22 lists the proposed family dispositions. Default: follow them.
4. **`closeApp` asks `applicationShouldTerminate` before closing windows (Task 10).** This is what `docs/framework/applications.md` promises and AppKit does, but an app that vetoes will now keep its windows. Default: implement as documented.
5. **Carried over from the theme-contract report, unchanged by this plan:** the 57 undrawn contract parts (the `developer-mcp` consumer check fails on them) and deleting the unreferenced `src/NSE/Themes/Atmo/` (40 files). Default: leave both.
6. **Shipped test support in `src/` (Task 27).** `src/SynCloudOS/AppSDK/testing` and `src/SynCloudOS/Testing` back the public `@syndromatic/syncloudos/sdk/testing` entry (XCTest's counterpart). Default: they are product code and stay; only test suites and test hosts leave `src`.

## Review Focus

Inputs and conditions the brief implies but no single task's happy path exercises. Each is pinned by a test in the task named.

1. **A hook attribute whose value cannot be a class token** (empty, or containing whitespace, such as `data-nse-key-equivalent=" "` or a carriage return). Expected: the selector stays an attribute selector and the element is still drawn. Test in Task 2 and Task 3.
2. **A hook written without React** (`element.dataset.nsePlacement = …`, 24 sites today) or by an app built without the SynWare Vite plugin. Expected: drawn correctly by the next frame, with no unstyled paint. Test in Task 4.
3. **A third-party `.scostheme` written entirely with attribute selectors.** Expected: it draws exactly as before; its author never sees or writes a mirror class. Test in Task 3 (through `scopeThemeCSS`) and the existing `theme-nesting` spec.
4. **An app whose `applicationDidFinishLaunching` is slow or throws.** Expected: the window is already open and interactive; the failure is reported and does not undo the launch. Test in Task 9.
5. **A quit vetoed by `applicationShouldTerminate`, and a quit during a launch still in flight.** Expected: the veto leaves the app active with its windows; the in-flight launch is cancelled and no `applicationWillTerminate` runs for an app that never finished launching. Test in Task 10.

---

# Workstream A: Theme system performance

## Findings

- **Cause, confirmed.** Chrome files each rule under one simple selector of its rightmost compound and keys attribute rules by attribute *name* only. Every contract element carries `data-nse-control` or `data-nse-part`, so every element is tested against every rule filed under those two names. Ancestor Bloom filters also hash attribute names, not values, so `[data-nse-control="x"] …` never rejects early. Attribute changes invalidate by name, so toggling `data-nse-selected` on one row invalidates every rule that mentions that attribute. Classes are keyed by value in all three places.
- **`selector-performance.mjs` (commits `1148f750`, `90e7fbf9`)** already moves indexable simple selectors to where Chrome looks. It cannot help while the only indexable thing is an attribute name.
- **Scale.** `Atmo.scostheme` is 12,676 lines and 4.6 MB of source CSS; the served sheets hold about 207,000 contract attribute selectors.
- **Where hooks are written.** About 700 JSX literals (`data-nse-part="…"`), the helpers in `src/NSE/Theme/contract/hooks.ts` (`nseControlHooks`, `nsePartHooks`, `nseStateHooks`), and 24 imperative writes (`dataset.nsePlacement`, `setAttribute("data-nse-…")`). There is no single place in component code, so the mirror must sit below it.
- **A MutationObserver alone is not enough.** React commits, then runs layout effects synchronously; an observer runs a microtask later, so `getBoundingClientRect()` in a layout effect would measure unstyled elements. The framework measures in layout effects (safe areas, FX geometry), and the baseline is zero-pixel.
- **Other theme issues found.**
  - `useNSEThemeInteraction` (`src/NSE/Theme/contract/useThemeInteraction.ts`) keeps `hovered`, `focused` and `highlighted` in three `useState`s, so moving the pointer across a toolbar re-renders every control it crosses.
  - The dev-server path was not verified to run `selectorPerformance()` on every stylesheet; Task 1 records it.
  - `scopeThemeCSS` emits each uncontrolled selector twice (`:scope X` and `:scope:is(X)`), which `optimiseSelectors` then splits again; the size cost is measured in Task 5, not assumed.

## The fix

**Mirror classes: private, generated, never authored.**

- **Token format.** For a mirrored attribute `data-nse-<name>` with value `<value>`: the presence token `nse:<name>` and, when the value is non-empty and has no whitespace, the value token `nse:<name>=<value>`. The colon cannot collide with any existing `nse-…` class. CSS spells them `.nse\:part` and `.nse\:part\=bezel`.
- **Which names are mirrored.** Exactly the contract vocabulary: `control`, `part`, every name in `nseThemeStates` and `nseThemeVariants` (`src/NSE/Theme/contract/vocabulary.ts`), plus the appearance attributes `theme`, `colour-scheme-resolved`, `contrast`, `transparency`. Attributes that carry data (`toolbar-item-id`, `calendar-date`, `responder-id` and the like) are not mirrored and their selectors are not rewritten.
- **Build side.** `selector-performance.mjs` rewrites `[data-nse-<name>]` → `.nse\:<name>` and `[data-nse-<name>="<value>"]` → `.nse\:<name>\=<value>` for mirrored names and token-safe values, everywhere `rewriteSelector` already runs (SDK build, the Vite plugin's PostCSS pass, `scopeThemeCSS`). A class and an attribute selector both weigh (0,1,0), so the existing "specificity changed → throw" guard still holds. Selectors with any other operator (`~=`, `^=`, `|=`, `*=`, `$=`), a case flag, an empty value or a whitespace value are left alone. `@scope` preludes are left alone.
- **Runtime side, synchronous path.** A wrapper around React's JSX runtime (`jsx`, `jsxs`, `jsxDEV`) adds the mirror tokens to `className` for host elements (`typeof type === "string"`) that carry a mirrored `data-nse-*` prop. The SynWare Vite plugin resolves `react/jsx-runtime` and `react/jsx-dev-runtime` to the wrapper for the whole project (framework, apps and third-party views alike); the published SDK keeps importing `react/jsx-runtime`, so installed consumers get it through the same plugin. Vitest gets the same alias.
- **Runtime side, reconciling path.** One document-level `MutationObserver` (attribute filter = the mirrored names, plus `childList` subtree) adds or removes tokens on any element whose classes disagree with its attributes. It covers imperative writes and apps built without the plugin. It is installed by the NSE runtime when the first NSE root mounts and is a no-op for elements the wrapper already handled.
- **Imperative framework writes** go through one helper, `setNSEHook(element, name, value | null)`, which writes the attribute and the tokens together, so framework code never depends on the observer's timing.
- **The public contract does not change.** Elements still carry every `data-nse-*` attribute; themes and tests still select on attributes; `docs/framework/theme-contract.md` gains one paragraph saying the classes exist, are private, and may change without notice. The idiom audit rejects `nse:` class selectors in theme, app and host CSS.

## Done

Measured with `scripts/perf/style-recalc.mjs` on the site dev server, median of 5 runs, before = the table above:

| Metric | Before | Target |
| --- | --- | --- |
| Gallery forced full recalc | 193 ms | **≤ 55 ms** after Task 4; **≤ 45 ms** after Task 5 |
| Gallery section change, style total (mean of the three sections) | 357 ms | **≤ 90 ms** (≤ 25%) |
| Gallery cold load, style total | 1,905 ms | **≤ 480 ms** (≤ 25%) |
| Launch About, style total | 168 ms | **≤ 60 ms** |
| Computed styles, 2,946 gallery element and pseudo-element styles, before vs after | n/a | **0 differences** |
| Frozen baseline | 123/123 | **123/123**, 0 pixels |

The ≤ 45 ms line is the owner's experiment figure. If Task 5 cannot reach it without regenerating Atmo's rules, stop, record the profile, and report: regenerating 12,000 rules is a separate job that needs the owner's go-ahead.

---

### Task 1: Performance harness and committed baselines

**Files:**
- Create: `scripts/perf/style-recalc.mjs`, `scripts/perf/computed-style-digest.mjs`
- Create: `docs/superpowers/evidence/2026-11-11-performance/baseline.json`, `…/README.md`

**Interfaces:**
- Produces: `node scripts/perf/style-recalc.mjs --base <url> [--runs 5] [--json <file>]` printing one JSON object per scenario: `{ label, elements, styleMs, styleCount, maxStyleMs, parseCssMs, layoutMs, longestTaskMs, tasksOver50, fullRecalcMs? }`. Scenarios, in order: `cold-load-board`, `launch-about`, `quickswitch-open`, `quickswitch-select`, `return-to-webspring`, `cold-load-gallery`, `gallery-section:Tables & Trees`, `gallery-section:Buttons`, `gallery-section:Menus & Popups`, `gallery-full-recalc`, `gallery-hover-sweep` (move the pointer across the visible toolbar and sidebar in 40 steps).
- Produces: `node scripts/perf/computed-style-digest.mjs --base <url> --out <file>` writing an FNV-1a hash per element and per `::before`/`::after` of every computed property, for the gallery route after each of the three section changes; `--compare <a> <b>` prints the count of differing entries and exits 1 when it is not 0.

- [x] **Step 1:** Write `style-recalc.mjs`. Playwright Chromium, viewport 1440×900, one browser context. Sign in with the page's own "Sign in locally …" button (a local test account on the owner's own dev server; no credentials are typed). Trace with CDP `Tracing.start`, categories `devtools.timeline`, `toplevel`, `blink.user_timing`; sum `UpdateLayoutTree`, `ParseAuthorStyleSheet`, `Layout`; longest task from `RunTask`. Forced full recalc: append `<style>[data-perf-probe] * { --perf-probe: 1 }</style>`, toggle `data-perf-probe` on `<html>`, time `getComputedStyle(document.body).color; document.body.offsetWidth`, median of 9. Reference implementations from planning are in the session scratchpad (`scenarios.mjs`, `mirror2.mjs`); they are not in the repository, so write these from this description.
- [x] **Step 2:** Write `computed-style-digest.mjs`. Return hashes, not strings: returning 2,946 full style strings over CDP takes minutes.
- [x] **Step 3:** Run both against 5387 at the current framework commit, five runs. Save `baseline.json` and the digest as `baseline-digest.json`. Record in `README.md`: machine, Chromium version, the commit, and whether the dev server's own (non-SDK) stylesheets pass through `selectorPerformance()` (inspect one served app stylesheet for an unsplit `:scope:is(` twin).
- [x] **Step 4:** Commit: `Perf: add the style-recalc harness and record baselines`.

### Task 2: Selector rewrite to mirror classes

**Files:**
- Create: `src/NSE/Theme/contract/hookMirror.mjs` and `hookMirror.d.mts` (shared by the build scripts and the browser, shipped beside the plugin as `bundleIdentifier.mjs` is)
- Modify: `scripts/synware/selector-performance.mjs`
- Modify: `scripts/synware/build-theme-contract.mjs` (emit the mirrored-name list into `tooling/nse-appearance-contract.json`)
- Test: `tests/runtime/selector-performance.test.ts`, `tests/runtime/hook-mirror.test.ts`

**Interfaces:**
- Produces (`hookMirror.mjs`, plain ESM, no dependencies, importable from Node and from the browser bundle):
  - `mirroredHookNames: ReadonlySet<string>` (names without the `data-nse-` prefix);
  - `isMirrorValue(value: string): boolean` (non-empty, no `\s`);
  - `mirrorTokens(name: string, value: string): readonly string[]` → `["nse:<name>"]` or `["nse:<name>", "nse:<name>=<value>"]`;
  - `mirrorSelector(name: string, value: string | null): string | null` → the escaped class selector, or `null` when the attribute form must stay.
- `selector-performance.mjs` calls `mirrorSelector` for every `AttributeSelector` whose matcher is absent or `=` and whose flags are empty, before step 3 (reordering). The mirrored-name set comes from one source: a test asserts `mirroredHookNames` equals `control`, `part`, `nseThemeStates`, `nseThemeVariants` and the four appearance names.

- [x] **Step 1: Write the failing tests** in `tests/runtime/hook-mirror.test.ts` and extend `selector-performance.test.ts`:

```ts
expect(optimiseSelectors('[data-nse-control="button"] [data-nse-part="bezel"]{color:red}'))
  .toContain('.nse\\:control\\=button .nse\\:part\\=bezel');
expect(optimiseSelectors('[data-nse-hovered]{color:red}')).toContain('.nse\\:hovered');
// Review Focus 1: values that cannot be tokens keep the attribute form.
expect(optimiseSelectors('[data-nse-key-equivalent=" "]{color:red}')).toContain('[data-nse-key-equivalent=" "]');
expect(optimiseSelectors('[data-nse-style=""]{color:red}')).toContain('[data-nse-style=""]');
// Other operators, flags and data attributes are untouched.
for (const kept of ['[data-nse-style~="a"]', '[data-nse-style^="a"]', '[data-nse-style="a" i]', '[data-nse-toolbar-item-id="x"]', '[data-state="on"]'])
  expect(optimiseSelectors(`${kept}{color:red}`)).toContain(kept);
// Specificity is unchanged for every rule of the built Atmo sheet.
expect(mirrorTokens("part", "bezel")).toEqual(["nse:part", "nse:part=bezel"]);
expect(mirrorTokens("key-equivalent", "\r")).toEqual(["nse:key-equivalent"]);
```

  Add one test that runs `optimiseSelectors` over the whole built Atmo stylesheet and asserts no throw (the specificity guard) and that fewer than 1% of `[data-nse-control` / `[data-nse-part` occurrences remain.
- [x] **Step 2:** Run `npx vitest run tests/runtime/hook-mirror.test.ts tests/runtime/selector-performance.test.ts`. Expected: FAIL (module missing).
- [x] **Step 3:** Implement `hook-mirror.mjs` and the rewrite. `rank()` already treats `ClassSelector` as rank 1, so rewritten selectors sort first without further change.
- [x] **Step 4:** Run the two test files and typecheck. Expected: PASS. **Commit order:** the runtime mirror (Task 3) and the observer and helper (Task 4, steps 1–3) are committed first, because classes without rewritten CSS are harmless while rewritten CSS without classes draws nothing; this task's rewrite is committed after them, so every commit draws correctly.
- [x] **Step 5:** Commit: `Style performance: rewrite contract attribute selectors to mirror classes`.

### Task 3: Synchronous mirror in the JSX runtime

**Files:**
- Create: `src/NSE/Theme/contract/hookMirrorJSXRuntime.mjs`, `hookMirrorJSXDevRuntime.mjs` (plain ESM so an installed package serves them unbuilt), `src/NSE/Theme/contract/hookMirrorReact.ts` (mirroring `createElement` and `cloneElement` for the six framework files that build host elements without JSX), `scripts/synware/hook-mirror-jsx.mjs` (`resolveHookMirrorJSX(id, importer)` and a standalone `hookMirrorJSX()` plugin)
- Modify: `scripts/synware/vite-plugin.mjs` (call `resolveHookMirrorJSX` first in `resolveId`), `scripts/synware/build-sdk.mjs` and `sdk-package-manifest.mjs` (ship the four modules beside `vite.mjs`; no new package export), `vitest.config.ts` (`plugins: [hookMirrorJSX()]`)
- Test: `tests/nse/hook-mirror-jsx.test.tsx`

**Interfaces:**
- Produces: `jsx`, `jsxs`, `Fragment` (and `jsxDEV`, `Fragment` in the dev module) with React's signatures. For a string `type` whose props include a mirrored `data-nse-*` key with a non-null, non-`false` value, the returned element's `className` is the caller's `className` followed by the tokens, space-separated. Other elements pass straight through. Token strings are cached in a `Map` keyed by `name + "\0" + value`.
- The wrapper imports React's own runtime by a path the plugin's `resolveId` does not intercept (resolve with `skipSelf` from the wrapper's importer check; a recursion here hangs the build, so the test below imports through the alias).

- [x] **Step 1: Write the failing test:**

```tsx
it("mirrors contract hooks into classes beside the caller's own", () => {
  const { container } = render(<div className="mine" data-nse-control="button" data-nse-hovered="" data-nse-key-equivalent={" "} data-nse-toolbar-item-id="save" />);
  const node = container.firstElementChild!;
  expect(node.getAttribute("data-nse-control")).toBe("button");            // contract unchanged
  expect([...node.classList]).toEqual(["mine", "nse:control", "nse:control=button", "nse:hovered", "nse:key-equivalent"]);
});
it("removes a token when its attribute goes away on re-render", …);        // rerender without data-nse-hovered
it("leaves elements without hooks and component types untouched", …);     // referential: props object not copied
it("mirrors hooks spread from nseControlHooks and nsePartHooks", …);
```

- [x] **Step 2:** Run it. Expected: FAIL.
- [x] **Step 3:** Implement the two runtime modules and the three aliases.
- [x] **Step 4:** Run the test, then the rendered-contract suite (`npx vitest run tests/nse`), which asserts attributes on about 700 specimens. Fix any test that compares `className` for exact equality by asserting the tokens it cares about; do not weaken attribute assertions. Expected: PASS.
- [x] **Step 5:** Commit: `NSE: mirror contract hooks into classes in the JSX runtime`.

### Task 4: Reconciling observer, imperative helper, acceptance

**Files:**
- Create: `src/NSE/Theme/contract/hookMirrorDOM.ts` (`installNSEHookMirror`, `setNSEHook`; the observer also watches `class`, so a renderer rewriting `className` cannot drop tokens set by hand)
- Modify: the 24 imperative writes (`grep -rn 'dataset\.nse\|setAttribute("data-nse\|toggleAttribute("data-nse' src`), limited to mirrored names; `src/NSE/Appearance/NSEAppearanceProvider.tsx` (install the observer once per document); `scripts/synware/idiom-errors.mjs` (reject `.nse\:` selectors in authored CSS); `docs/framework/theme-contract.md`
- Test: `tests/nse/hook-mirror-observer.test.tsx`, `tests/e2e/hook-mirror.spec.ts`

**Interfaces:**
- Produces: `installNSEHookMirror(document: Document): () => void` (idempotent per document; returns the uninstall function), `setNSEHook(element: Element, name: string, value: string | null): void`.

- [x] **Step 1: Write the failing tests.** Vitest (jsdom): an element created with `document.createElement` and given `data-nse-part="row"` has the tokens after a microtask; changing the value swaps the value token; removing the attribute removes both; an element the JSX wrapper already mirrored is not written again (spy on `classList.add`). Playwright (Review Focus 2): a fixture page that renders one `NSEButton` through React and one hand-built `<button data-nse-control="button" data-nse-bezel-style="rounded">` appended in a `useLayoutEffect`; assert both have the same computed `border-radius` by the next animation frame, and that `setNSEHook` gives it synchronously.
- [x] **Step 2:** Run. Expected: FAIL.
- [x] **Step 3:** Implement. The observer batches by element per callback and reads `attributes` once per element.
- [x] **Step 4:** Run focused tests, typecheck, then `npm run sdk:build`, vendor into the site with `npm run framework:sync -- --allow-dirty` **as a local experiment only** (the receipt stays out of any commit; the site worktree is restored with `git checkout -- package.json package-lock.json vendor/framework-receipt.json` afterwards and the experiment archive deleted), restart 5387 with `--force`, and run the harness and the digest.
- [x] **Step 5:** Check the targets: gallery full recalc ≤ 55 ms; section-change mean ≤ 90 ms; cold gallery load style ≤ 480 ms; launch About style ≤ 60 ms; digest compare against `baseline-digest.json` = 0 differences. Save `after-mirror.json` beside the baseline. If the digest differs, the differing elements name the selector class that was mis-rewritten; fix in Task 2's code, do not special-case elements.
- [x] **Step 6:** Run baseline (123/123) and the `theme-nesting` spec (third-party attribute-only theme, Review Focus 3).
- [x] **Step 7:** Commit: `NSE: keep mirror classes in step for imperative and unbundled hooks`.

### Task 5: Remaining recalc cost, measured then cut

**Files:** decided by the profile; expected `scripts/synware/theme-loading.mjs`, `scripts/synware/selector-performance.mjs`.

- [x] **Step 1:** With Task 4 in place, capture a Chromium trace of `gallery-full-recalc` with `blink.debug` selector statistics (`--enable-blink-features=…` is not needed; use DevTools "Selector stats" via CDP `Tracing` category `disabled-by-default-blink.debug`) and list the 30 costliest selectors by elapsed time and by match-attempt count. Save as `selector-stats.json`.
- [x] **Step 2:** Apply only rewrites that are provably equivalent, each with a unit test in `selector-performance.test.ts` and the specificity guard: (a) drop the duplicate twin when `:scope X` and `X:scope` can both be expressed as one rule after mirroring; (b) hoist a leading class out of `:where(.a …)` ancestor arguments so the Bloom filter sees it; (c) anything else the stats name, one rewrite per commit if they are independent.
- [x] **Step 3:** Re-run harness, digest (0 differences) and baseline (123/123). Target: gallery full recalc ≤ 45 ms. Record CSS byte size before and after.
- [x] **Step 4:** If the target is not met, stop here: write the profile and the remaining top selectors into `docs/superpowers/evidence/2026-11-11-performance/README.md` and report to the owner. Do not regenerate Atmo's rules.
- [x] **Step 5:** Commit: `Style performance: <the specific rewrite>`.

### Task 6: Interaction state without re-rendering

**Files:**
- Modify: `src/NSE/Theme/contract/useThemeInteraction.ts` and its callers (find with `grep -rln useNSEThemeInteraction src`)
- Test: `tests/nse/theme-interaction.test.tsx`

**Finding:** hover, focus and highlight are React state, so each pointer crossing re-renders the control. The attributes are drawing state only; nothing reads the booleans for behaviour except `highlighted && enabled`.

**Outcome (12 November 2026, `30752974`):** the finding above was wrong about where the cost was. The whole host re-rendered on every pointer move because the runtime store published same-value writes (evidence README, "Pointer movement re-rendered the whole host"). Fixing the store took the sweep's script time from 3,132 ms to 39 ms, so Steps 1 to 3 below were not carried out; Steps 4 and 5 were met by the store commit. Test: `tests/runtime/runtime-store-performance.test.ts`.

**Interfaces:**
- `useNSEThemeInteraction` keeps its signature and return shape for callers that read the booleans; add an internal option `{ publish: "attributes" }` under which it writes `data-nse-hovered`, `data-nse-focused` and `data-nse-highlighted` with `setNSEHook` on the event's `currentTarget` and holds no state. Convert each caller that only spreads the booleans into `nseStateHooks`.

- [ ] **Step 1:** Failing test: render an `NSEButton` with a render counter; hover, focus, press and release; assert the three attributes appear and disappear and the render count does not change.
- [ ] **Step 2:** Run. Expected: FAIL (render count rises).
- [ ] **Step 3:** Implement; convert callers one family per commit if the diff is large (buttons, values, text, selection).
- [x] **Step 4:** Focused tests, the rendered-contract suite, baseline (hover, focus and press surfaces are in the catalogue), and the harness `gallery-hover-sweep`. Target: script time during the sweep falls by at least 50% against Task 1's figure.
- [x] **Step 5:** Commit: `NSE: publish hover, focus and highlight without re-rendering the control`.

---

# Workstream B: Lifecycle (reported findings, both verified)

## Findings

- **Order, confirmed.** `LaunchServices.runLaunch()` (`src/SynCloudOS/LaunchServices/LaunchServices.ts:952`) awaits `AppManager.launch()`, which awaits `Lifecycle.launch()`'s whole operation, including its `did` hooks. `createApplicationLifecycle` (`src/SynCloudOS/AppHosting/applicationSession.ts:628–636`) maps `launch:did` → `applicationDidFinishLaunching()` and `activate:did` → `applicationDidBecomeActive()`. Only then does `runLaunch` call `WindowManager.openApplicationWindow()` (line 961). `docs/framework/applications.md:23` promises "After the launch commits. The main window is open and may already have rendered."
- **A launch-speed consequence.** Because `runLaunch` awaits the `did` hooks, a slow `applicationDidFinishLaunching` delays the window, route sync and the stage transition.
- **Bypass, confirmed.** `AppManager.suspend()`, `suspendForApplicationClose()` and `close()` (`AppManager.ts:275–292`) call `bundleLoader.invokeLifecycleHook("applicationWillSuspend" | …)` and `this.transition(…)` directly. They never reach `Lifecycle.suspend()` / `Lifecycle.close()`, so the class-aware hooks (`suspend:will` → `applicationWillResignActive`, `close:will` → `applicationShouldTerminate` with veto, `close:did` → `applicationWillTerminate` and session disposal) do not run. Callers: `settleMultiSwitch` (`LaunchServices.ts:272`) and `closeApp` (`LaunchServices.ts:1477`). `closeApp` is the quit path (`reason: "application-quit"`) yet ends in `suspended`, never asks `applicationShouldTerminate`, and never disposes the session.

### Task 9: Launch callbacks run after the main window opens

**Files:**
- Modify: `src/SynCloudOS/Lifecycle/lifecycleTypes.ts` (add to `LifecycleRequestOptions`), `src/SynCloudOS/Lifecycle/Lifecycle.ts` (`launch()`), `src/SynCloudOS/LaunchServices/LaunchServices.ts` (`runLaunch`)
- Test: `tests/runtime/launch-lifecycle-order.test.ts`

**Interfaces:**
- Produces: `LifecycleRequestOptions.presentAfterCommit?: (context: { readonly signal: AbortSignal }) => void | Promise<void>` (`@internal`). `Lifecycle.launch()` runs it as the first `effects` step (`onError: "stop"`), which the operation coordinator already runs after `commit` and before `did`.
- `runLaunch` passes everything it does today between `manager.launch()` resolving and `recordRequestHistory("complete", …)` as `presentAfterCommit` (window open, stale-authority close, MultiSwitch begin, `selectApp`, route sync, `app.launch.complete`). The `catch` path is unchanged: an effect failure with `onError: "stop"` rejects the launch exactly as a failed window open does today.

- [x] **Step 1: Write the failing tests** with a real runtime and an `NSEApplication` subclass that records calls, and a window-manager spy:

```ts
expect(order).toEqual([
  "applicationWillFinishLaunching", "lifecycle:committed", "openApplicationWindow",
  "applicationDidFinishLaunching", "applicationDidBecomeActive",
]);
// Review Focus 4
it("opens the window without waiting for a slow applicationDidFinishLaunching", …); // hook awaits a deferred; app.launch.complete already published
it("reports a throwing applicationDidFinishLaunching and keeps the launch", …);     // LIFECYCLE_HOOK_FAILED captured; state stays active
it("fails the launch and runs no did hook when the window cannot open", …);
it("a resumed (suspended) application is not told it finished launching again", …);
```

- [x] **Step 2:** Run. Expected: FAIL on order.
- [x] **Step 3:** Implement.
- [x] **Step 4:** Focused tests plus `npx vitest run tests/runtime tests/integration -t "launch"`; typecheck. Expected: PASS. Update `docs/framework/applications.md` only if a sentence is now wrong.
- [x] **Step 5:** Commit: `Lifecycle: run launch callbacks after the main window opens`.

### Task 10: Suspend and quit go through the class-aware lifecycle

**Files:**
- Modify: `src/SynCloudOS/AppManager/AppManager.ts` (remove `suspend()`, `suspendForApplicationClose()`, `close()`; widen `AppManagerLifecyclePort` to `Pick<SynCloudOSLifecycle, "launch" | "activate" | "suspend" | "close">`), `src/SynCloudOS/LaunchServices/LaunchServices.ts` (`settleMultiSwitch`, `closeApp`), `src/SynCloudOS/BundleLoader/bundleTypes.ts` only if a hook name becomes unused
- Test: `tests/runtime/lifecycle-suspend-terminate.test.ts`

**Interfaces:**
- `settleMultiSwitch` calls `runtime.lifecycle.suspend(fromAppId, { reason: "LaunchServices.multiSwitch" })` and does not await it.
- `closeApp(appId)` becomes: cancel pending launches → `Lifecycle.close(appId, { reason: "LaunchServices.closeApp", closeTransaction })`, where the transaction carries the window-close preparation and authority the function builds today (`Lifecycle.close` already closes the application's windows in its `will` phase after `close:will` and calls `WindowManager.commitCloseApplication` at commit). Returns the same `closeResult` shape. Read `closeApplicationWindows` and `commitCloseApplication` in `Lifecycle.ts:721–830` before writing; the mechanism exists and `closeApp` simply does not use it.
- No replacement methods are added to `AppManager`. Any other caller of the three removed methods is moved to `runtime.lifecycle` in this commit.

- [x] **Step 1: Write the failing tests:**

```ts
it("MultiSwitch tells the outgoing application it will resign active", …);          // applicationWillResignActive called once
it("quit asks applicationShouldTerminate, then applicationWillTerminate, then disposes the session", …);
// Review Focus 5
it("a vetoed quit leaves the application active with its windows open", …);        // closeResult.outcome !== "closed"; no applicationWillTerminate
it("quit during an in-flight launch cancels it and never calls applicationWillTerminate", …);
it("the legacy bundle hooks applicationWillClose/DidClose still fire once, through the lifecycle", …);
```

- [x] **Step 2:** Run. Expected: FAIL (callbacks never called).
- [x] **Step 3:** Implement.
- [x] **Step 4:** Focused tests, `npx vitest run tests/runtime tests/integration -t "close|quit|suspend|MultiSwitch"`, typecheck, boundaries.
- [x] **Step 5:** Commit: `Lifecycle: suspend and quit through the class-aware operations`.

---

# Workstream C: App launch and loading

## Findings

- No launch path awaits a theme promise or `document.fonts.ready` (the one `fonts.ready` is in the notification presenter). The cost of themes on launch is style recalc: launching About spends 168 ms in 200 recalcs for 319 elements, and a cold gallery load spends 1.9 s. Workstream A removes most of it.
- Launch awaits, in order: configuration-profile authorisation, `manager.getReady()` (bundle chunk import), the lifecycle `will` hooks, the lifecycle `did` hooks (removed from the path by Task 9), then the window open.
- Vite injects an app's CSS chunk when its JS chunk loads. Whether that injection forces a document-wide recalc under `@layer`/`@scope` is not yet measured.

## Done

| Metric (harness, median of 5) | Before | Target |
| --- | --- | --- |
| Launch About: click → `app.launch.complete` | recorded in Task 11 | **≤ 60% of before**, and no step in it waits on a stylesheet or font |
| Launch About: longest main-thread task | 71 ms | **≤ 50 ms** |
| Launch About: style total | 168 ms | **≤ 60 ms** |
| QuickSwitch open, QuickSwitch select, return to Webspring: longest task | 63, 51, 95 ms | **≤ 50 ms** each (style is already small: 22, 21, 48 ms) |

### Task 11: Launch timeline, then remove what waits

**Files:**
- Modify: `scripts/perf/style-recalc.mjs` (add `performance.mark`-based launch phases read from the `app.launch.*` events), files named by the findings
- Test: `tests/runtime/launch-does-not-wait-on-style.test.ts`

**Outcome (12 November 2026, `3de36cac`):** see `docs/superpowers/evidence/2026-11-11-performance/launch.md`. The timeline is `scripts/perf/launch-timeline.mjs` (a separate script, reading the runtime's events from the page, so no marks were added to the framework). Nothing waits on a theme; stylesheet insertion re-matches at most 91 elements, so Step 2 needed no fix and `launch-does-not-wait-on-style.test.ts` was not written; the prefetch already brings CSS with the bundle. The one code change is the safe-area read memo, which did not move launch time.

- [x] **Step 1:** Add marks at `app.launch.started`, `authorised`, bundle ready, lifecycle committed, window opened, `app.launch.complete`, and first frame after complete. Record the phase table for About, Journal and the gallery (cold and warm) in `docs/superpowers/evidence/2026-11-11-performance/launch.md`.
- [x] **Step 2:** In a trace of a cold launch, find the `UpdateLayoutTree` that follows the app's stylesheet insertion and record its element count. If it re-matches the whole document, fix at the source: the Vite plugin emits app CSS so that insertion cannot change rules outside the app's subtree (the app's sheet is already scoped; confirm the `@layer` statement order is declared once up front in `src/NSE/Structure/layers.css` so a late sheet does not reorder layers). Write the test first: a jsdom-free unit test on the plugin's emitted CSS that asserts every app rule is inside the app's `@scope` and declares no new top-level `@layer` name.
- [x] **Step 3:** Prefetch on intent: `src/Webspring/webspringPrefetch.ts` exists. Verify with the trace that hovering or focusing an icon starts the bundle and CSS fetch; if it only fetches JS, extend it to the CSS chunk. Test in `tests/runtime/webspring-prefetch.test.ts`.
- [x] **Step 4:** Re-measure; check the table above; save `launch-after.json`.
- [x] **Step 5:** Commit per fix: `Launch: <what no longer waits>`.

---

# Workstream D: Implicit state machines

## Findings

`src/SynCloudOS/Statechart/Statechart.ts` is the one system statechart (`booting`, `active.webspring`, `active.application.*`, `locked`, `offline`): a definitions table with `allowedFrom`, `canTransition`, `explainTransition` and a history. It is not reusable: it is bound to the runtime and its state names are a closed union. Elsewhere, state machines are implied by a string field plus guards spread across files:

| # | Machine | Where it lives today | Evidence it is implicit |
| --- | --- | --- | --- |
| 1 | Application lifecycle (`registered` … `disabled`) | `AppManager/AppLifecycle.ts` (`allowedTransitions`) **and** `Lifecycle/Lifecycle.ts:177` (`legalLifecycleState`) **and** `AppManager.transition()`/`getReady()` | Two tables that must agree; `AppManager.createRecord` derives `readiness` from the state with a nested conditional |
| 2 | Webspring launch phase (`idle`, `staging`, `launching`, `covered`, `returning`) | `WebspringState/WebspringState.ts:451–585` writes `draft.webspring.launchPhase`; guards in `LaunchServices.ts:207,352,867,935`, `Choreography/WebspringChoreography.ts:69,93,119`, `Lifecycle.ts:680`, `Statechart.ts:316` | Seven writers, nine guards, no table of legal moves |
| 3 | MultiSwitch (`idle`, `switching`) with its frame/frame/timer fallback | `ApplicationState`, `LaunchServices.ts:245–330` (`MultiSwitchFallback { firstFrame, presentationFrame, settleTimer }`) | Three nullable handles encode four sub-states |
| 4 | Launch request (`queued` → `started` → `authorised` → `loading` → `ready` → `complete` / `failed` / `cancelled`) | `LaunchServices.ts` `recordRequestHistory(...)` strings, `activeLaunchRequest`, `launchAuthorityIsCurrent` checked six times in `runLaunch` | History strings are the only record of the state |
| 5 | Folder split presentation (`closed`, `open`, `closing`) | `src/Webspring/WebspringFolderSplitPresentation.tsx:61` | `SplitPhase` set from effects |
| 6 | System startup (`booting`, `material`, `complete`) | `RootRuntime/RootRuntimeManager.ts:36` and `Webspring/SystemStartupLayer.tsx:26` | The same union declared twice |
| 7 | Control interaction (hover, focus, highlight) | `useThemeInteraction.ts` | Three independent booleans, kept as React state (see Task 6 outcome); any combination is legal, so there is no machine to define |
| 8 | Worker request protocols (pending → posted → settled / cancelled) ×4 | `BrowserImageProcessingWorker.ts`, `VideoWorkerTransport.ts`, `BrowserPDFDocumentWorker.ts`, `WorkerLuminaIndexBackend.ts` | Request-id maps plus cancel messages; deleted by Workstream E's adoption, so not converted here |
| 9 | Page turn (`idle`, `dragging`, `turning`, `settling`, `canceling`, `torn`, `reduced`) | `src/NSE/Page/` (`NSEPagePhase`) | Phase written from pointer handlers |
| 10 | Drag session (`dragging`, `over-destination`, `dropping`, `completed`, `cancelled`) | `src/SynCloudOS/Drag/` (`DragPhase`) | Phase written from several handlers |

## The fix

One internal primitive beside the system statechart, used by each machine above. It is internal (no SDK entry, no `NSE` name), so it needs no AppKit counterpart; its shape follows GameplayKit's `GKStateMachine` (`canEnterState`, `enter`) so the mapping is obvious if it is ever published.

## Done

- Machines 1–6, 9 and 10 are each defined by one `defineStateMachine` table in one file.
- A guard test (`tests/runtime/state-machines.test.ts`) fails if any of the listed phase fields is assigned outside its machine's file (source scan for `launchPhase =`, `multiSwitch.status =`, `lifecycle[…] =`, and the others), and each machine has a table test that walks every state × event pair and asserts the illegal ones are rejected.
- `AppLifecycle.ts`'s table and `legalLifecycleState` are one table.
- No behaviour change: the existing suites for each area pass unchanged.

### Task 12: The state-machine primitive

**Files:**
- Create: `src/SynCloudOS/Statechart/StateMachine.ts`
- Test: `tests/runtime/state-machine.test.ts`

**Interfaces:**
- Produces:

```ts
export interface StateMachineDefinition<S extends string, E extends string> {
  readonly initial: S;
  /** For each state, the event → next-state table. An absent event is illegal in that state. */
  readonly states: Readonly<Record<S, Readonly<Partial<Record<E, S>>>>>;
}
export interface StateMachine<S extends string, E extends string> {
  readonly state: S;
  canSend(event: E): boolean;
  /** Returns the new state, or null (and changes nothing) when the event is illegal here. */
  send(event: E): S | null;
  /** Whether the table has any event taking `from` to `to`. */
  canEnter(from: S, to: S): boolean;
  subscribe(listener: (state: S, previous: S, event: E) => void): () => void;
}
export function defineStateMachine<S extends string, E extends string>(definition: StateMachineDefinition<S, E>): { create(initial?: S): StateMachine<S, E>; readonly definition: StateMachineDefinition<S, E> };
```

  Machines whose state lives in `RuntimeStore` use `definition` and a pure `next(state, event): S | null` helper exported from the same file, so the store stays the single owner of the value.

- [x] **Step 1:** Failing tests: legal send moves and notifies once; illegal send returns `null`, keeps state, notifies nobody; `canEnter`; a listener that sends re-entrantly sees a consistent order; a definition naming an unknown target state throws at `defineStateMachine`.
- [x] **Step 2:** Run. Expected: FAIL.
- [x] **Step 3:** Implement (about 60 lines).
- [x] **Step 4:** Run; typecheck.
- [x] **Step 5:** Commit: `Statechart: add an explicit state-machine primitive`.

### Tasks 13–18: Convert one machine per commit

Same five steps each: write the table test from the machine's current behaviour (walk every state × event; assert the transitions the existing code allows and no others, deriving the expected table by reading the writers and guards listed in Findings), run it red against a table with one deliberate hole, implement by replacing each writer with `send`/`next` and each scattered guard with `canSend` or a state read, run that area's existing suite unchanged, commit.

- [x] **Task 13: Application lifecycle.** Files: `AppManager/AppLifecycle.ts` (becomes the machine: states = `SynCloudOSAppLifecycleState`, events = `prepare`, `load`, `loaded`, `launch`, `activate`, `suspend`, `close`, `fail`, `disable`, `enable`), `Lifecycle/Lifecycle.ts` (`legalLifecycleState` reads the same table), `AppManager.ts` (`createRecord`'s readiness becomes a per-state lookup). Commit: `Lifecycle: one transition table for application state`.
- [x] **Task 14: Webspring launch phase.** Files: `WebspringState/WebspringState.ts`, new `WebspringState/launchPhaseMachine.ts` (events: `stage`, `launch`, `cover`, `beginReturn`, `finishReturn`, `reset`), and the guards in `LaunchServices.ts`, `WebspringChoreography.ts`, `Lifecycle.ts`, `Statechart.ts`. Commit: `Webspring: make the launch phase an explicit machine`.
- [x] **Task 15: MultiSwitch.** Files: `ApplicationState/`, `LaunchServices.ts:245–330`; states `idle`, `awaitingFirstFrame`, `awaitingPresentationFrame`, `settling`, with the three handles owned by the state they belong to. Commit: `LaunchServices: make MultiSwitch settlement an explicit machine`.
- [x] **Task 16: Launch request.** Files: `LaunchServices.ts`, new `LaunchServices/launchRequestMachine.ts`; `recordRequestHistory` is driven by the machine's listener, so history and state cannot disagree. Commit: `LaunchServices: make the launch request an explicit machine`.
- [x] **Task 17: Folder split and system startup.** Files: `Webspring/WebspringFolderSplitPresentation.tsx`, `RootRuntime/RootRuntimeManager.ts`, `Webspring/SystemStartupLayer.tsx` (one shared union). Baseline must pass (the folder presentation is the catalogue's timing-sensitive case; run it three times serially). Commit: `Webspring: explicit machines for folder presentation and startup`.
- [x] **Task 18: Page turn and drag session.** Files: `src/NSE/Page/`, `src/SynCloudOS/Drag/`. NSE may not import from `src/SynCloudOS`; check `scripts/quality/architecture-boundaries.json` first and, if the edge is forbidden, place the primitive's file where both layers may import it (propose the location in the commit body; do not add an allow-list entry). Commit: `NSE and Drag: explicit machines for page turns and drag sessions`.

After Task 18 add the guard test described under Done and commit it with Task 18.

---

# Workstream E: DispatchFX and main-thread work

## Findings

- DispatchFX today is Tier 0 only: `src/FX/DispatchFX/` has the full in-realm API (queues, groups, semaphores, work items, sources; plan Tasks 1–6, commits `a23c3427` … `8d517c4f`). It schedules on the main thread. There is no worker pool, no closure conversion, and no framework adopter except the device families that take a `DFXQueue` argument.
- The framework runs heavy work on **six hand-rolled workers**, each with its own request-id, cancel and transfer protocol: `BrowserImageProcessingWorker.ts:438`, `VideoWorkerTransport.ts:259`, `BrowserPDFDocumentWorker.ts:169,178`, `WorkerLuminaIndexBackend.ts:335`, pdf.js's own worker, and `BrowserRecoveryWatchdog.ts:37`.
- The owner already approved the Tier 1 design and its plan (`2026-11-08-dispatchfx-plan.md`, Tasks 7–10) and the adoption order with its bar (Tasks 12–15). They have not been executed. Tier 2 (blocking, needs cross-origin isolation) stays out: it breaks `NSEWebView`.
- Main-thread work not yet in any worker is unknown until traced. Candidates to check, none assumed: text shaping (`BrowserTextLayoutAdapter`, harfbuzz), `notificationScreenSliceCapture` (snapdom), document-store snapshot serialisation (`documentStoreSnapshotText.ts`), manifest validation at boot (ajv).

## The fix

Execute the approved DispatchFX plan Tasks 7, 8, 9, 10 and 12–15 as written there (they already have files, interfaces, test names and commit subjects; do not restate or redesign them). Then use Task 19's trace to move any remaining long main-thread computation onto a `DFXQueue.global(.utility | .userInitiated)` sendable closure, under the same adoption bar.

## Done

- `docs/superpowers/evidence/2026-11-11-performance/dispatch-benchmarks.md` holds before and after for each adopted workload: **longest main-thread task falls by at least 50% and wall time regresses by no more than 10%** (the approved bar). An adoption that misses the bar is reverted and recorded.
- The four hand-rolled protocols (image, video, PDF document, Lumina) are deleted; `grep -rn "new Worker(" src` shows only the pool entry, pdf.js's worker and the recovery watchdog.
- During launch, QuickSwitch and section change on the harness, no main-thread task over 100 ms remains whose top frame is framework computation (rendering excluded).
- Memory: a heap snapshot after launching and quitting About ten times grows by less than 2 MB over the snapshot after the first cycle (recorded by Task 19; Task 10 makes quit dispose the session, which this depends on).

### Task 19: Trace-led inventory

- [x] **Step 1:** Extend `scripts/perf/style-recalc.mjs` with `--cpu`: record a CPU profile per scenario and print main-thread tasks over 50 ms with their top self-time function and file.
- [x] **Step 2:** Add `scripts/perf/heap-cycles.mjs`: launch and quit About ten times, force GC through CDP `HeapProfiler.collectGarbage`, print `JSHeapUsedSize` after cycle 1 and cycle 10 and the count of detached DOM nodes.
- [x] **Step 3:** Write the inventory table (scenario, task ms, function, file, verdict: render / move to DFX / fix in place) into `dispatch-benchmarks.md`. Each "move to DFX" row becomes a slice after Task 21 with its own before and after.
- [x] **Step 4:** Commit: `Perf: record main-thread and heap inventories`.

### Task 20: DispatchFX Tier 1

- [ ] Execute `2026-11-08-dispatchfx-plan.md` **Task 7** (benchmark harness; its `scripts/perf/dispatchfx-bench.mjs` sits beside this plan's harness), **Task 8** (worker pool), **Task 9** (closure conversion), **Task 10** (worker chunks end to end), one commit each with the subjects that plan gives. That plan's Task 10 ends in "STOP for review": report to the owner there and continue with Workstreams that do not depend on it.

### Task 21: Adoption

- [ ] Execute that plan's **Tasks 12–15** (ImageFX, VideoFX, PDF document, Lumina), one commit each, each behind the bar. Then the "move to DFX" rows from Task 19, one commit each.

---

# Workstream F: Internal `NSE*` names

## Findings

- `docs/framework/appkit-counterparts.json` maps 464 names; `tests/runtime/appkit-counterparts.test.ts` checks only names exported from public SDK entries.
- `src/` declares **1,265** `NSE`-prefixed names (classes, functions, constants, interfaces, types). 463 are mapped, 94 are derived by suffix, and **708 are internal names with no entry**. Largest families: Page 49, Colour 44, Window 37, SmoothSurface 30, Tab 28, Menu 24, Toolbar 23, Overlay 21, View 19, Date 17, Control 17, TopBar 14, Chrome 14, Virtual 13, Tooltip 11.
- `NSEGroupedList` (extends `NSEBoxProps`; rows with shared bevel seams) and `NSEListItem` appear in 19 files: the two components, six Webspring preference panes, source list, outline and navigation code, two Atmo stylesheets, tests and a quality script. AppKit has neither class.

## The rule

An `NSE`-prefixed declaration anywhere in `src/` must be one of:

1. **An AppKit, Foundation or Core Animation type**, listed in the map with its counterpart (for example `NSEScroller` → `NSScroller`, `NSETableHeaderView` → `NSTableHeaderView`, `NSEColourList` → `NSColorList`, `NSEColourPicker` → `NSColorPicker`, `NSEController` → `NSController`, `NSEPreferencePane` → `NSPreferencePane`, `NSEUUID` → `NSUUID`, `NSEPersonNameComponents` → `NSPersonNameComponents`, `NSETrackingOption` → `NSTrackingArea.Options`, `NSEPopoverBehavior` → `NSPopover.Behavior`, `NSECollectionLayoutItem` → `NSCollectionLayoutItem`, `NSEAnimationTimingFunction` → `CAMediaTimingFunction`).
2. **A mapped name plus a derived suffix.** The suffix list grows by the plumbing suffixes internal code uses: `Context`, `Provider`, `Port`, `Controller` (only where the base is a view AppKit pairs with a controller), `Handle`, `Internals`, `Error`. `NSEColourPanelProvider` then takes `NSColorPanel`.
3. **Otherwise it loses the prefix or is removed.** It is renamed to a plain internal name (no prefix), or deleted if nothing uses it. No `{ "none": … }` entries are allowed for internal names: that escape exists only for public names the owner already accepted.

## Proposed dispositions by family (default, owner decision 3)

| Family | Count | Disposition |
| --- | --- | --- |
| `NSEGroupedList*`, `NSEListItem*` | 5 | AppKit's counterpart is an inset-style `NSTableView` and `NSTableRowView`, but these are static layout, not data views. **Rename to `GroupedRows` and `GroupedRow`** (internal, `src/NSE/Controls/Selection/`), with `GroupedRowsEdge`, `…Props`. Contract hooks they emit do not change. |
| `NSESmoothSurface*` | 30 | SynCloudOS's own squircle primitive; no AppKit class. **Drop the prefix: `SmoothSurface*`.** |
| `NSEPage*` (curl, tear, book geometry) | 49 | `NSEPageController` stays public (`NSPageController`). The curl engine's types **drop the prefix: `PageCurl*`, `PageTurn*`, `PageGeometry*`.** |
| `NSEOverlay*`, `NSETooltip*` (manager, registration, scheduler) | 32 | Internal presentation plumbing. `NSETooltip` itself maps to `NSView.toolTip` only as a member, so **drop the prefix: `Overlay*`, `Tooltip*`.** |
| `NSETopBar*`, `NSEChrome*`, `NSEAppFrame*`, `NSEMetal*`, `NSEGlassPanel` | ~35 | Atmo-era chrome primitives. **Drop the prefix.** Where a file is unreferenced, delete it. |
| `NSEVirtual*` | 13 | Virtualisation helper for data views. **Drop the prefix: `Virtual*`.** |
| `NSETabBar*`, `NSETabStrip*`, `NSETabChrome*` | ~20 | `NSETabView`/`NSETabViewController` stay. `NSETabBar*` is UIKit's `UITabBar`, not AppKit: **drop the prefix: `TabBar*`, `TabStrip*`.** |
| `NSEWindow*` internals (`…Host`, `…Mount`, `…SurfaceBridge`, `…TitlebarHost`, `…AlertQueue`) | 37 | Suffix rule where the base is `NSEWindow`/`NSEWindowController` and the suffix is in the list; the rest **drop the prefix: `WindowHost`, `WindowMount`, `WindowSurfaceBridge`.** |
| `NSEColour*` internals (modes, icons, transfer, preferences) | 44 | `NSEColourList`, `NSEColourPicker` map (rule 1); `NSEColourPanel*` plumbing by suffix; mode and icon components **drop the prefix: `ColourWheelMode`, `ColourCrayonsMode`, …** |
| `NSEMenu*`, `NSEToolbar*`, `NSEDate*`/`NSETime*`, `NSEControl*`, `NSEView*`, others | ~440 | Classified one by one in Task 22 by the three rules, mechanically where rule 1 or 2 applies. |

## Done

- `tests/runtime/appkit-counterparts.test.ts` has a new case, "every NSE-prefixed declaration in src has an AppKit counterpart", that scans all of `src/` with the TypeScript compiler and fails on any `NSE[A-Z]…` declaration that is neither in `counterparts`, nor in a new `internalCounterparts` section (strings only), nor derivable by suffix. **It reports 0 missing** (708 today).
- No file exports both an old and a new name.
- Full suite, typecheck, boundaries, baseline 123/123 (class names used by structural CSS must not change; these renames are TypeScript identifiers only).

### Task 22: Extend the test and commit the inventory

**Files:**
- Modify: `tests/runtime/appkit-counterparts.test.ts`, `docs/framework/appkit-counterparts.json` (add `internalCounterparts: {}` and the extended `internalDerivedSuffixes`), `scripts/developer-mcp/lookup.mjs` only if it must ignore the new section
- Create: `scripts/quality/nse-internal-names.mjs` (prints every unmapped name with its declaring file and proposed disposition: `maps:<AppKit>`, `derived:<base>`, `rename:<new>`, `remove`), `docs/superpowers/evidence/2026-11-11-performance/nse-internal-names.json` (its output, reviewed by hand)

- [x] **Step 1:** Add the failing test with the current count pinned as a ceiling that may only fall: `expect(missing.length).toBeLessThanOrEqual(708)`; the final slice changes it to `toEqual([])`.
- [x] **Step 2:** Write the inventory script and commit its reviewed output. Rule 1 entries need a real AppKit name; when unsure whether AppKit has the type, treat it as rule 3. The existing test's counterpart pattern (`^(NS|AV|CA|CG|CT|WK|…)`) applies to the new section too.
- [x] **Step 3:** Commit: `Counterparts: cover internal NSE names and record the inventory`.

### Task 23: Apply the dispositions, one family per commit

- [ ] For each family in the inventory: rename with the TypeScript language service (not text replace), update tests, docs under `docs/framework/` and the site only where a name was reachable from it, lower the test's ceiling to the new count, run typecheck and the family's tests, commit `NSE: <family> internals take AppKit names or lose the prefix`. Start with `NSEGroupedList`/`NSEListItem`. Atmo CSS that mentions a renamed component in a comment is updated; selectors are not touched.
- [ ] Final commit sets the assertion to `toEqual([])`.

---

# Workstream G: Restructuring (proposal: nothing moves until the owner approves)

## Findings

- `src/SynCloudOS/` has 92 flat folders (two empty: `PolicyKit`, `styles`) and three loose files. Sizes range from 22 lines (`WorkspaceController`) to 20,316 (`AppSDK`) and 16,265 (`PlatformAdapters`).
- `src/SynCloudOSReact/` (41 files) is the React binding layer: providers, hooks, scopes, the browser runtime, system alerts.
- Test code in `src`: `src/FX/DispatchFX/__tests__/` (6 files, the only `src` path in `vitest.config.ts`), `src/FrameworkTests/` (7 files: the framework's end-to-end test host and routes, referenced by `src/App.tsx`, `build-sdk.mjs`, `sdk-package-manifest.mjs`, `architecture-boundaries.json`).
- Imports use relative paths and `tsconfig` path aliases for SDK entries (`tsconfig.app.json`, `tsconfig.sdk.json`, `scripts/synware/sdk-entries.mjs`, `scripts/quality/architecture-boundaries.json`). Every move must update all four.

## Proposed grouping of `src/SynCloudOS/` (Task 24)

Group folders are named for the Apple framework or system layer they correspond to. Folder names inside a group keep their current names unless a rename is listed.

| Proposed group | Apple counterpart | Folders moved in |
| --- | --- | --- |
| `Foundation/` | Foundation | `EventBus` (→ `NotificationCenter` is taken by user notifications today; propose `Notifications/` for the bus and see `UserNotifications` below), `Operations`, `Undo`, `Cache`, `Persistence`, `LocaleServices`, `Models`, `Config`, `Resources`, `Transfer`, `Identity` (bundle identifiers) |
| `AppKit/` | AppKit | `Windows`, `Documents`, `DocumentStore`, `Responders`, `Commands`, `KeyBindings`, `Focus`, `Pointer`, `Pasteboard`, `Drag`, `FilePanels`, `MediaPanels`, `ColourPanel`, `Appearance`, `Images`, `Preferences` (`NSPreferencePane`), `Settings` |
| `CoreServices/` | CoreServices, LaunchServices | `LaunchServices`, `AppRegistry`, `AppInfo`, `BundleLoader`, `InstalledApplications`, `AppManager`, `AppsController`, `Lifecycle`, `ApplicationState`, `ServiceRegistry`, `PluginRegistry`, `AssetManager` |
| `Security/` | Security, TCC, ManagedConfiguration | `Authorization`, `PolicyKit` (empty: delete), `PermissionManager`, `Privacy`, `ConfigurationProfiles` |
| `iCloud/` | iCloud account and services | `Authentication`, `AuthenticationServices`, `LoginServices`, `Server`, `Updates` |
| `UserNotifications/` | UserNotifications | `UserNotifications`, `NotificationCenter` (the user-facing notification centre), `BackgroundTasks` |
| `SpringBoard/` | the system shell process | `RootRuntime`, `BootManager`, `Statechart`, `WebspringState`, `Choreography`, `WorkspaceController`, `SystemUI`, `ResponsiveModeManager`, `Branding`, `ErrorManager` |
| `Routing/` | (no Apple counterpart: the web's own) | `Routing`, `RouteManager`, `WebContent` |
| `Runtime/` | the kernel | `Runtime`, `HostServices`, `HostContributions`, `PlatformAdapters`, `Performance`, `Diagnostics`, `Inspector`, `Developer` |
| `SDK/` | the app-facing SDK | `AppSDK`, `AppHosting`, `AppAuthoring`, `Testing` |
| moved out to `src/FX/<Family>/Host/` | each FX family | `AnimationFX`, `AudioFX`, `HapticsFX`, `LocationFX`, `LuminaFX`, `MIDIFX`, `MediaFX`, `MotionFX`, `TextFX`, `VideoFX` (host-side halves of FX families) |
| deleted | n/a | `styles` (empty) |

Open questions for the owner inside this table: whether `SpringBoard` is the name wanted for the shell group (alternatives: `Shell`, `WindowServer`); whether `Routing` stays its own group; whether the FX host halves move under `src/FX`.

## Proposed dissolution of `src/SynCloudOSReact/` (Task 25)

| Files | Binds to | Proposed home |
| --- | --- | --- |
| `browser.tsx`, `browserRuntime.tsx`, `browserHostContributions.ts`, `projectComposition.ts`, `virtualProject.d.ts`, `virtualThemes.d.ts`, `appRuntimeTypes.ts` | the browser host entry (`@syndromatic/syncloudos/browser`) | `src/SynCloudOS/Runtime/Browser/` |
| `SynCloudOSProvider.tsx`, `runtimeContext.ts`, `runtimeHooks.ts`, `serviceHooks.ts`, `siteBrandingContext.tsx`, `hostFontsContext.tsx`, `index.ts` | the runtime instance | `src/SynCloudOS/Runtime/React/` |
| `FocusScope.tsx`, `AppFocusScope.tsx`, `focusScopeContext.ts`, `focusVisibility.ts`, `nseFocusPort.tsx` | `Focus` | `src/SynCloudOS/AppKit/Focus/` |
| `ResponderScope.tsx`, `responderHierarchy.ts`, `commandHooks.ts`, `undoOwnerLease.ts`, `RuntimeInputBoundary.tsx`, `runtimeInputProtocol.tsx`, `nseMenuPort.ts` | `Responders`, `Commands`, `Undo` | beside each: `AppKit/Responders/`, `AppKit/Commands/`, `Foundation/Undo/` |
| `ApplicationHost.tsx`, `ApplicationHostTitlebar.tsx`, `InstalledApplicationTitleBar.tsx`, `ApplicationMenuTrigger.tsx`, `applicationHome.ts` | application hosting | `src/SynCloudOS/SDK/AppHosting/` |
| `SystemAlert.tsx`, `SystemAlert.transitions.ts`, `system-alert.css`, `SCOSAlertPresenter.tsx`, `Resources/AlertCautionIcon.png` | `SystemUI` | `src/SynCloudOS/SpringBoard/SystemUI/` |
| `QuickSwitchTrigger.tsx` | Webspring | `src/Webspring/` |
| `SynCloudOSNSEFontPanel.tsx` | the font panel | beside `ColourPanel` as `AppKit/FontPanel/` |
| `DevInspectorRegion.tsx` | `Inspector` | `src/SynCloudOS/Runtime/Inspector/` |
| `Resources/SynCloudOSLogo.png` | branding | `src/SynCloudOS/SpringBoard/Branding/` |

## Proposed removal of test code from `src` (Task 26)

| From | To |
| --- | --- |
| `src/FX/DispatchFX/__tests__/*.test.ts` | `tests/runtime/fx/dispatch/` (drop the `src/…` line from `vitest.config.ts`) |
| `src/FrameworkTests/` | `tests/e2e/host/` (update `src/App.tsx`'s import or, better, give the e2e Vite config its own entry so `src/App.tsx` no longer imports test routes; update `build-sdk.mjs`, `sdk-package-manifest.mjs`, `architecture-boundaries.json`) |
| `src/SynCloudOS/AppSDK/testing`, `src/SynCloudOS/Testing` | stay (owner decision 6) |

Webspring stays at `src/Webspring/`.

### Tasks 24–27: Execute after approval

- [ ] **Task 24:** one commit per group in the first table (`git mv`, then fix imports with the TypeScript language service, then the four alias files). After each: typecheck, boundaries, full suite. Commit: `Structure: group <Group> under its counterpart`.
- [ ] **Task 25:** one commit per row of the second table. Commit: `Structure: move <what> beside <where it binds>`. The last commit deletes `src/SynCloudOSReact/` and its alias entries.
- [ ] **Task 26:** two commits. Done when `find src -name "__tests__" -o -name "*.test.*" -o -name "*.spec.*"` prints nothing and `src/FrameworkTests` is gone.
- [ ] **Task 27:** `docs/framework/project-structure.md` and `README.md` describe the new layout; `npm run sdk:build` and every `sdk:*` consumer check pass; packaging 8/8.

**Done for G:** `ls src/SynCloudOS` shows the approved groups only; `src/SynCloudOSReact` does not exist; no test code under `src` (as decided); SDK entry paths, the public package exports and every installed-consumer check are unchanged; baseline 123/123.

---

# Final acceptance

### Task 28: Whole-job verification and vendoring

- [x] **Step 1:** `tests/runtime/fx/dispatch-packed.test.ts:60` writes its receipt to `.artifacts/dispatchfx/task-6-installed.json` instead of the tracked evidence file (test first: assert the tracked file's bytes are unchanged after the test runs). Commit: `Tests: the packed Dispatch receipt is a build artefact`. Do not stage the evidence file.
- [ ] **Step 2:** typecheck, `typecheck:authoring`, `typecheck:contracts`, boundaries, full Vitest, packaging, `npm run sdk:build`, the `sdk:*` and `fx:installed` checks. Record counts.
- [ ] **Step 3:** Baseline: 123 passed, with the snapshot directory's `git status` clean and `baseline-sha256.json` unmodified (`git diff --stat` shows neither).
- [x] **Step 4:** Vendor without `--allow-dirty`, per owner decision 2: clean detached checkout of `HEAD` in the scratchpad, `npm ci` there, `npm run framework:sync -- <that path>` from the site. The receipt must have no `dirty` key. Remove the temporary worktree with `git worktree remove`. The 14 November single-tree run instead used the clean shared checkout as directed.
- [x] **Step 5:** Site: `npm run check`, `npm test`, `npm run check:boundaries`; restart 5387 with `--force`; run the harness; write the before/after table for every workstream target into `docs/superpowers/evidence/2026-11-11-performance/REPORT.md`. Stop anything started on 5377.
- [x] **Step 6:** Commit the report (framework) and the site adoption (site: `package.json`, `package-lock.json`, `vendor/framework-receipt.json`, the new archive, the removed old archive) as two commits. Do not push.

## Order of work

1. Task 1 (harness), then A: Tasks 2 → 3 → 4 → 5 → 6.
2. B: Tasks 9 → 10.
3. C: Task 11.
4. D: Tasks 12 → 18.
5. E: Tasks 19 → 20 → 21.
6. F: Tasks 22 → 23.
7. G: Tasks 24 → 27, only after approval. It goes last because it moves every file the other workstreams edit.
8. Task 28.

(Task numbers 7 and 8 are unused.)

## Resume notes

Add one line per stop: date, last commit, next unchecked box, anything a successor could not infer.

- 2026-11-11: plan written at `90e7fbf9`; no source changed. The planning harness scripts live only in the session scratchpad; Task 1 rewrites them from its description.
- 2026-11-12: Tasks 2, 3, 4 and 9 done at `b358da22`. Next: Task 10, then Task 5. Things a successor could not infer:
  - The site dev server for the harness is `npx vite --config vite.local-auth.config.mts --host 127.0.0.1 --force` in the site worktree (port 5387 comes from that config). The plain config has no local sign-in.
  - The site worktree currently holds an experimental `--allow-dirty` vendoring of `b95e5e3c` (`package.json`, `package-lock.json`, `vendor/`). The files as they were before are saved in the session scratchpad under `site-backup/`; Task 28 replaces the experiment with a clean vendoring.
  - Task 4 missed two targets, carried into Task 5: cold gallery style 571 ms (target ≤ 480) and launch About style 74.5 ms (target ≤ 60). Gallery full recalc (53 ms) and section mean (87 ms) are met; the digest shows 0 differences.
  - Do not edit framework source while the baseline spec runs: Vite reloads the page and the step fails with "Execution context was destroyed". Baseline with theme-nesting is 177 tests over three projects.
  - Shell heredocs in this environment halve backslashes; write files that contain `\:` with the Write tool.
- 2026-11-12: Tasks 5, 6, 10 and 11 done at `3de36cac`. Next: Task 12. The site worktree's experimental vendoring is now of `3de36cac`. Packed-SDK tests fail with "SDK source changed" after any source edit until `npm run sdk:build` is rerun; that is not a regression.
- 2026-11-13: Workstream D (Tasks 12–18) done at `9692e3a6`; Task 22, Task 19 steps 1–2 and Task 28 step 1 picked from a second agent's branch (`gemini/handoff-tasks`, worktree `.worktrees/gemini/fw`) at `9bf9dbc5`. Next: Task 19 step 3 (run the harnesses, write the inventory), then Task 23. Things a successor could not infer:
  - `30752974` (the store ignoring a write of the held value) was reverted in `5909e60c`: it broke `controller-route-observation` (a route committed again at the same path must still notify). The hover churn is now stopped in `WebspringState.hoverApp`. The hover-sweep numbers in the evidence README were measured with the old fix and must be measured again.
  - The state-machine primitive lives at `src/Foundation/internal/StateMachine.ts` (every layer may import Foundation). Task 16 departs from the plan: history records are always kept and an out-of-order step is marked with a note, not dropped. The launch-phase and page-turn tables record today's permissive behaviour.
  - `tests/runtime/state-machines.test.ts` is the guard: a phase field written outside its machine file fails it.
  - Task 22's inventory dispositions are mechanical (mostly "strip the NSE prefix"); they are not approved names. Classify by hand in Task 23.
  - The second agent's DispatchFX commits (plan Tasks 7–10: `e52626dd`, `c0cf51b3`, `044efbde`, `914ae3fb`) are reviewed but not picked: 9 and 10 have eight requested fixes (absolute paths in closure IDs, unresolved imports treated as worker-safe, transpiled module replacing Vite's output, and others).
  - `npm run fx:installed` fails at this head without any DispatchFX work (family list 13 against the manifest's 22). Not caused by this job; raise with the owner.
  - Two unit tests time out when run alone and are not understood yet: `theme-bundles` "rejects too many resource files" (about 10 s against 5 s) and `document-asset-browser` (`page.goto` 30 s). Neither file nor its subject was edited in this job.
- 2026-11-13 (later): owner-reported regressions fixed at `9e2f75f2`, the launch leak at `f2bc2507`. Next: Task 19 step 3 (write the inventory), then the remaining heap growth below. Things a successor could not infer:
  - The frozen baseline runs the source host, so it cannot see a packaged-only fault. Three of the four regressions were packaged-only or site-only: a selector tie decided by stylesheet order (colour panel), the theme loaded once per published stylesheet entry (14 MB of CSS in Publisher, now once), and a popover outside an app's own colour panel provider. A packaged-build visual check is still missing; propose one to the owner.
  - Probes for the site live in `.artifacts/` (untracked): `colour-probe.mjs`, `fonts-probe.mjs`, `alert-probe.mjs`, `sheets-probe.mjs`, `retainers.mjs` (shortest retaining path to detached DOM), `heap-diff.mjs` (classes that grow per cycle).
  - `DOM.getDetachedDomNodes` pins every tree it reports. Never sample with it between cycles; `scripts/perf/heap-cycles.mjs` reads counters only since `cc751092`.
  - Launch and return of About, ten cycles, site dev build: before `f2bc2507` +439 DOM nodes and about +152 listeners per cycle; after it DOM nodes +0, listeners about +3, JS heap about +0.36 MB per cycle (3.26 MB over nine cycles, above the plan's 2 MB bar). The rest is not traced: per-launch app client closures (`requestAuthorization`, `observeAccessLoss`, `bindResource`, pasteboard `snapshot`) accumulate in WeakMap-held tables, and dev-only stack frames add to it. Trace it against an unminified build.
  - The same trace showed two bounded holders, not growth: the runtime root's focus tracker keeps the last focused element after it is removed (one application stage stays alive until focus moves), and the site's About particle canvas is held by its manager.
  - A stopped background Vite on Windows leaves its node process on 5387; find the PID with `netstat -ano` and stop it before starting another.
  - A third agent (Sol) audited read-only: its four DispatchFX runtime faults (barrier overtaking, crossed continuations between batches, stranded siblings after a clone failure, cancelled items still continuing) gate picking the second agent's Tasks 7–10, now with fix commits `33b085a7` and `9f67556c` that are not yet reviewed here.
- 2026-11-13 (inventory): Task 19 done; the inventory is `docs/superpowers/evidence/2026-11-11-performance/dispatch-benchmarks.md`. No scenario has a "move to DFX" row. Two fix-in-place slices are proposed and not started: the 1.7 MB PDF chunk is evaluated on every page through a bare import in each entry, and the safe-area layout hook forces style once per view. The route session leak is fixed at `22cb33ce` (heap +2.64 MB over ten About launches, still over the 2 MB bar). The full suite and the frozen baseline have not run since `f2bc2507`; run both before picking anything else.
- 2026-11-13 (pause for the rate limit, head `ceedbd87`): a full Vitest run then the frozen baseline were started in the background on this head; their logs are `.artifacts/vitest-ceedbd87.log` and `.artifacts/baseline-ceedbd87.log`, each ending in an `…_EXIT=` line. Read those first. While paused, the auditing agent (Sol) was asked to write the remaining leak fixes on its own branch `sol/leak-fixes` in its own worktree: `NSEMenu` (and `NSEMenuView`, `NSEMenuBar`) subscribing in the constructor, the vibration probe's media-query listener (one per About launch, also in production), and launch options held by the diagnostic history. Review and cherry-pick those, re-measure the heap, then pick the second agent's DispatchFX commits `be58f9d6`…`7f1711f1` (all cleared by Sol). `cfea4baa` is a deliberately failing test and waits for the owner's cancellation policy; never pick it alone.

- 2026-11-13 (Sol integration from `11917466`, source head `f01074fb`): review `sol/integration` in `C:/Users/Kavish Krishnakumar/.codex/worktrees/sol-integration/framework`. The owner’s site and Fable’s checkout were left in place. No push.
  - Leak fixes, in commit order: `bdd86605` makes ApplicationHost, NSEMenuView and NSEMenuBar attach the menu and controller-lifetime abort listeners in the insertion effect. StrictMode tests check that discarded renders and real unmounts leave no listeners. `0c370c52` makes the browser media-query change listener follow the subscriber count. The test covers a one-shot read, first/last subscription, resubscription and disposal. `98420277` reuses the existing launch-history projection for the requested-event history while keeping the original event for live listeners. The test checks the live options by identity and the diagnostic options by value.
  - DispatchFX cherry-picks in order (source → integration): `be58f9d6 → 9f62cbb1` benchmark fixture and baseline, `383e3b1d → 296b3cd1` pool width, batching, reuse and Chromium module worker, `04d91038 → 1352dc20` closure conversion and rejection fixtures, `2c58d313 → c6a5f48d` Vite and packed Chromium worker execution, `4d438c93 → 85e30dc5` reproducible IDs, transitive safety, JSX and source maps, `2d1534a0 → 28a4d6d3` worker errors, bundle scope and HMR, `db22c1e7 → 56736546` barrier order, `09f75733 → b372ffe0` serial batches and per-job continuations, `bdc76ed0 → 830ce8ce` clone and constructor failures, `ba15c4de → 2cd5af32` session-scoped cancellation, `46df5f3b → 745ab100` original target barriers after retargeting, and `7f1711f1 → 5266bf07` clone-only retry, reentrant cancellation and draining after a throwing callback.
  - `d2147e06` folds in the `cfea4baa` regression with the owner’s session-affinity policy. The pool prefers a healthy same-session slot, then idle capacity, then a new worker, then a shared slot. Existing QoS limits and serial-lane ordering still apply. Tests force sharing and verify one `DFXWorkerInterruptedError` for the live sibling with no replay. With room in the pool, the other session keeps its worker and delivers its result. `DFXWorkerInterruptedError` is internal to WorkerPool. The work-item error keeps it as its cause. The existing public DispatchFX entry was not extended.
  - `f01074fb` applies the same menu fix to Webspring’s ApplicationStageView. This was the source of the remaining two listeners per dev cycle after the first three fixes. Weak abort-listener instrumentation traced both callbacks to this constructor. Its StrictMode test failed before the change and checks the pre-render listener count after unmount.
  - Other render-time subscribers, listed for separate review: `src/NSE/DataViews/Core/useNSEDataView.ts:67` (`NSEDataViewCoordinator.ts:99` and `:106` subscribe to controller disposal and changes), `src/SynCloudOSReact/SynCloudOSProvider.tsx:73` (mounted animation layers register an abort listener through `src/SynCloudOS/HostServices/mountedResourceScope.ts:106`), and `src/NSE/Colour/ColourPanel/NSEColourPanelProvider.tsx:62` (`NSEColourPanelController.ts:76` binds lifetime when an external owner is supplied).
  - About rerun used the isolated copy of the site and unminified builds with React dev and production modes. No detached-node queries. Across cycles 1 to 10, V8 heap was +3,509,284 B dev and +2,522,636 B production. Across cycles 2 to 11, it was +2,909,708 B dev and +2,006,912 B production. DOM stayed at 4,555 dev and 4,505 production. Listeners stayed at 927 in both. No page errors. The plan’s cycle-1-to-10 2 MB heap target remains open. Clearing the dev performance measures at cycle 11 released 820,204 B of V8 heap and 2,531,240 B of embedder heap in that run, including measures from startup. Before changing more code, measure a longer production run with a warmed baseline and compare heap categories.
  - The normal SDK build emitted the archives. The isolated unminified SDK build emitted its modules and then rejected an absolute path in the PDF worker asset, as it did before these fixes. The isolated site production build succeeded from those modules. Raw heap and listener logs are in this worktree’s `.artifacts/sol-heap-*.log`.
  - Verification on `f01074fb` so far: `npm run typecheck`, `npm run boundaries:architecture` (1,829 files and 8,366 edges), `npm run sdk:build`, and `node --test scripts/synware/dispatch/__tests__/closureConversion.test.mjs` (48 tests) passed. The 12 original and extended DispatchFX probes passed, including forced sharing with the typed error. The 2,648 frozen PNG digests matched. See the verification results below for the larger suites.
  - The 36-cycle production run kept DOM and listeners flat. V8 heap grew 1,559,576 B from cycle 10 to 36. Navigation history stopped growing at 50 entries. A separate snapshot run at cycles 10, 25 and 40 showed that V8 instruction streams, trusted byte arrays and related compiler storage dominated the remaining shallow-size growth. From cycle 25 to 40, those first two categories added 868,224 B of 1,163,536 B total snapshot growth. About controllers, sessions, app-client closures, media-query lists and listeners stayed flat. The 2 MB acceptance target remains open. Logs are `.artifacts/sol-heap-prod-long.log`, `sol-heap-prod-warm.log` and `sol-heap-prod-census-25-40.log`.
  - The final focused command and full file list are in `.artifacts/sol-focused-vitest-final.log`. It passed 611 of 612 tests. The declaration case failed because the first handoff commit landed while its package build was fingerprinting HEAD. The isolated declaration rerun passed. An earlier concurrent focused/full attempt also collided on the same SDK output directory, so keep those runs serial. `npm test` finished with 9,948 passed and one failure (1,038 passing files). `tests/performance/text-primitives-performance.test.ts` exceeded its 30-second timeout in the full suite and on both isolated branch reruns. A clean archive of base `11917466` passed that case in 29.82 seconds with the same dependencies. The text implementation and test are unchanged by this branch. Investigate the timing before attributing it to the integration. See `.artifacts/sol-full-vitest-final.log`, `sol-sdk-declarations-rerun.log`, `sol-text-performance-idle.log` and `sol-text-performance-base.log`.
  - The visual command `npx playwright test theme-baseline theme-nesting --workers=1 --trace off` hit Vite’s stale dependency cache on the first attempt. A disposable Vite server on 5857 used its own cache and pre-bundled React and fontkit. Its first complete run had 174 passes and three failures, all of which passed on targeted reruns. The full retry with `--retries=1` passed 177/177 on the first attempt of each test. All 2,648 frozen PNG hashes matched. The visual scripts and frozen files were unchanged. See `.artifacts/sol-frozen-baseline-complete.log`.
  - `node scripts/perf/dispatchfx-bench.mjs --workload mandelbrot --runs 1 --isolated` passed as a Chromium smoke test. It is a single run and does not establish a speedup. All temporary listeners on ports 5847, 5848 and 5857 were stopped. The test-generated untracked receipts and review image were moved to `.artifacts/sol-test-evidence/`. The tracked Task 6 receipt, baseline manifest and snapshot directories have no diff against `11917466`.
  - Next review the branch, investigate the outstanding heap and text performance gates, and keep the three remaining render-time subscribers as a separate slice. Plan Task 23 and site vendoring remain pending.

- 2026-11-13 (Sol follow-up from `9e2c8fa5`, source head `47460688`): review `sol/integration` in the same worktree. Fable's free-worker-first admission correction is in the base. WorkerPool, safe-area and PDF files, the site and the owner’s preview ports were outside this slice.
  - `7555399b` connects a React-owned NSEDataViewCoordinator in the insertion effect. Its StrictMode test held two extra subscriptions before the change and returns to its pre-render count after unmount. The imperative coordinator path keeps eager observation.
  - `3b3abfaa` connects the shell animation layers to the runtime signal at insertion commit and revokes the scope’s live leases at cleanup. The StrictMode test held two extra listeners before the change and returns to its pre-render count after unmount. AppSDK-created layer scopes keep their runtime-owned lifetime.
  - `f1024631` attaches the colour panel controller’s owner observer at insertion commit, releases it synchronously, and retains the existing deferred disposal of panel registrations. Its StrictMode test had one extra listener before the change and returns to its pre-render count after unmount.
  - `47460688` makes a menu’s React effect cleanup reversible. It releases both owner subscriptions, cancels presentation work and leaves the controller available for replay. Explicit disposal and owner abort remain terminal. The regression restarts the insertion effect with the same menu and opens it, then checks for listeners after unmount.
  - Text profiling used a temporary Vitest setup that runs Node Inspector around the existing test. It passed in 17.15 seconds and sampled 17.13 seconds. Inclusive time was 16.07 s in the layout adapter, 15.96 s in the framesetter, 14.29 s in `TFXTypesetter.suggestLineBreak`, 11.86 s in `createLine`, and 3.13 s in `TFXFont.shape`. These inclusive samples overlap. The candidate loop at `src/FX/TextFX/TFXTypesetter.ts:463` shapes each prefix to find a fitting line. The same loop has linear run lookups at lines 151 and 459. Those are existing costs. Neither the test nor that path changed in this slice, and this run did not reproduce the earlier 30 s timeout. Leave TextFX unchanged. If the gate recurs, compare unprofiled base and branch runs with the same host load before changing line breaking or signal checks. Logs are `.artifacts/sol-text-inspector.log` and `.artifacts/sol-text-profile-summary.log`.
  - Heap follow-up reused the earlier production snapshots at cycles 25 and 40, taken before the current slice. Of 770,624 gross bytes in 236 newly seen instruction streams, 770,176 B had a direct closure owner with a SharedFunctionInfo already present at cycle 25. For 756,864 B the same closure object was present at both checkpoints. The largest new streams belong to the already-loaded `NSEFontPanel` (99,072 B, `src/NSE/Typography/NSEFontPanel.tsx:317`), `WebspringHost` (49,856 B, `src/Webspring/WebspringHost.tsx:159`), `NSEColourPanel` (26,496 B, `src/NSE/Colour/ColourPanel/NSEColourPanel.tsx:138`) and `NSETabBar` (25,856 B, `src/NSE/Navigation/NSETabBar.tsx:196`). No attributed SharedFunctionInfo gained multiple newly seen streams. The bulk is code replacement or tier-up in existing functions. This comparison does not establish the precise V8 tiers or explain every trusted-byte-array allocation. There is no evidenced per-launch compile factory to fix. See `.artifacts/sol2-code-existing-closures.log` and `.artifacts/sol2-code-trusted-bytes.log`. The About heap acceptance number was not remeasured in this slice.
  - Serial verification at `47460688` passed `npm run typecheck`, `npm run boundaries:architecture` (1,829 files, 8,366 edges), `npm run sdk:build`, focused Vitest (42 files, 701 tests), `node --test scripts/synware/dispatch/__tests__/closureConversion.test.mjs` (48 tests), and `npm test` (1,039 files, 9,955 tests, including the text case under its original timeout). Exact focused selectors are at the start of `.artifacts/sol2-focused.log`. After Vitest exited, `npx playwright test theme-baseline theme-nesting --workers=1 --trace off --retries=1 --output .artifacts/sol2-visual-results` passed all 177 tests on their first attempt. The isolated Vite server on 5859 used a private cache and was stopped. All 2,648 frozen image hashes matched and the Task 6 tracked receipt has no diff. Generated test evidence was moved to `.artifacts/sol2-test-evidence/`.
  - Next review these commits and decide whether to rerun the About heap gate after the parallel safe-area and PDF work. This slice leaves the heap gate, site adoption and Task 23 open.

- **PINNED for discussion with the owner (2026-11-13):** why the `.scostheme` work shipped a rule that locked control sizes. `src/NSE/Structure/limits.css` (added `68c26ed7`, 9 November, "the theme hook vocabulary and structural limits") set `min-inline-size` and `min-block-size` to `max(24px, var(--nse-control-minimum-*))` with `!important`, and Atmo publishes each bezel's natural size in those variables (76 by 52 for a push button, 50 high for a textured one). The intent was that a theme cannot shrink a control below its interaction area; the effect was that an app's own stylesheet could no longer size a control at all, because an important declaration in a layer beats unlayered app CSS. Only an inline `style` minimum got through (`nseMinimumControlProperties`). The same work renamed the ancestor hook `data-nse-appearance="atmo"` to `data-nse-theme="com.syndromatic.atmo"` without the site's selectors following. Both went unseen because the frozen baseline renders framework specimens, not an app with its own CSS: Journal's 50 by 38 home and settings buttons became 76 by 50 and the settings button overflowed its bar. Questions to settle: who is protected from whom (theme from itself, or app from theme), whether the 24px floor belongs in the theme validator, and whether the baseline needs an app-authored specimen.

### 2026-11-13 — Sol integration at de1352dc

- `3cceafc1` moves committed safe-area reads into a shared layout reader under `SynCloudOSProvider`. A layout update schedules that reader even for a child-only commit. The reader gathers all queued geometry before applying it in the same synchronous update chain. A StrictMode test places a layout write between siblings and checks both values immediately after the update. A second test changes a CSS transform between synchronous commits and checks that layout coordinates still win. Direct NSE rendering outside the runtime provider retains its synchronous local measurement and short-lived ancestor cache. Two existing standalone measurement-cost tests caught the initial loss of that cache. ResizeObserver notifications retain their own path.
- The layout model in `src/NSE/Layout/windowChromeObstructions.ts` carries bounds, insets and direction. `src/Webspring/AppViewChrome.tsx` drives frame and content animations separately, and authored CSS can independently transform a view. The read pass therefore keeps computed-style detection, with answers scoped to a single pass.
- On the same isolated site copy at port 5861, `node scripts/perf/style-recalc.mjs --base http://127.0.0.1:5861 --runs 3 --cpu` completed for `de1352dc` and the final framework source. Full CPU profiles from a scratch copy of that harness were attributed through each SDK's source maps. Median inclusive time in the safe-area measurement function across the complete scenario was 566.5 → 24.1 ms on cold gallery load, 120.2 → 32.0 ms for Tables & Trees, 139.6 → 7.7 ms for Buttons, and 65.1 → 12.4 ms for Menus & Popups. Total style time in the unmodified harness was 708.9 → 758.0 ms, 132.8 → 134.2 ms, 132.0 → 173.6 ms, and 48.5 → 50.6 ms respectively. The hook's measured gain is consistent across these four scenarios. The final profile ran alongside full Vitest. Total style time, script time and longest tasks varied between runs, so the improvement claim is confined to the hook. An earlier run of the batching path, before restoring the standalone cache, also found higher total style time for Buttons (132.0 → 175.8 ms). Both runs recorded the same element counts and no page errors. Logs and profiles start with `.artifacts/sol3-style-`. The scratch site server was stopped.
- `25b76297` keeps the order of Unicode break candidates and the first-overflow decision. It measures eligible horizontal LTR Latin text from shaped advances at HarfBuzz-safe cluster boundaries, with a progressively larger sample when needed. Other candidates use the existing line builder. Attributed-run lookup visits the relevant runs only. Generated paragraphs compare exact offsets with the old walk across width thresholds, mixed scripts, vertical and RTL layout, tabs, features and hard breaks. The shaping-call test failed at 110 calls on the old path and now passes with a ceiling of five. The unchanged 100,000-unit test took 2.688 s in the expanded suite. Earlier controls on the identical text code included a 29.82 s test run and a 17.13 s sampled run. In the sampled run, 14.29 s was inclusive in `suggestLineBreak`, 11.86 s in `createLine` and 3.13 s in `shape`. The inclusive times overlap.
- `a0df51a9` tests the current validator's rejection of explicit regular and large selectors with any of the four minimum-size properties set to 23.5px. The validator and frozen baseline are untouched. Extend the check in `scripts/synware/theme-bundles.mjs:201`, with parsed selector branches and declarations from the rule at line 266, and take the threshold from `scripts/synware/build-theme-contract.mjs:25`. Apply it to the subject's interactive surface when it can match a regular or large control, including unqualified selectors and an unrestricted branch of a selector list or `:is()`. An ancestor's size or a negated predicate should not count as a positive size constraint. Check physical and logical minima. Permit a theme sizing token with a known lower bound of 24px and reject a direct override whose lower bound cannot be proved, including zero, negative lengths and unresolved calculations. Keep natural-size tokens that are already clamped by structure and theme paint parts outside that check. Add table cases beside the existing test at `tests/runtime/theme-bundles.test.ts:17`, including exact 24px, explicitly small-only selectors, selector lists and dynamic values.
- For a future approved addition to the frozen baseline, add an app specimen near `tests/e2e/fixtures/theme-baseline/catalogue.tsx:113`. Render Home and Settings using two public `NSEButton` instances with textured bezels in a 38px-high bar. Import an ordinary app stylesheet using app-owned classes for 50 × 38px sizing, with no inline dimensions or important declarations. Include a style keyed by the public Atmo theme ancestor attribute. Assert both button boxes, both buttons fitting inside the bar, and an edge click or keyboard focus to distinguish hit area from paint. Include light and dark and run the existing DPR and reduced-motion projects. Keep a stock regular button nearby to assert the theme still supplies its natural size. Add the specimen and its initial reference only in an approved baseline extension.
- The isolated text performance test, run serially through the same Node and Vitest command, timed out on the `de1352dc` archive at 31.37 s under its 30 s limit (32.26 s process wall time). It passed in 2.47 s on the branch (3.33 s process wall time). The archive used `npm ci --ignore-scripts`. Raw results are `.artifacts/sol3-text-before-isolated.log` and `.artifacts/sol3-text-after-isolated.log`.
- `npm run typecheck`, `npm run boundaries:architecture` (1,829 files and 8,369 edges) and `npm run sdk:build` passed. The SDK build continued to report the existing Rollup circular-chunk warnings. Expanded focused Vitest passed all 179 tests across 28 files for safe areas, window chrome, theme bundles, the TextFX runtime and the text performance case. DispatchFX runtime and worker suites passed all 211 tests across 10 files. The DispatchFX source and packaged SDK batch passed 213 tests across eight files. `node --test scripts/synware/dispatch/__tests__/closureConversion.test.mjs` passed all 48 tests. Exact Vitest file lists appear in the first lines of `.artifacts/sol3-touched-expanded.log`, `.artifacts/sol3-dispatch-expanded.log` and `.artifacts/sol3-dispatch.log`.
- `npx playwright test theme-baseline theme-nesting --workers=1 --trace off --retries=0 --update-snapshots=none --output .artifacts/sol3-frozen-serial-results` passed all 177 tests in 14.9 min. The first run was stopped after a highlighted-button mismatch while Vite reloaded for a packaging fixture. The base control and the clean full run both passed that partition on their first attempts. The clean run used the isolated fixture server on 5862, with package tests finished, and all 2,648 image hashes matched the frozen manifest. The base control used port 5863. Both servers were stopped and the generated plain-login capture was moved into `.artifacts/`. See `.artifacts/sol3-frozen-serial.log` and `.artifacts/sol3-baseline-hashes.log`.
- The first full Vitest run passed 9,959 tests and failed the two standalone ancestor-read tests. After restoring the standalone cache, both passed in the focused rerun. On the corrected source, typecheck, boundaries and SDK build passed again, followed by the six-file focused run (71 tests) and `npm test` (1,039 files, 9,961 tests in 28.6 min). See `.artifacts/sol3-full.log`, `.artifacts/sol3-focused-final.log` and `.artifacts/sol3-full-final.log`. Generated installed-test receipts were moved to `.artifacts/sol3-full-test-evidence/`.
- The final frozen run started after the corrected full Vitest run completed. The same Playwright options with `--output .artifacts/sol3-frozen-final-results` passed all 177 tests on their first attempts in 15.8 min. All 2,648 image hashes matched again and all three isolated ports were closed. See `.artifacts/sol3-frozen-final.log` and `.artifacts/sol3-baseline-hashes-final.log`.


### 2026-11-13 — Fable handoff: single tree

- **One tree from here.** `sol/integration` (`3cceafc1`, `25b76297`, `a0df51a9`, `c56217b7`) is cherry-picked onto `fix/blind-rewrite-friction`. The Codex and Gemini worktrees are removed. `gemini/handoff-tasks` keeps one commit not on this branch, `cfea4baa` (a test exposing a sibling failure on the cancellation grace timeout); DispatchFX Tasks 11–16 are still the owner's call. Nothing is pushed.
- **Focus.** `6a33d773`: an app's `focus.requestFocus` for a responder that has left the hierarchy answers `missing`; another app's responder is still refused. This matches the owner's quick-switch crash report, which was never reproduced.
- **Metal thumb.** `23e4e5b3`, `19e993a6`, `d28420e0`, `cbb155e8`: four cones with a counter-rotating sheen, a centred baked ring texture, and lighting that takes the held pose as rest and answers a turn away from it.
- **MotionFX.** `cd9a2c65` and `5afec1a3` take Core Motion's reference-frame names, fix `multiplyByInverseOf` and remove `resetReferenceFrame()`. `ec6a5609` fixes dead tilt on Chrome 158 for Android: the browser adapter read the presence of `DeviceOrientationEvent.requestPermission` as "permission required" and discarded every event. A delivered sample now counts as authorisation. Confirmed on the owner's phone. Accelerometer, gyro, recorder and authorisation names are not yet audited against Core Motion.
- **Site.** `prerelease` has `832ad22`; the vendored framework is installed with `--allow-dirty`. Task 28 (clean vendoring, restoring site files from the scratchpad backup, final report), Task 21 and Task 23 remain.
- **Open with the owner:** the heap bar interval, Workstream G names, the `fx:installed` failure, the `fx/graphics` PDF split, the tentative `sheetHasFullSizeContentView` name, the pinned control-size-lock discussion above, and Sol's validator and baseline-specimen proposals.
- **Verification on `1ca29e01`:** typecheck and SDK build passed. `npm test` passed 9,965 of 9,967; `document-asset-browser.test.ts` (Chromium IndexedDB case, 60 s) and `theme-bundles.test.ts` ("rejects too many resource files", 5 s) time out, also when run alone. Both failed in this tree before these commits and passed in Sol's worktree, so the cause is probably this tree's environment; unconfirmed. The frozen baseline was still running when this note was written; see `.artifacts/final-baseline.log`.
- **Frozen baseline on `1ca29e01`:** 111 passed, 66 failed. Every failure is one of 11 metal-thumb surfaces (`switch-metal-*`, `slider-circular-*`) across light, dark and the three projects, which is the owner-requested four-cone redesign. Nothing else differs. The snapshots and `baseline-sha256.json` are untouched; refreshing those 11 surfaces needs the owner's approval.
- **Owner approvals (2026-11-13, in chat with Fable):**
  - **Refresh the baseline for the metal thumb.** The owner approves the new metal look. Regenerate the reference images and `baseline-sha256.json` entries for the 11 metal-thumb surfaces only (`switch-metal-on-enabled`, `switch-metal-off-enabled`, and the nine `slider-circular-{mini,small,regular}-*` surfaces), in light and dark, for all three projects. Confirm first that a fresh run still fails on exactly those 66 and nothing else, then confirm 177 of 177 afterwards. No other snapshot may change.
  - **New request: motion-lit metal on the login window.** The owner would like the login window's metal to answer device tilt the way the metal thumb does, starting only after the opening animation has finished playing smoothly. Reuse the shared `NSEMaterialLighting` port from `SynCloudOSProvider` (one MotionFX manager, off under reduced motion) rather than a second subscription. The login plate's rings are in `plate-texture.webp`, centred near (416, 187). This is a design change: propose the treatment to the owner before building it, and expect it to change the login baseline surfaces.

### 2026-11-14 — Sol single-tree verification

- Source was verified at `f6f9c4d6` on `fix/blind-rewrite-friction` in the shared framework checkout. Grouped rows (`076759a2`), virtualisation (`3811a5b8`) and smooth surfaces (`f6f9c4d6`) lowered the internal-name inventory from 694 to 646. Each passed typecheck and its focused suites. Task 23 remains open. The next family is 49 private page-curl names. The scratch SDK export scan is `.artifacts/single-tree-names-export-audit.json` and the preview lists 520 edits across 17 files.
- Task 21 remains open. An annotated system-queue job ran in the Chromium window. The framework system lifetime has no worker entry, input-transfer ownership or cooperative per-job cancellation. The PDF and Lumina workers already showed no long tasks of at least 50 ms in the probe. The proposed implementation and individual workload limits are in the report.
- Clean vendoring is committed at site `9010f16`. The receipt has no `dirty` key and records framework `f6f9c4d6`. Typecheck, boundaries and 438 site tests passed with the existing caller edits. The committed site's callers of removed SDK exports still depend on those edits. The local Vite preview is on `127.0.0.1:5387`.
- Framework typecheck, contracts, architecture, packaging, direct SDK build and six SDK consumer checks passed. Full Vitest passed 9,965 of 9,967 with the two timeouts recorded on the base. The frozen rerun passed 111 of 177, with the 66 expected metal-thumb differences and zero retries. All 2,648 reference hashes matched. Both installed-FX modes stop at the manifest family check. The developer MCP consumer still reports undrawn theme parts.
- The ten-cycle dev heap grew 2.58 MiB with flat DOM and listener counts. The three gallery style targets passed in the plain dev trace. About and QuickSwitch still miss. MotionFX and login-plate proposals await review.
- The report carries the commands, measurements and follow-up requirements. [Performance report](../evidence/2026-11-11-performance/REPORT.md)
