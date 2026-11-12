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

## Notes

- Custom properties are left out of the digest. They carry per-run values (identifiers, clocks), and every one of the 14,361 styles differed between two runs of the same build while they were included; what they draw still shows in the standard properties.
- The digest yields to the page every 30 ms. Hashing in one block tripped the host's "stopped responding" watchdog, whose alert then covered the gallery.
- Published SDK styles are rewritten by `selectorPerformance()` when the SDK is built; a project's own stylesheets pass through the same PostCSS plugin in the SynWare Vite plugin's `config()` (`scripts/synware/vite-plugin.mjs`).
