# Custom document engines

An application owns its native model, type codec, semantic flows and composition policy. The framework supplies document transactions/history, portable attributed content, transient editing sessions, shaped geometry, native input cooperation and captured output. Keep layout frames, resolved fonts, backend nodes and view selections out of the native model.

The example in `examples/TextSystem.app` stores only a title, body and caption `NSEAttributedContent`, and one object rectangle. Its type ID and fixed column policy are example details. They are not public document schemas. The trusted host registers the example's `DocumentType`; declaring that type in a SynWare manifest grants metadata/admission scope but does not register a codec.

Import authoring capabilities from public entries:

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

For each flow, adapt the actual admitted document capability:

```ts
const bodyOwner = createSynWareNSETextOwner<MyModel>({
  documents, documentId, flowId: "body", signal,
  readContent: model => model.flows.body,
  writeContent: (model, body) => ({ ...model, flows: { ...model.flows, body } }),
});
const history = documents.getUndoManager(documentId);
const body = new TextEditingSession({ id: "body", owner: bodyOwner, documentId, history, signal });
const mirror = new TextEditingSession({ id: "mirror", owner: bodyOwner, documentId, history, signal });
const binding = bindSynWareNSETextEditingSession({ documents, documentId, session: body, lifetime: { signal } });
```

`createSynWareNSETextOwner<TModel>` takes `documents: AppWorkspaceDocumentsClient`, `documentId: string`, `flowId: string`, `readContent(model): NSEAttributedContent`, `writeContent(model, content): TModel` and optional `signal`. Each commit performs one `transactDocument` at the captured canonical revision. Two body views share that owner. Caption gets another owner projecting a different field of the same document. Both owners use the same document history, so a caption edit and a body edit participate in one chronological undo stack. Bind every editable session to the document's settlement barrier.

Each session owns selection, typing attributes and marked drafts. An inspector captures `session.captureTarget()` before focus moves, resolves it before applying, and refuses an expired or changed target. Focus movement alone does not redirect a retained target. A different view's session has independent selection even when its text comes from the same owner. Do not maintain a second canonical editor tree or app-level undo stack.

Composition starts with app-supplied resources and boxes:

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

The application decides page count, column order, object placement, continuation and overflow treatment. The adapter reports consumed/overflow ranges and per-container no-progress. It does not invent pages or anchor/wrap policy. The example supplies up to 32 body boxes in one ordered request. Its explicit policy is two columns per page, sixteen pages maximum, first box excludes the object, caption stays in its own box. It preserves overflow content and refuses incomplete PDF output.

The app resolves and retains fonts and assets before publishing geometry. Track canonical revision plus font, resource, container, layout and owner generations. Invalidate old providers immediately on edits or resource changes; cancel superseded projection/layout work. A completed older request must never replace newer geometry. The example bounds its font set and resolves all sizes in both flows before constructing either current provider. It copies the supplied font bytes at admission, so later mutation of a caller's buffer cannot silently switch the captured output font.

Custom surfaces use `new NSETextInputClient({ session, geometry, transforms, signal? })` and a stable `<NSETextInputHost client={client} label="Body" />`. Use its typed `getSnapshot()` for the logical reading projection, projected selection, marked range and composing state. The native host remains mounted across shaping updates. It cooperates with beforeinput, native selection, paste and composition; SVG/canvas is decorative and aria-hidden. Synchronize shaped hit testing with the same session and coordinate transforms. Unsupported/stale/draft geometry remains explicitly pending. See `text-geometry.md`.

Captured output uses a settled document revision:

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

The engine supplies physical page dimensions in PDF points, drawing callbacks and explicit dependency retain/release operations. It draws the captured semantic model; it must not query live view layout during output. The example shapes that snapshot with separate retained fonts, frames and image, and emits searchable positioned text through public GraphicsFX. It converts CSS layout coordinates to PDF points with an explicit 72/96 transform. Output cannot dirty the document or alter canonical history. A marked draft refuses preparation; cancellation/release drops only output-owned retention. Abandon an unused prepared output with `prepared.output.release()`.

Dispose input clients, participant bindings, sessions, owners, adapters and app-owned resources with their lifetimes. Do not release fonts/assets borrowed from another owner. No raw runtime, document manager, vendor backend or application-specific model is required by an application engine.

The example's deterministic integration tests cover transaction projection, independent selections, inspector targeting, continuation/exclusion, stale providers, superseded work, marked-output refusal, immutable searchable PDF and page-limit refusal; browser checks exercise the same example in Chromium, Firefox and WebKit.
