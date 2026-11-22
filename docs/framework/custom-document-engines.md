# Custom document engines

This guide shows how to build your own document engine, such as a page layout application, on the framework's text and document services. Your application owns its document model, its codec, its text flows and its layout rules. The framework supplies document transactions and undo, portable attributed content, editing sessions, shaped geometry, keyboard and input-method handling, and output for printing and export. Keep layout frames, resolved fonts, editor internals and view selections out of your document model.

The example in `examples/TextSystem.app` stores only a title, a body and a caption as `NSEAttributedContent`, plus one object rectangle. Its type ID and fixed columns are specific to the example, not a public document format. The host registers the example's `DocumentType`: declaring a type in a SynWare manifest lets the application use it, but doesn't register its codec.

Import what you need from the public entries:

```ts
import {
  createSynWareNSETextOwner, bindSynWareNSETextEditingSession,
  createSynWareDocumentOutputPreparation,
  type AppWorkspaceDocumentsClient,
} from "@syndromatic/syncloudos/sdk";
import {
  TextEditingSession, NSETextInputClient, NSETextInputHost,
  projectNSEAttributedContentToTFX, NSEShapedTextLayoutAdapter,
} from "@syndromatic/syncloudos/nse/text";
import { TFXTextContainer } from "@syndromatic/syncloudos/fx/text";
```

For each text flow, create a text owner on the document client:

```ts
const bodyOwner = createSynWareNSETextOwner<MyModel>({
  documents, documentId, flowId: "body", signal,
  readContent: model => model.flows.body,
  writeContent: (model, body) => ({ ...model, flows: { ...model.flows, body } }),
});
const history = documents.getUndoManager(documentId);
const body = new TextEditingSession({ id: "body", textOwner: bodyOwner, documentId, history, ownerSignal: signal });
const mirror = new TextEditingSession({ id: "mirror", textOwner: bodyOwner, documentId, history, ownerSignal: signal });
const binding = bindSynWareNSETextEditingSession({ documents, documentId, session: body, lifetime: { signal } });
```

`createSynWareNSETextOwner<TModel>` takes `documents` (the `AppWorkspaceDocumentsClient` from `SCOS.documents.workspaceDocuments`), `documentId`, `flowId`, `readContent(model): NSEAttributedContent`, `writeContent(model, content): TModel` and an optional `signal`. Each commit is one `transactDocument` at the revision the owner last read. Here two body views share one owner, and the caption gets another owner for a different field of the same document. Both use the document's undo history, so caption and body edits share one undo stack in the order they happened. Bind every editable session with `bindSynWareNSETextEditingSession` so Save and Close wait for it.

Each session has its own selection, typing attributes and in-progress input-method text. An inspector calls `session.captureTarget()` before focus moves, checks the target again before applying a change, and refuses if it has expired or changed; moving focus alone doesn't redirect a captured target. Another view's session keeps its own selection even when it edits the same owner. Don't keep a second copy of the text or a separate undo stack in your application.

Layout starts from fonts and boxes your application supplies:

```ts
const projection = await projectNSEAttributedContentToTFX(content, {
  units: "css-pixels", resolveFont: attributes => appFonts.resolve(attributes), signal,
});
const result = await adapter.layout({
  flowId: "body", revision, projection, signal,
  containers: [
    new TFXTextContainer({ size: { width: 300, height: 220 }, flowOrder: 0,
      insets: { inlineStart: 16, inlineEnd: 16, blockStart: 16, blockEnd: 16 },
      exclusionRects: [appObjectRectangle] }),
    new TFXTextContainer({ size: { width: 300, height: 220 }, flowOrder: 1 }),
  ],
});
```

Your application decides how many pages there are, the column order, where objects go, how text continues and what happens to overflow. The adapter reports the consumed and overflow ranges and which containers made no progress, but never adds pages or decides how text wraps around anchored objects. The example sends up to 32 body boxes in one ordered request: two columns per page, at most sixteen pages, with the object excluded from the first box and the caption in a box of its own. It keeps overflowing text and refuses to produce an incomplete PDF.

Resolve and retain fonts and assets before you publish geometry. Track the model revision and the font, resource, container, layout and owner generations. When an edit or a resource changes, invalidate the old providers at once and cancel any projection or layout work it makes obsolete, so an older request that finishes late never replaces newer geometry. The example limits its set of fonts and resolves every size in both flows before building either provider. It copies font bytes when it receives them, so a caller changing its buffer later can't change the font in the output.

A custom surface uses `new NSETextInputClient({ session, geometry, transforms, signal? })` and a stable `<NSETextInputHost client={client} label="Body" />`. The client's typed `getSnapshot()` gives the text in reading order, the selection, the input-method range and whether composition is in progress. The input host stays mounted while shaping updates, and handles `beforeinput`, native selection, paste and composition, while the SVG or canvas drawing is decorative and `aria-hidden`. Hit-test shaped text with the same session and coordinate transforms. Geometry that's unsupported, stale or for in-progress text stays pending. See [Text geometry](text-geometry.md).

Output works from a settled revision of the document:

```ts
const output = createSynWareDocumentOutputPreparation<MyModel>({ documents, documentId, signal });
const prepared = await output.prepare({
  purpose: "export", configurationId: "my-private-policy-v1",
  engine: async (snapshot, outputSignal) => appEngine.planPDF(snapshot, outputSignal),
});
if (prepared.status === "prepared") {
  const result = await prepared.output.exportPDF();
  // Use result.bytes only when result.status === "exported".
}
```

The engine supplies page sizes in PDF points, drawing callbacks, and operations to retain and release what it depends on. It draws the captured model and must not read the live view's layout. The example shapes the snapshot with its own retained fonts, frames and image, and writes searchable, positioned text through GraphicsFX, converting CSS layout coordinates to PDF points with a 72/96 scale. Output never marks the document as edited or changes its history. Preparation is refused while an input method is composing, and cancelling or releasing drops only what the output retained. Release a prepared output you don't use with `prepared.output.release()`.

Dispose input clients, participant bindings, sessions, owners, adapters and your own resources when their lifetimes end, but don't release fonts or assets that belong to someone else. An engine built this way needs no access to the runtime, the document manager or a third-party editor.

The example's integration tests cover transactions, independent selections, inspector targeting, continuation and exclusions, stale providers, superseded work, refusing output during composition, searchable PDF output and the page limit. Browser checks run the same example in Chromium, Firefox and WebKit.
