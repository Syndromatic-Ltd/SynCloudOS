# Full-suite failures

Immutable framework checkout: `7bdaa0d3fdc6d42529b96f9fabf14d27e9f36ba6`.

Framework: 7,252 passed, 28 failed in 873 files (10 failed). The following are the verbatim failed case headings; see `framework-frozen-full.log` for complete diagnostics.

- `tests/integration/text-system-example.test.ts > private public-package TextSystem engine > admits a scoped image, saves its native references and reacquires verified bytes in a fresh mounted runtime`
- `tests/integration/text-system-example.test.ts > private public-package TextSystem engine > exports the captured revision without dirtying history or releasing live view fonts`
- `tests/integration/text-system-keyboard.test.tsx > only lets the originating surface cancel its object gesture with Escape`
- `tests/integration/text-system-keyboard.test.tsx > focuses the owning input and leaves an already handled Escape alone`
- `tests/integration/text-system-keyboard.test.tsx > revokes the captured gesture lifetime when its surface unmounts`
- `tests/integration/text-system-keyboard.test.tsx > leaves composition keys alone and consumes only a gesture's Escape`
- `tests/runtime/browser-file-picker-port.test.ts > the browser file chooser behind the Open panel > offers the request's types, returns the chosen file and leaves no input behind`
- `tests/runtime/framework-doc-links.test.ts > framework documentation > links every guide from the framework index`
- `tests/runtime/heritage-inspector-dev.test.ts > heritage development boundary > excludes the lazy Inspector graph and CSS from the production host region`
- `tests/runtime/heritage-inspector-dev.test.ts > heritage development boundary > removes the bridge and UI from the production import graph without a package rebuild`
- `tests/runtime/nse-file-browser-packed.test.ts > exports usable path items and workspace artwork from an independently installed SDK`
- `tests/runtime/synapp-manifest-validator-generated.test.ts > keeps the precompiled manifest validator current with the schema`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > waits for the entrance to settle without capturing or running an idle frame loop`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > replaces documents immediately when the environment has no animation clock`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > mirrors the visible foot of an asymmetric page without squeezing its full height into the shelf`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > keeps a page shorter than the shelf at its natural height`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > finishes selection replacement in 180 milliseconds on the canonical seconds clock`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > captures settled documents once and submits mirrored image quads with a real ImageFX fade mask`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > moves retained reflections with travelling documents without capturing on animation frames`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > retains images during travel and captures the incoming selection only after settling`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > preserves a 530px document's projected width and x origin on a tilted floor`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > serializes replacement captures and rejects the stale selection before decoding it`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > deduplicates the present document and releases pending work when deactivated`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > releases a late pixel lease without publishing after deactivation`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > cancels capture when the renderer fails and hides an unavailable surface`
- `tests/runtime/chronosphere/chronosphere-reflection.test.tsx > loads captured PNG bytes through the mounted app image client and real resource policy`
- `tests/runtime/fx/packed-fx.test.ts > executes substantive FX operations from the built npm archive outside the repository`
- `tests/runtime/fx/packed-value-foundations.test.ts > executes and typechecks LocationFX and MIDIFX from an independently installed SDK archive`

Latest site run with the preserved c4f9adf SDK: 398 passed, 3 failed in 61 files (2 failed). The receipt remained stable throughout the run; see `site-test-receipt.json`.

- `gallery-atmo-surfaces.test.tsx`: real editable-window/document flow.
- `publisher/product-controller.test.tsx`: imagePopover replacement anchor.
- `publisher/product-controller.test.tsx`: publishMenu replacement anchor.

No titlebar-focused test file failed in the immutable run. These failures remain visible for the owning workstreams; this report does not assert a green repository suite.
