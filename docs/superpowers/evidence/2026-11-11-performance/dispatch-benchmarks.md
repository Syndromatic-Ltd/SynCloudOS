# Main-thread and heap inventories

Task 19 of `docs/superpowers/plans/2026-11-11-performance-lifecycle-structure.md`. Recorded 13 November 2026 at framework `22cb33ce`, vendored into the site as a local experiment, on the site's dev server (`127.0.0.1:5387`). Before-and-after tables for each DispatchFX adoption are added below this inventory as the adoptions land.

## How the numbers are taken

- `node scripts/perf/style-recalc.mjs --base http://127.0.0.1:5387 --runs 3 --json inventory-plain.json`: true task lengths, no profiler attached.
- The same command with `--cpu`, into `inventory-cpu.json`: a CPU profile per scenario, sampled every 200 µs. Each task over 50 ms is split by who owns the sampled time (`engine`, `dom`, `gc`, `react`, `tooling`, `framework`, `site`) and lists the framework and site functions with the most inclusive time.
- **The profiler inflates every task by a fifth to a third and adds one task of its own to every scenario** (100 to 210 ms, almost no JavaScript samples; the hover sweep has no long task without the profiler and one with it). Read task lengths from the plain run and shares from the profiled run.
- This is a dev build: React's development runtime, the JSX dev transform and Vite's style injection are all in the figures. A production build was not measured.
- `node scripts/perf/heap-cycles.mjs --base http://127.0.0.1:5387 --json <file>`: launch About and return to Webspring ten times, collect garbage, read the JS heap, DOM node and event listener counters after cycle 1 and cycle 10.

## Main-thread tasks over 50 ms

Longest task per scenario from the plain run (median pass of three); owner shares of that task from the profiled run.

| Scenario | Longest task | Tasks > 50 ms | Owner shares of the longest task | Verdict |
| --- | ---: | ---: | --- | --- |
| cold-load-board | 177 ms | 3 | framework 65%, tooling 25% (Vite injecting the theme stylesheet) | fix in place: rows 1 and 2 below |
| launch-about | 128 ms | 6 | engine 97% | render: style, layout and paint of the new window (style 110 ms across the launch) |
| quickswitch-open | 91 ms | 2 | one task is engine 95%; the other React 31%, framework 29%, DOM calls 27% | render |
| quickswitch-select | 88 ms | 1 | React 48%, framework 25%, DOM calls 21% | render |
| return-to-webspring | 132 ms | 1 | framework 39%, React 31%, DOM calls 18%, GC 6% | render; row 5 below is the site's |
| cold-load-gallery | 197 ms | 8 | React 47%, framework 31%, DOM calls 14% | render, plus rows 3 and 4 |
| gallery-hover-sweep | 4.5 ms | 0 | | nothing to do |
| gallery-section: Tables & Trees | 622 ms | 1 | React 50%, framework 27%, DOM calls 19% | render, plus rows 3 and 4 |
| gallery-section: Buttons | 451 ms | 1 | React 45%, framework 26%, DOM calls 23% | render, plus rows 3 and 4 |
| gallery-section: Menus & Popups | 497 ms | 1 | React 44%, framework 25%, DOM calls 25% | render, plus rows 3 and 4 |

**No row is "move to DFX".** Every long task in these scenarios is React rendering a tree, the engine styling it, or a framework function reading layout. None is a computation that could run off the main thread. The scenarios are interface scenarios; the media workloads (ImageFX, VideoFX, PDF, Lumina) are not in them and keep their own before-and-after under Task 21.

### Framework functions inside those tasks

Inclusive time inside the profiled task, so read it as a share of that task, not as wall time.

| # | Function | File | Where it shows | Share | Verdict |
| ---: | --- | --- | --- | --- | --- |
| 1 | module evaluation of the shared PDF chunk | packaged `chunks/GFXPDFDocument-*.js` (1.7 MB) | cold-load-board, first task | 34 of 155 ms | **fix in place.** `nse.js`, `webspring.js`, the runtime chunk and the split view chunk each carry a bare `import "./chunks/GFXPDFDocument-*.js"`, so every page downloads, parses and evaluates the PDF library and its embedded dictionary before first paint, whether or not it draws a PDF. The chunk should load when a PDF document is first made. |
| 2 | `renderHost` shell bootstrap (resource and font checks) and `createSynCloudOSRuntime` | `src/SynCloudOSReact/browserRuntime.tsx`, runtime chunk | cold-load-board, first task | 46 and 24 of 155 ms | leave: one-off start-up work, already measured under Workstream C |
| 3 | `measure` in the safe-area layout hook, through `nseTransformedWithin` and `nseLayoutOrigin` | `src/NSE/Layout/useNSESafeArea.ts` | cold gallery (51 to 83 ms of a 200 to 260 ms task), every gallery section (40 to 80 ms), launch-about | 8 to 40% | **fix in place.** Each view controller's layout effect reads computed style up its ancestor chain and then `offsetLeft`/`offsetTop`, between React writes, so the engine re-styles and re-lays-out once per view. The per-microtask memo already shares the ancestor walk; the reads still interleave with writes. Batch the reads for one commit into one pass. |
| 4 | `mirrorProps`, through the mirror JSX runtime | `src/NSE/Theme/contract/hookMirror.mjs` | every gallery section | 26 to 36 ms of 550 to 850 ms (about 4%) | leave: it is the cost of the mirror classes that took gallery style from 356 to 87 ms |
| 5 | `NSEOutlineView` rendering every node, `NSEListItem` | `src/NSE/Controls/Selection/` | Tables & Trees (112 ms and 67 ms inclusive of their children) | 13% and 8% | render. The gallery mounts every demonstration of a section at once; that is the gallery's choice, not a framework fault. |
| 6 | `animateArtwork` → `addAnimation` → `toRuntime` | site `src/Effects/LayerArtwork.tsx`, `fx/animation.js` | return-to-webspring | 23 of 182 ms | leave: the site builds its board artwork animations on return |
| 7 | `viewDidAppear` → `manageRenderer` | site `src/Effects/NetburstIconEffect.tsx` | cold-load-board, quickswitch-open | 9 to 12 ms | leave |

