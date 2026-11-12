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

- [ ] **Step 1: Write the failing tests** in `tests/runtime/hook-mirror.test.ts` and extend `selector-performance.test.ts`:

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
- [ ] **Step 2:** Run `npx vitest run tests/runtime/hook-mirror.test.ts tests/runtime/selector-performance.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `hook-mirror.mjs` and the rewrite. `rank()` already treats `ClassSelector` as rank 1, so rewritten selectors sort first without further change.
- [ ] **Step 4:** Run the two test files and typecheck. Expected: PASS. **Commit order:** the runtime mirror (Task 3) and the observer and helper (Task 4, steps 1–3) are committed first, because classes without rewritten CSS are harmless while rewritten CSS without classes draws nothing; this task's rewrite is committed after them, so every commit draws correctly.
- [ ] **Step 5:** Commit: `Style performance: rewrite contract attribute selectors to mirror classes`.

### Task 3: Synchronous mirror in the JSX runtime

**Files:**
- Create: `src/NSE/Theme/contract/hookMirrorJSXRuntime.mjs`, `hookMirrorJSXDevRuntime.mjs` (plain ESM so an installed package serves them unbuilt), `src/NSE/Theme/contract/hookMirrorReact.ts` (mirroring `createElement` and `cloneElement` for the six framework files that build host elements without JSX), `scripts/synware/hook-mirror-jsx.mjs` (`resolveHookMirrorJSX(id, importer)` and a standalone `hookMirrorJSX()` plugin)
- Modify: `scripts/synware/vite-plugin.mjs` (call `resolveHookMirrorJSX` first in `resolveId`), `scripts/synware/build-sdk.mjs` and `sdk-package-manifest.mjs` (ship the four modules beside `vite.mjs`; no new package export), `vitest.config.ts` (`plugins: [hookMirrorJSX()]`)
- Test: `tests/nse/hook-mirror-jsx.test.tsx`

**Interfaces:**
- Produces: `jsx`, `jsxs`, `Fragment` (and `jsxDEV`, `Fragment` in the dev module) with React's signatures. For a string `type` whose props include a mirrored `data-nse-*` key with a non-null, non-`false` value, the returned element's `className` is the caller's `className` followed by the tokens, space-separated. Other elements pass straight through. Token strings are cached in a `Map` keyed by `name + "\0" + value`.
- The wrapper imports React's own runtime by a path the plugin's `resolveId` does not intercept (resolve with `skipSelf` from the wrapper's importer check; a recursion here hangs the build, so the test below imports through the alias).

- [ ] **Step 1: Write the failing test:**

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

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the two runtime modules and the three aliases.
- [ ] **Step 4:** Run the test, then the rendered-contract suite (`npx vitest run tests/nse`), which asserts attributes on about 700 specimens. Fix any test that compares `className` for exact equality by asserting the tokens it cares about; do not weaken attribute assertions. Expected: PASS.
- [ ] **Step 5:** Commit: `NSE: mirror contract hooks into classes in the JSX runtime`.

### Task 4: Reconciling observer, imperative helper, acceptance

**Files:**
- Create: `src/NSE/Theme/contract/hookMirrorDOM.ts` (`installNSEHookMirror`, `setNSEHook`; the observer also watches `class`, so a renderer rewriting `className` cannot drop tokens set by hand)
- Modify: the 24 imperative writes (`grep -rn 'dataset\.nse\|setAttribute("data-nse\|toggleAttribute("data-nse' src`), limited to mirrored names; `src/NSE/Appearance/NSEAppearanceProvider.tsx` (install the observer once per document); `scripts/synware/idiom-errors.mjs` (reject `.nse\:` selectors in authored CSS); `docs/framework/theme-contract.md`
- Test: `tests/nse/hook-mirror-observer.test.tsx`, `tests/e2e/hook-mirror.spec.ts`

**Interfaces:**
- Produces: `installNSEHookMirror(document: Document): () => void` (idempotent per document; returns the uninstall function), `setNSEHook(element: Element, name: string, value: string | null): void`.

- [ ] **Step 1: Write the failing tests.** Vitest (jsdom): an element created with `document.createElement` and given `data-nse-part="row"` has the tokens after a microtask; changing the value swaps the value token; removing the attribute removes both; an element the JSX wrapper already mirrored is not written again (spy on `classList.add`). Playwright (Review Focus 2): a fixture page that renders one `NSEButton` through React and one hand-built `<button data-nse-control="button" data-nse-bezel-style="rounded">` appended in a `useLayoutEffect`; assert both have the same computed `border-radius` by the next animation frame, and that `setNSEHook` gives it synchronously.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The observer batches by element per callback and reads `attributes` once per element.
- [ ] **Step 4:** Run focused tests, typecheck, then `npm run sdk:build`, vendor into the site with `npm run framework:sync -- --allow-dirty` **as a local experiment only** (the receipt stays out of any commit; the site worktree is restored with `git checkout -- package.json package-lock.json vendor/framework-receipt.json` afterwards and the experiment archive deleted), restart 5387 with `--force`, and run the harness and the digest.
- [ ] **Step 5:** Check the targets: gallery full recalc ≤ 55 ms; section-change mean ≤ 90 ms; cold gallery load style ≤ 480 ms; launch About style ≤ 60 ms; digest compare against `baseline-digest.json` = 0 differences. Save `after-mirror.json` beside the baseline. If the digest differs, the differing elements name the selector class that was mis-rewritten; fix in Task 2's code, do not special-case elements.
- [ ] **Step 6:** Run baseline (123/123) and the `theme-nesting` spec (third-party attribute-only theme, Review Focus 3).
- [ ] **Step 7:** Commit: `NSE: keep mirror classes in step for imperative and unbundled hooks`.

### Task 5: Remaining recalc cost, measured then cut

**Files:** decided by the profile; expected `scripts/synware/theme-loading.mjs`, `scripts/synware/selector-performance.mjs`.

- [ ] **Step 1:** With Task 4 in place, capture a Chromium trace of `gallery-full-recalc` with `blink.debug` selector statistics (`--enable-blink-features=…` is not needed; use DevTools "Selector stats" via CDP `Tracing` category `disabled-by-default-blink.debug`) and list the 30 costliest selectors by elapsed time and by match-attempt count. Save as `selector-stats.json`.
- [ ] **Step 2:** Apply only rewrites that are provably equivalent, each with a unit test in `selector-performance.test.ts` and the specificity guard: (a) drop the duplicate twin when `:scope X` and `X:scope` can both be expressed as one rule after mirroring; (b) hoist a leading class out of `:where(.a …)` ancestor arguments so the Bloom filter sees it; (c) anything else the stats name, one rewrite per commit if they are independent.
- [ ] **Step 3:** Re-run harness, digest (0 differences) and baseline (123/123). Target: gallery full recalc ≤ 45 ms. Record CSS byte size before and after.
- [ ] **Step 4:** If the target is not met, stop here: write the profile and the remaining top selectors into `docs/superpowers/evidence/2026-11-11-performance/README.md` and report to the owner. Do not regenerate Atmo's rules.
- [ ] **Step 5:** Commit: `Style performance: <the specific rewrite>`.

### Task 6: Interaction state without re-rendering

**Files:**
- Modify: `src/NSE/Theme/contract/useThemeInteraction.ts` and its callers (find with `grep -rln useNSEThemeInteraction src`)
- Test: `tests/nse/theme-interaction.test.tsx`

**Finding:** hover, focus and highlight are React state, so each pointer crossing re-renders the control. The attributes are drawing state only; nothing reads the booleans for behaviour except `highlighted && enabled`.

**Interfaces:**
- `useNSEThemeInteraction` keeps its signature and return shape for callers that read the booleans; add an internal option `{ publish: "attributes" }` under which it writes `data-nse-hovered`, `data-nse-focused` and `data-nse-highlighted` with `setNSEHook` on the event's `currentTarget` and holds no state. Convert each caller that only spreads the booleans into `nseStateHooks`.

- [ ] **Step 1:** Failing test: render an `NSEButton` with a render counter; hover, focus, press and release; assert the three attributes appear and disappear and the render count does not change.
- [ ] **Step 2:** Run. Expected: FAIL (render count rises).
- [ ] **Step 3:** Implement; convert callers one family per commit if the diff is large (buttons, values, text, selection).
- [ ] **Step 4:** Focused tests, the rendered-contract suite, baseline (hover, focus and press surfaces are in the catalogue), and the harness `gallery-hover-sweep`. Target: script time during the sweep falls by at least 50% against Task 1's figure.
- [ ] **Step 5:** Commit: `NSE: publish hover, focus and highlight without re-rendering the control`.

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

- [ ] **Step 1: Write the failing tests** with a real runtime and an `NSEApplication` subclass that records calls, and a window-manager spy:

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

- [ ] **Step 2:** Run. Expected: FAIL on order.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Focused tests plus `npx vitest run tests/runtime tests/integration -t "launch"`; typecheck. Expected: PASS. Update `docs/framework/applications.md` only if a sentence is now wrong.
- [ ] **Step 5:** Commit: `Lifecycle: run launch callbacks after the main window opens`.

### Task 10: Suspend and quit go through the class-aware lifecycle

**Files:**
- Modify: `src/SynCloudOS/AppManager/AppManager.ts` (remove `suspend()`, `suspendForApplicationClose()`, `close()`; widen `AppManagerLifecyclePort` to `Pick<SynCloudOSLifecycle, "launch" | "activate" | "suspend" | "close">`), `src/SynCloudOS/LaunchServices/LaunchServices.ts` (`settleMultiSwitch`, `closeApp`), `src/SynCloudOS/BundleLoader/bundleTypes.ts` only if a hook name becomes unused
- Test: `tests/runtime/lifecycle-suspend-terminate.test.ts`

**Interfaces:**
- `settleMultiSwitch` calls `runtime.lifecycle.suspend(fromAppId, { reason: "LaunchServices.multiSwitch" })` and does not await it.
- `closeApp(appId)` becomes: cancel pending launches → `Lifecycle.close(appId, { reason: "LaunchServices.closeApp", closeTransaction })`, where the transaction carries the window-close preparation and authority the function builds today (`Lifecycle.close` already closes the application's windows in its `will` phase after `close:will` and calls `WindowManager.commitCloseApplication` at commit). Returns the same `closeResult` shape. Read `closeApplicationWindows` and `commitCloseApplication` in `Lifecycle.ts:721–830` before writing; the mechanism exists and `closeApp` simply does not use it.
- No replacement methods are added to `AppManager`. Any other caller of the three removed methods is moved to `runtime.lifecycle` in this commit.

- [ ] **Step 1: Write the failing tests:**

```ts
it("MultiSwitch tells the outgoing application it will resign active", …);          // applicationWillResignActive called once
it("quit asks applicationShouldTerminate, then applicationWillTerminate, then disposes the session", …);
// Review Focus 5
it("a vetoed quit leaves the application active with its windows open", …);        // closeResult.outcome !== "closed"; no applicationWillTerminate
it("quit during an in-flight launch cancels it and never calls applicationWillTerminate", …);
it("the legacy bundle hooks applicationWillClose/DidClose still fire once, through the lifecycle", …);
```

- [ ] **Step 2:** Run. Expected: FAIL (callbacks never called).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Focused tests, `npx vitest run tests/runtime tests/integration -t "close|quit|suspend|MultiSwitch"`, typecheck, boundaries.
- [ ] **Step 5:** Commit: `Lifecycle: suspend and quit through the class-aware operations`.

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

- [ ] **Step 1:** Add marks at `app.launch.started`, `authorised`, bundle ready, lifecycle committed, window opened, `app.launch.complete`, and first frame after complete. Record the phase table for About, Journal and the gallery (cold and warm) in `docs/superpowers/evidence/2026-11-11-performance/launch.md`.
- [ ] **Step 2:** In a trace of a cold launch, find the `UpdateLayoutTree` that follows the app's stylesheet insertion and record its element count. If it re-matches the whole document, fix at the source: the Vite plugin emits app CSS so that insertion cannot change rules outside the app's subtree (the app's sheet is already scoped; confirm the `@layer` statement order is declared once up front in `src/NSE/Structure/layers.css` so a late sheet does not reorder layers). Write the test first: a jsdom-free unit test on the plugin's emitted CSS that asserts every app rule is inside the app's `@scope` and declares no new top-level `@layer` name.
- [ ] **Step 3:** Prefetch on intent: `src/Webspring/webspringPrefetch.ts` exists. Verify with the trace that hovering or focusing an icon starts the bundle and CSS fetch; if it only fetches JS, extend it to the CSS chunk. Test in `tests/runtime/webspring-prefetch.test.ts`.
- [ ] **Step 4:** Re-measure; check the table above; save `launch-after.json`.
- [ ] **Step 5:** Commit per fix: `Launch: <what no longer waits>`.

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
| 7 | Control interaction (hover, focus, highlight) | `useThemeInteraction.ts` | Three booleans; removed as state by Task 6, so it needs no machine |
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

- [ ] **Step 1:** Failing tests: legal send moves and notifies once; illegal send returns `null`, keeps state, notifies nobody; `canEnter`; a listener that sends re-entrantly sees a consistent order; a definition naming an unknown target state throws at `defineStateMachine`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement (about 60 lines).
- [ ] **Step 4:** Run; typecheck.
- [ ] **Step 5:** Commit: `Statechart: add an explicit state-machine primitive`.

### Tasks 13–18: Convert one machine per commit

Same five steps each: write the table test from the machine's current behaviour (walk every state × event; assert the transitions the existing code allows and no others, deriving the expected table by reading the writers and guards listed in Findings), run it red against a table with one deliberate hole, implement by replacing each writer with `send`/`next` and each scattered guard with `canSend` or a state read, run that area's existing suite unchanged, commit.

- [ ] **Task 13: Application lifecycle.** Files: `AppManager/AppLifecycle.ts` (becomes the machine: states = `SynCloudOSAppLifecycleState`, events = `prepare`, `load`, `loaded`, `launch`, `activate`, `suspend`, `close`, `fail`, `disable`, `enable`), `Lifecycle/Lifecycle.ts` (`legalLifecycleState` reads the same table), `AppManager.ts` (`createRecord`'s readiness becomes a per-state lookup). Commit: `Lifecycle: one transition table for application state`.
- [ ] **Task 14: Webspring launch phase.** Files: `WebspringState/WebspringState.ts`, new `WebspringState/launchPhaseMachine.ts` (events: `stage`, `launch`, `cover`, `beginReturn`, `finishReturn`, `reset`), and the guards in `LaunchServices.ts`, `WebspringChoreography.ts`, `Lifecycle.ts`, `Statechart.ts`. Commit: `Webspring: make the launch phase an explicit machine`.
- [ ] **Task 15: MultiSwitch.** Files: `ApplicationState/`, `LaunchServices.ts:245–330`; states `idle`, `awaitingFirstFrame`, `awaitingPresentationFrame`, `settling`, with the three handles owned by the state they belong to. Commit: `LaunchServices: make MultiSwitch settlement an explicit machine`.
- [ ] **Task 16: Launch request.** Files: `LaunchServices.ts`, new `LaunchServices/launchRequestMachine.ts`; `recordRequestHistory` is driven by the machine's listener, so history and state cannot disagree. Commit: `LaunchServices: make the launch request an explicit machine`.
- [ ] **Task 17: Folder split and system startup.** Files: `Webspring/WebspringFolderSplitPresentation.tsx`, `RootRuntime/RootRuntimeManager.ts`, `Webspring/SystemStartupLayer.tsx` (one shared union). Baseline must pass (the folder presentation is the catalogue's timing-sensitive case; run it three times serially). Commit: `Webspring: explicit machines for folder presentation and startup`.
- [ ] **Task 18: Page turn and drag session.** Files: `src/NSE/Page/`, `src/SynCloudOS/Drag/`. NSE may not import from `src/SynCloudOS`; check `scripts/quality/architecture-boundaries.json` first and, if the edge is forbidden, place the primitive's file where both layers may import it (propose the location in the commit body; do not add an allow-list entry). Commit: `NSE and Drag: explicit machines for page turns and drag sessions`.

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

- [ ] **Step 1:** Extend `scripts/perf/style-recalc.mjs` with `--cpu`: record a CPU profile per scenario and print main-thread tasks over 50 ms with their top self-time function and file.
- [ ] **Step 2:** Add `scripts/perf/heap-cycles.mjs`: launch and quit About ten times, force GC through CDP `HeapProfiler.collectGarbage`, print `JSHeapUsedSize` after cycle 1 and cycle 10 and the count of detached DOM nodes.
- [ ] **Step 3:** Write the inventory table (scenario, task ms, function, file, verdict: render / move to DFX / fix in place) into `dispatch-benchmarks.md`. Each "move to DFX" row becomes a slice after Task 21 with its own before and after.
- [ ] **Step 4:** Commit: `Perf: record main-thread and heap inventories`.

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

- [ ] **Step 1:** Add the failing test with the current count pinned as a ceiling that may only fall: `expect(missing.length).toBeLessThanOrEqual(708)`; the final slice changes it to `toEqual([])`.
- [ ] **Step 2:** Write the inventory script and commit its reviewed output. Rule 1 entries need a real AppKit name; when unsure whether AppKit has the type, treat it as rule 3. The existing test's counterpart pattern (`^(NS|AV|CA|CG|CT|WK|…)`) applies to the new section too.
- [ ] **Step 3:** Commit: `Counterparts: cover internal NSE names and record the inventory`.

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

- [ ] **Step 1:** `tests/runtime/fx/dispatch-packed.test.ts:60` writes its receipt to `.artifacts/dispatchfx/task-6-installed.json` instead of the tracked evidence file (test first: assert the tracked file's bytes are unchanged after the test runs). Commit: `Tests: the packed Dispatch receipt is a build artefact`. Do not stage the evidence file.
- [ ] **Step 2:** typecheck, `typecheck:authoring`, `typecheck:contracts`, boundaries, full Vitest, packaging, `npm run sdk:build`, the `sdk:*` and `fx:installed` checks. Record counts.
- [ ] **Step 3:** Baseline: 123 passed, with the snapshot directory's `git status` clean and `baseline-sha256.json` unmodified (`git diff --stat` shows neither).
- [ ] **Step 4:** Vendor without `--allow-dirty`, per owner decision 2: clean detached checkout of `HEAD` in the scratchpad, `npm ci` there, `npm run framework:sync -- <that path>` from the site. The receipt must have no `dirty` key. Remove the temporary worktree with `git worktree remove`.
- [ ] **Step 5:** Site: `npm run check`, `npm test`, `npm run check:boundaries`; restart 5387 with `--force`; run the harness; write the before/after table for every workstream target into `docs/superpowers/evidence/2026-11-11-performance/REPORT.md`. Stop anything started on 5377.
- [ ] **Step 6:** Commit the report (framework) and the site adoption (site: `package.json`, `package-lock.json`, `vendor/framework-receipt.json`, the new archive, the removed old archive) as two commits. Do not push.

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
