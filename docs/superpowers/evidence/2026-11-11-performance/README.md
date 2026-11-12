# Performance evidence, November 2026

Evidence for `docs/superpowers/plans/2026-11-11-performance-lifecycle-structure.md`.

## How the numbers are taken

- `node scripts/perf/style-recalc.mjs --base http://127.0.0.1:5387 --runs 5 --json <file>`: headless Chromium 149.0.7827.55, viewport 1440×900, one fresh browser context per pass, signed in through the site's own local test sign-in button. Each figure is the median of the passes.
- `node scripts/perf/computed-style-digest.mjs --out <file>`: one hash per element and per `::before`/`::after` of every standard computed property, for the gallery's first view and three section changes (14,361 styles). `--compare a b` exits 1 on any difference.
- The machine must be otherwise idle. A stray headless browser from an earlier experiment doubled every figure; check for leftover Playwright processes first.

## Files

| File | What it is |
| --- | --- |
| `baseline.json` | The scenario table at framework `90e7fbf9` (the site vendors that commit), 11 November 2026. |
| `baseline-digest.json` | The computed-style digest at the same commit. Two consecutive recordings compared equal: 0 differences in 14,361 styles. |
| `after-mirror.json` | The same table at framework `b95e5e3c` (mirror classes, Tasks 2 to 4), vendored into the site as a local experiment, 12 November 2026. |
| `after-store-noop.json`, `after-store-noop-digest.json` | The table and digest at `30752974` (store no longer publishes same-value writes, Task 6). |
| `after-mirror-digest.json` | The digest at `b95e5e3c`. Compared with `baseline-digest.json`: 0 differences in 14,361 styles. |

## Mirror classes, before and after

Style time in milliseconds, median of five passes.

| Scenario | Measure | `90e7fbf9` | `b95e5e3c` | Plan target |
| --- | --- | ---: | ---: | --- |
| cold-load-board | style | 77.1 | 56.0 | |
| launch-about | style | 168.3 | 74.5 | ≤ 60: missed, carried to Task 5 |
| about-full-recalc | full recalc | 20.8 | 5.7 | |
| quickswitch-open | style | 22.2 | 7.2 | |
| quickswitch-select | style | 20.8 | 7.5 | |
| return-to-webspring | style | 48.0 | 20.2 | |
| cold-load-gallery | style | 1,905.2 | 571.5 | ≤ 480: missed, carried to Task 5 |
| gallery-full-recalc | full recalc | 192.6 | 53.4 | ≤ 55: met |
| gallery-hover-sweep | style | 266.3 | 58.4 | |
| gallery-section: Tables & Trees | style | 445.5 | 101.6 | |
| gallery-section: Buttons | style | 435.6 | 115.8 | |
| gallery-section: Menus & Popups | style | 187.5 | 44.8 | |
| gallery-section mean | style | 356.2 | 87.4 | ≤ 90: met |

The site's dev server for these runs is `npx vite --config vite.local-auth.config.mts --host 127.0.0.1 --force` in the site worktree; the plain config has no local sign-in and the harness cannot get past the login window.

## What still costs after the mirror (Task 5)

`node scripts/perf/selector-stats.mjs --base http://127.0.0.1:5387 --json selector-stats.json` records Blink's selector statistics for one full re-match of the gallery (985 elements, 12,220 style rules, 3,769 distinct selectors). The statistics slow matching themselves, so read shares, not absolute times.

| Rightmost compound is filed under | Selectors | Match attempts at `b95e5e3c` | at `c31f7215` |
| --- | ---: | ---: | ---: |
| a value class (`.nse\:part\=bezel`) | 2,202 | 256,020 | 256,020 |
| nothing: only `:is()` / `:where()` | 307 | 275,211 | 50,814 |
| a plain class | 876 | 37,446 | 37,698 |
| everything else (universal, tag, attribute, lone pseudo-class) | 384 | 155,846 | 155,846 |
| **Total** | 3,769 | **724,523** | **500,378** |

- `c31f7215` unwraps `:where(:is(a, b))` so each branch is filed under its own class. Attempts fall 31%; the computed-style digest still shows 0 differences (`after-nested-split-digest.json`). Atmo's rewritten CSS grows from 4,386,048 to 4,401,970 characters (+0.4%).
- Wall-clock full recalc did not move: 52 to 64 ms over eight runs at `c31f7215`, against 53.4 ms at `b95e5e3c` (`after-nested-split.json` records a 62 ms median). The attempts removed were ones the engine already rejected cheaply.
- **The ≤ 45 ms target is not met, and per the plan the work stops here for the owner's decision.** What remains is not selector filing. 2,202 selectors are already filed under a value class and account for most of the remaining time: a button is tested against every button rule, and Atmo has many rules per control. Each element also inherits 414 custom properties. Going lower means fewer rules per control or fewer custom properties in Atmo itself, which the plan rules out without the owner's say.
- Also not met, for the same reason: cold gallery style 558 ms (target ≤ 480) and launch About style 74 ms (target ≤ 60).

## Pointer movement re-rendered the whole host (Task 6)

The plan blamed per-control hover state. A commit-by-commit probe of React's tree during the sweep said otherwise: every pointer move produced six commits and re-rendered about 1,900 components, starting at `WebspringHost`.

- **Cause.** The Webspring dial view, still mounted behind an open application, calls `previewApp(null)` as the pointer moves. `WebspringState.hoverApp` wrote the same four values back, and the runtime store's draft counted any assignment as a change, so each move replaced the `webspring` slice and `WebspringHost`, which selects the whole snapshot, re-rendered everything beneath it.
- **Fix (`30752974`).** A write of the value a property already holds is no longer a change. This is in the store, so every caller benefits, not only the dial.
- **Result** (`after-store-noop.json`, median of five passes):

| gallery-hover-sweep | `90e7fbf9` | `c31f7215` | `30752974` |
| --- | ---: | ---: | ---: |
| script | 3,031.7 ms | 3,159.7 ms | 38.8 ms |
| style | 266.3 ms | 57.8 ms | 1.8 ms |
| style recalculations | 211 | 172 | 8 |
| layout | 26.6 ms | 26.1 ms | 0.1 ms |
| tasks over 50 ms | 6 | 8 | 0 |

- The target was script time down by half; it is down 98.7%. The digest (`after-store-noop-digest.json`) shows 0 differences in 14,361 styles.
- The planned conversion of hover, focus and highlight from React state to attributes was not done. With the host no longer re-rendering, a control that is hovered re-renders only itself (four components over the whole sweep), so the conversion would buy almost nothing and would touch every control family.
- Still open for the owner: `WebspringHost` selects the whole runtime snapshot and passes slices down, so any real change to `webspring`, `application` or `lifecycle` re-renders every open window's content. Narrowing that is a larger change to the host and is not started.

## Notes

- Custom properties are left out of the digest. They carry per-run values (identifiers, clocks), and every one of the 14,361 styles differed between two runs of the same build while they were included; what they draw still shows in the standard properties.
- The digest yields to the page every 30 ms. Hashing in one block tripped the host's "stopped responding" watchdog, whose alert then covered the gallery.
- Published SDK styles are rewritten by `selectorPerformance()` when the SDK is built; a project's own stylesheets pass through the same PostCSS plugin in the SynWare Vite plugin's `config()` (`scripts/synware/vite-plugin.mjs`).
