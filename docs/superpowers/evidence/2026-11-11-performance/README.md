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

## Notes

- Custom properties are left out of the digest. They carry per-run values (identifiers, clocks), and every one of the 14,361 styles differed between two runs of the same build while they were included; what they draw still shows in the standard properties.
- The digest yields to the page every 30 ms. Hashing in one block tripped the host's "stopped responding" watchdog, whose alert then covered the gallery.
- Published SDK styles are rewritten by `selectorPerformance()` when the SDK is built; a project's own stylesheets pass through the same PostCSS plugin in the SynWare Vite plugin's `config()` (`scripts/synware/vite-plugin.mjs`).
