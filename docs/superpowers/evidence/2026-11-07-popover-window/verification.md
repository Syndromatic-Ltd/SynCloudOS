# Popover window regression report

7 November 2026. Work stayed in the supplied framework and site worktrees. No branch switches or pushes.

## Result

Mounted `NSEPopover` presentations use the runtime window surface bridge again, including anchored and `drawsBackground: false` surfaces. They remain WindowManager windows with role `popover` on desktop and phone. Compact adaptation changes presentation and modality without replacing the window or its live content DOM. The standalone path remains for a missing window host and explicit `surface="overlay"`.

The two original mounted DOM-ownership regressions pass unchanged. `git diff eaa4185 HEAD -- tests/runtime/mounted-runtime-dom-ownership.test.tsx` is empty. Before the fix that file reproduced two failures and four passes.

## Bridge and window layer

- `NSEWindowSurfaceRequest` carries AppKit positioning and drawing options: `relativeTo`, `preferredEdge` (`minX`, `maxX`, `minY`, `maxY`), `drawsBackground`, and `behavior` (`transient`, `semitransient`, `applicationDefined`). It also carries presentation, accessibility metadata, and the presenting `parentResponderId`.
- `popoverPosition.ts` is the shared Floating UI engine. Hosted and standalone surfaces share relative-rectangle conversion, flipping, collision bounds, sizing, arrow coordinates, and transform origin. The old window-layer `popoverPlacement` calculation and separate pointer geometry are removed.
- `NSEPopoverFrame` draws one joined SVG plate/arrow outline. `PopoverWindowSurface` uses that frame and the shared spring/reduced-motion path. Content-painted surfaces retain their content fill through the arrow without drawing a standard interior.
- `WindowContentRendererRegistry` transports the request and computed geometry to `WindowHost`. WindowManager still owns the real window, anchor identity, anchor removal, lifecycle, and inspector/restoration record; the renderer adds no parallel window manager.
- Application services, application-scoped control/menu ports, action scope, and presenting responder ancestry survive the renderer transfer. Application content still receives no kernel authority.
- Closing retains inert last-painted content, including edited input values. Content-generation keys prevent a closing copy from duplicating a reopened live surface. Opening focus retries after asynchronous command validation and placement visibility, and handles a batched close/reopen. Equivalent presentation objects no longer cause a dismissal-time re-presentation.
- Compact popovers reuse the existing NSE popup backdrop recipe. Its Atmo opacity is 26%, matching the earlier overlay presentation. Ordinary modal windows keep their existing backdrop.
- `docs/framework/windows.md` describes the resulting ownership and shared frame.

## Commits

| Commit | Change |
| --- | --- |
| `2d173f6` | Share popover placement and frames with windows |
| `1493f60` | Restore mounted popovers to WindowManager and retain application services |
| `2a50c75` | Retain action ancestry and closing content; **contains concurrent staged navigation work, see below** |
| `906f3a4` | Replace closing paint on reopen and preserve edited form values |
| `01c1138` | Focus enabled actions after asynchronous validation |
| `a2b4801` | Keep adaptive popovers in the same window |
| `4f19386` | Focus each content generation, including a batched close/reopen |
| `c3433ce` | Keep equivalent presentation requests stable |
| `ab06f99` | Retry focus after hidden placement becomes visible |
| `0eaa85d` | Retain adaptive backdrop appearance and update window documentation |

**Commit-scoping error for Claude's review:** `2a50c75` accidentally included 43 concurrently staged navigation/documentation/test files alongside this task's 10 files (53 total). Another agent staged them between index checks. Their work was preserved and history was not rewritten. The exact committed path list is retained at `artifacts/popover-mixed-commit-paths.txt`; it can also be reconstructed with `git show --name-only --format= 2a50c75`. Subsequent commits use explicit paths and `git commit --only -- <paths>`. Please review this mixed commit before pushing.

## Automated verification

The final scoped run passed **180 tests in 16 files**, followed by the remaining runtime popover fixture (**1 test in 1 file**): **181 tests across 17 files** in total.

```powershell
npx.cmd vitest run tests/runtime/mounted-runtime-dom-ownership.test.tsx tests/runtime/nse-popover-window-context.test.tsx tests/runtime/transient-window-surface-bridge.test.tsx tests/runtime/webspring-window-layer.test.tsx tests/runtime/webspring-window-host.test.tsx tests/runtime/transient-window-surface-naming.test.ts tests/nse/overlays tests/runtime/book-regions.test.tsx tests/runtime/window-mobile-presentation.test.ts --reporter=dot
npx.cmd vitest run tests/runtime/test-host-stage-popover.test.tsx --reporter=dot
npx.cmd tsc -b --pretty false
node scripts/quality/verify-nse-popover.mjs
git diff --check
```

TypeScript completed without errors. The server-free frame probe passed six desktop engine/DPR cases (Chromium, Firefox, WebKit at DPR 1 and 2), plus three compact cases. It covers light/dark/content-painted surfaces, flips, constrained content, spring samples and overshoot, both reduced-motion sources, and inert exit copies. These probes are separate from mounted-site browser acceptance.

Regression coverage also includes actual controller-hosted windows, service/authority boundaries, action dispatch to the presenter, all three dismissal behaviours, relative rectangles, adaptive DOM retention, close/reopen paint, batched generations, stable presentation requests, and browser focus rejected before placement.