Row 1 is done at `9520f4b2`; see below. Row 3 is the next slice.

## Fix in place: the PDF library leaves start-up (`9520f4b2`)

The colour controls imported `GFXColour` through the GraphicsFX barrel, and output preparation imported the PDF context statically, so the bundler tied the 1.7 MB PDF chunk to every shell entry. The colour controls now import the colour module, and output preparation loads the PDF context when the first output is prepared. A packaging test follows the static imports of `index.js`, `sdk.js`, `nse.js` and `webspring.js` and fails if a PDF chunk is among them.

| cold-load-board (plain run, median of three) | Before (`22cb33ce`) | After (`9520f4b2`) |
| --- | ---: | ---: |
| Script time | 338 ms | 309 ms |
| Longest task | 177 ms | 165 ms |
| Tasks over 50 ms | 3 | 3 |
| Bytes of PDF code in the entries' static imports | 1.72 MB | 2.4 kB (the font subset recorder) |

- The dev server serves from disk, so the saving in download and parse on a real connection is not in these figures.
- Cold gallery and launch About moved within their run-to-run spread (script 1,823 to 1,859 ms and 653 to 633 ms).
- `fx/graphics` still exports the PDF classes, so an app that imports that entry loads the library with the app. Splitting PDF into its own public entry would be a public API change and is a proposal, not done.
- After-figures are in `inventory-plain-after-pdf.json`.

## Heap across ten launches of About

| Build | DOM nodes | Event listeners | JS heap |
| --- | ---: | ---: | ---: |
| before either fix (`heap-before.json`) | +3,951 | about +1,370 | +3.50 MB |
| `f2bc2507`, window surface bridge holds nothing until it presents (`heap-after-bridge.json`) | 0 | +28 | +3.26 MB |
| `22cb33ce`, route session observes authority once it commits (`heap-after-route-session.json`) | 0 | +29 | +2.64 MB |
| `9e2c8fa5`, menus, media queries and launch history hold nothing from a discarded render (`heap-after-sol.json`) | 0 | -2 | +2.51 MB |

- The first row was taken with the harness's earlier detached-node query, which itself pins the trees it reports. A probe that read counters only confirmed the leak was real on that build: +439 DOM nodes and about +152 listeners per cycle. The listener figure in that row comes from that probe; the file records only heap and nodes.
- Both leaks had one cause: an object made during render subscribed to the runtime in its constructor, and React discarded that render without running any cleanup. Each now subscribes only after it commits or when its work starts, with a test that fails without the change.
- **The plan's bar is 2 MB over the ten launches, and 2.64 MB misses it.** About three listeners per cycle also remain. Not yet traced: per-launch application client closures (`requestAuthorization`, `observeAccessLoss`, `bindResource`, the pasteboard `snapshot`) held in tables keyed by objects that outlive the launch, and development-only stack frames. How much of the remainder exists in a production build is not known.
- At `9e2c8fa5` listeners are flat. A second agent's production-mode run of the same build gave +2.52 MB over cycles 1 to 10 and +2.01 MB over cycles 2 to 11; its snapshots at cycles 25 and 40 put three quarters of the growth in V8 instruction streams and trusted byte arrays (compiled code), with controllers, sessions, closures and listeners flat. The 2 MB bar is still missed on the plan's interval.
- Two holders are bounded and do not grow: the runtime root's focus tracker keeps the last focused element after it is removed (one application stage stays alive until focus moves), and the site's About particle canvas is held by its manager.

## Files

| File | What it is |
| --- | --- |
| `inventory-plain.json` | The scenario table at `22cb33ce`, three passes, no profiler. |
| `inventory-cpu.json` | The same with `--cpu`: per long task, owner shares and the twelve framework or site functions with the most inclusive time. |
| `heap-before.json`, `heap-after-bridge.json`, `heap-after-route-session.json`, `heap-after-sol.json` | The heap harness's output for the four rows above. |
