# Text System example

A small SynWare that shows how an application builds its own document engine on the framework's shared text, document and output primitives. Read it alongside the [custom document engines guide](../../docs/framework/custom-document-engines.md).

The document holds a title, a body and a caption as attributed flows, plus one movable image object. Two views edit the body through the same owner with independent sessions, and every edit goes through the document's admitted transaction and undo history.

- **Layout policy belongs to the example.** The engine lays the body into 300 × 220 CSS-pixel boxes across up to sixteen two-column pages with one exclusion, and the caption into a 300 × 90 box. Overflow stays in the model and makes PDF preparation fail rather than truncate silently. This is example policy, not a framework paginator.
- **Fonts come from the host.** `Contents/index.tsx` default-exports the application component. `createTextSystemExampleApp({ loadFontBytes, … })` binds its licensed-font loader; the host supplies that component as the entry module's default export in an explicit project composition and registers `textSystemDocumentType` before mounting. The manifest only declares the type.
- **Object moves are transactions.** Dragging the image shows a transient preview; releasing commits one revision-fenced transaction named `Move object` that a single undo reverses. Escape, pointer cancellation or unmounting discards the preview, and save or export refuse while a preview is unsettled.
- **Output is captured.** Snapshot PDF export settles every session, captures one immutable revision and draws it with separately retained fonts, layout and image.

`Host/bootstrap.tsx` is the trusted host. It alone imports the browser host and storage entries; the application modules use only the SDK, NSE and FX entries.

## Running it

From a checkout of the framework:

```bash
npm ci --ignore-scripts
node examples/TextSystem.app/Contents/__tests__/check-types.mjs
npx vitest run tests/integration/text-system-example.test.ts
npx playwright test tests/e2e/custom-text-surface.spec.ts --project=chromium
```

The browser test serves `tests/e2e/fixtures/custom-text-surface.html`, which mounts this example with the Noto Sans test font.