Logs: `artifacts/popover-final-tests.log`, `artifacts/popover-host-stage-tests.log`, `artifacts/popover-final-tsc.log`, `artifacts/popover-frame-probe.log`.

## Mounted-site browser verification

Playwright Chromium used only `http://127.0.0.1:5199`, local sign-in, DPR 1, desktop **1440 x 900** and phone **390 x 844**, each in light and dark. No publishing action was invoked.

Both Publisher's **Publish** popover and the gallery's **Example settings** popover passed all four combinations. Checks include real window-host ancestry, joined/centred desktop arrows, natural and forced edge flips, an observable 100 ms spring frame, `emulateMedia({ reducedMotion: "reduce" })` with transform-free fade keyframes, Escape, outside click, and focus return to the positioning view. Publisher also verifies enabled action controls, initial focus, and retained text in closing frames. The fixed-size gallery settings content scrolls to its last row; its API-label binding was toggled twice on desktop and phone.

The gallery's route-entry animation must settle before measuring its anchor. The first final-pass measurement caught that app animation still scaling the entire gallery. Waiting for route entry to finish resolved the measurement race without changing source or weakening alignment assertions.

Measured settled frames:

| Surface | Desktop | Phone |
| --- | --- | --- |
| Publisher | `(800, 129)`, `260 x 230`, arrow centred on Publish, placement `bottom` | `(8, 606)`, `260 x 230`, bottom `836`, compact presentation without arrow |
| Gallery settings | `(15.796875, 628)`, `320 x 220`, centred arrow, placement `top` | `(8, 616)`, `320 x 220`, bottom `836`, compact presentation without arrow |

The Publisher baseline and final captures have identical frame geometry. The plate/content crop has identical decoded RGB pixels in all four viewport/appearance combinations (mean absolute difference 0). Settled captures allow two animation frames for compositor paint after finishing the sampled spring; intermediate compositor captures were excluded from this comparison. Visual inspection confirms the joined arrow and surrounding layout. The phone paper backdrop sample is `[175, 171, 126]` both before and after. Measurements are in `publisher-pixel-comparison.json` within the evidence folder. This is a scoped plate/content comparison, not a claim of full-page pixel identity.

### SDK provenance

The clean detached checkout built and adopted this task's final source:

- Commit: `0eaa85d0546b3beeccdf6d77bf5e0b88611c78d3`
- Archive SHA-256: `9ec33937d9f4592155381f0810c5559b4d64a93f427c98c242488a80ea21ea87`
- Source SHA-256: `ecd55561581dc434dc3076736f431c9d39cfcfb2526ff84839381b90ef773b8e`

Both browser matrices passed on that package. During subsequent exploratory checks another agent adopted the later shared snapshot `3ba377b`; the owned popover/window-layer source is unchanged between those commits. Both matrices were rerun with receipt stability assertions. The final screenshots and `site-receipt.json` / `gallery-receipt.json` record:

- Commit: `3ba377ba50b6103f92f9da117e5a1890ed77bb2c`
- Archive SHA-256: `73a6c54f8cd1ddb57722e8deb0a693aa1fb120fa66f24f95db452089db4d58ae`
- Source SHA-256: `5f25a80a7cd0cadd4596eaa0e52dc17e2a64d8d52822a33a3db30ae7d5031508`

### Screenshots and scripts

All site evidence is local under `artifacts/popover-window-regression/`:

- `before-publisher-{desktop,phone}-{light,dark}.png`: original overlay reference.
- `after-publisher-{desktop,phone}-{light,dark}.png`: settled real windows.
- Corresponding `-spring.png` and `-reduced.png`; desktop `-edge.png` captures the forced upward flip at the right/bottom edge.
- `after-gallery-{desktop,phone}-{light,dark}.png` and corresponding `-spring.png` / `-reduced.png`.
- `after-gallery-{desktop,phone}-scrolled.png`: last settings row reachable and interactive.
- `site-report.json`, `gallery-report.json`, receipt JSON files, `publisher-pixel-comparison.json`, and `qa-inventory.md`.

The three-engine/DPR frame and paper captures are under `artifacts/nse-popover/`, with measurements in its `report.json`.

Reproduction scripts: `artifacts/verify-popover-windows.mjs`, `artifacts/verify-gallery-popover-windows.mjs`, and `artifacts/gallery-scroll-check.mjs`. Browser logs: `artifacts/popover-site.log`, `artifacts/popover-gallery.log`, and `artifacts/popover-gallery-scroll.log`. These evidence directories are ignored local artifacts and were not committed.

## Cleanup and remaining review

The temporary `syncloudos-popover-6c1673e642de4182a447f7f7d0dd413d` checkout was removed only after deleting its `node_modules` junction itself with `.Delete()`. Shared `framework/node_modules/.bin/vitest` was checked before and after `git worktree remove --force` and remains present. No owned popover temporary checkout remains. Other agents' checkouts were left alone.

Only the verified 5199 Vite process was restarted. Listeners on 5173 and 5387 retained their original PIDs; 5210 had no listener and was untouched. The site preview remains at 5199. No site files were committed, including `vite.claude-5199.config.mts`, and no SynCloudOS-Fusion files were touched.

No known implementation question remains for this regression. Claude still needs to review the commits, particularly the mixed `2a50c75` commit, and decide when to push. Phone evidence is browser emulation; no physical-device run is claimed.
