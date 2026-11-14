# Launch timeline (Task 11)

`node scripts/perf/launch-timeline.mjs --base http://127.0.0.1:5387 --runs 5 --json launch-after.json`

The script finds the runtime through React's tree, wraps its event bus in the page and timestamps every event, long task, resource and stylesheet insertion. Each application is launched cold (bundle never loaded), sent back to Webspring, then launched warm. Times are milliseconds after `openApp`, median of the passes. The site runs on Vite's dev server with React's development build, so absolute times are well above a production build's; the order and the shares are what to read.

## Phases at `3de36cac` (five passes)

| Phase | About cold | About warm | Journal cold | Journal warm | Gallery cold | Gallery warm |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `app.launch.started` | 0.9 | 0.3 | 0.3 | 0.3 | 0.3 | 0.3 |
| `app.launch.authorised` | 1.1 | 0.4 | 0.4 | 0.3 | 0.5 | 0.3 |
| `bundle.load.begin` | 2.4 | – | 1.4 | – | 1.3 | – |
| `bundle.load.complete` | 46.3 | – | 59.4 | – | 209.4 | – |
| lifecycle committed | 69.0 | 17.2 | 83.3 | 17.3 | 243.6 | 15.7 |
| `app.launch.complete` (window open) | 192.5 | 116.8 | 182.7 | 74.7 | 759.3 | 386.2 |
| first frame after complete | 259.1 | 188.0 | 327.2 | 375.3 | 1,206.3 | 673.1 |
| resources fetched | 25 | 0 | 61 | 0 | 96 | 0 |
| stylesheets inserted | 1 | 0 | 6 | 0 | 3 | 0 |
| long tasks | 166 | 0 | 264 | 271 | 1,051 | 209 |

`launch-before.json` is one pass at `30752974`, before the safe-area change below. Its figures sit within a few milliseconds of these.

## What the timeline shows

- **Nothing in a launch waits on a theme.** Atmo's stylesheet is a static import of the browser runtime (`src/NSE/Themes/Atmo/index.ts`), so it arrives with the first page load. No `await` on a theme, an appearance or a stylesheet exists in LaunchServices, BundleLoader, WindowManager, AppManager, Lifecycle, AppHosting or Webspring.
- **Policy, authorisation and queueing cost about a millisecond.**
- **Cold launches wait on the bundle**: 44 ms for About's 25 modules, 208 ms for the gallery's 96, as the dev server transforms them. The application's stylesheets arrive inside that same load (About's is inserted at 45.8 ms, 0.5 ms before `bundle.load.complete`), so the hover and idle prefetch in `src/Webspring/webspringPrefetch.ts`, which calls `bundles.loadBundle`, already brings the CSS with the code. `tests/runtime/webspring-prefetch.test.ts` covers the prefetch.
- **Between commit and "complete" the time is React rendering the window.** A CPU profile of a warm About launch has the main thread busy throughout; the largest self-times are React's development `jsx` (about 66 ms with stack capture, absent from a production build) and the safe-area measurement described below.
- **Inserting an application's stylesheet does not re-match the document.** In a trace of a cold About launch (320 elements in the document) the largest style recalculation covers 91 elements and takes 19.4 ms; for Journal, 90 elements and 9.4 ms. All style work before the first frame comes to 43 ms over 52 recalculations (About) and 31 ms over 50 (Journal). So the plan's Step 2 needed no fix and its test was not written: there is no whole-document recalculation to guard against.

## What changed

- **`3de36cac`: safe-area measurement reads each ancestor's transform once per commit.** Every view that measures its safe area walked to its window root calling `getComputedStyle`. A warm About launch made 1,077 such reads over 58 distinct elements; it now makes 268. Launch times did not move measurably (warm About 115 to 124 ms before, 117 ms after): the reads were cheap once the first had forced style. The change is kept because it removes work that scales with views × depth; it is not a launch-time win and is not claimed as one.
- **`b358da22` (Task 9)** already took `applicationDidFinishLaunching` and `applicationDidBecomeActive` out of the wait for the window.

## Left for the owner

- A production-build measurement. The dev server and React's development build dominate these figures; a production preview needs a port, and only 5387 is allowed for the site.
- 52 style recalculations before the first frame means layout effects are reading layout between writes. Each is small here, but the count grows with the window's content (the gallery's cold launch has 1,051 ms of long tasks). Finding and batching those reads is a control-by-control job that was not started.
- Atmo's stylesheet is about 4.4 MB of CSS on the first page load. Splitting it by control family, or loading rarely used families on demand, would shorten the first load but changes how themes are packaged, so it is a proposal only.
