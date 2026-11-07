/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { createSynWareNSETextOwner, bindSynWareNSETextEditingSession, createSynWareDocumentOutputPreparation, type AppWorkspaceDocumentsClient, type AppDocumentResourcesClient, type AppDocumentLocation, type AppDocumentSnapshot, type DocumentOutputPreparationResult, type DocumentOutputPlan } from "@syndromatic/syncloudos/sdk";
import { TextEditingSession, effectiveNSETextAttribute, NSEShapedTextLayoutAdapter, createNSETextPresentationTransforms, type NSETextGeometryTransform, type NSETextCoordinateSpace, type NSETextSelectionTarget, type NSEShapedTextLayoutResult } from "@syndromatic/syncloudos/nse/text";
import { TFXGlyphDrawing } from "@syndromatic/syncloudos/fx/text";
import { GFXColour, type GFXImage } from "@syndromatic/syncloudos/fx/graphics";
import { createExampleModel, textSystemDocumentType, type ExampleFlowId, type ExampleViewId, type TextSystemExampleModel } from "./model";
import { ExampleResources, examplePolicy, layoutExampleFlow } from "./layout";
import { decodeExamplePNG } from "./image";
export type ExampleAssetLease = Awaited<ReturnType<AppDocumentResourcesClient["acquire"]>>;

export interface ExampleFontTarget { readonly view: ExampleViewId; readonly selection: NSETextSelectionTarget }
/** Private opaque gesture receipt; admission also checks the originating engine and surface lifetime. */
export interface ExampleObjectTarget { readonly documentId: string; readonly revision: number; readonly objectId: string }
export interface TextSystemExampleSnapshot {
  readonly documentId: string; readonly revision: number; readonly bodyText: string; readonly captionText: string;
  readonly activeView: ExampleViewId; readonly activeFlow: ExampleFlowId;
  readonly selections: Readonly<Record<ExampleViewId, { readonly location: number; readonly length: number }>>;
  readonly geometryReady: boolean; readonly fontGeneration: number; readonly resourceGeneration: number;
  readonly fontSizeState: { readonly state: "mixed" | "unset" | "unavailable" } | { readonly state: "uniform"; readonly value: number };
  readonly history: { readonly canUndo: boolean; readonly canRedo: boolean };
  readonly zoom: number; readonly disposed: boolean; readonly error: string | null;
  readonly object: TextSystemExampleModel["object"];
  readonly objectPreview: TextSystemExampleModel["object"] | null;
  readonly canSaveNative: boolean;
}
export type ExamplePresentationResolver = (space: NSETextCoordinateSpace) => {
  readonly clientOffset: { readonly x: number; readonly y: number }; readonly screenOffset: { readonly x: number; readonly y: number };
  readonly devicePixelRatio: number;
} | null;
export interface TextSystemExample {
  readonly documentId: string;
  readonly sessions: Readonly<Record<ExampleViewId, TextEditingSession>>;
  readonly resources: ExampleResources;
  getSnapshot(): TextSystemExampleSnapshot;
  subscribe(listener: () => void): () => void;
  activate(view: ExampleViewId): void;
  select(view: ExampleViewId, anchor: number, focus?: number): void;
  insertText(view: ExampleViewId, text: string): void;
  captureFontTarget(): ExampleFontTarget;
  applyFontSize(size: number, target?: ExampleFontTarget): void;
  beginObjectMove(lifetime?: { readonly signal?: AbortSignal; readonly isCurrent?: () => boolean }): ExampleObjectTarget;
  previewObjectMove(target: ExampleObjectTarget, point: { readonly x: number; readonly y: number }): void;
  cancelObjectMove(target?: ExampleObjectTarget): void;
  commitObjectMove(target: ExampleObjectTarget): void;
  insertImage(): Promise<void>;
  saveNative(destination?: AppDocumentLocation): Promise<AppDocumentSnapshot<TextSystemExampleModel>>;
  nativeSnapshot(): AppDocumentSnapshot<TextSystemExampleModel> | null;
  assetReceipt(): { readonly descriptor: ExampleAssetLease; readonly bytes: readonly number[]; readonly active: boolean; readonly width: number; readonly height: number; readonly assetDurability: "memory" | "durable" } | null;
  isAssetLeaseActive(lease: ExampleAssetLease): boolean;
  setZoom(zoom: number): void;
  setPresentation(view: ExampleViewId, resolver: ExamplePresentationResolver | null): void;
  transformsFor(view: ExampleViewId, space?: NSETextCoordinateSpace): { readonly client?: NSETextGeometryTransform; readonly screen?: NSETextGeometryTransform };
  layoutFor(view: ExampleViewId): NSEShapedTextLayoutResult | null;
  whenReady(): Promise<void>;
  undo(): Promise<void>; redo(): Promise<void>;
  preparePDF(): Promise<DocumentOutputPreparationResult<TextSystemExampleModel>>;
  dispose(): void;
}
const flowFor = (view: ExampleViewId): ExampleFlowId => view === "caption" ? "caption" : "body";
export async function createTextSystemExample(options: {
  readonly documents: AppWorkspaceDocumentsClient;
  readonly fontBytes: Uint8Array;
  readonly initialModel?: TextSystemExampleModel;
  readonly documentResources?: AppDocumentResourcesClient;
  readonly openLocation?: AppDocumentLocation;
  readonly nativeDestination?: AppDocumentLocation;
  /** Focused Node tests inject only the pixel decoder; admission/storage/history remain real. */
  readonly decodePNG?: (bytes: Uint8Array, signal: AbortSignal) => Promise<GFXImage>;
  readonly signal?: AbortSignal;
}): Promise<TextSystemExample> {
  options.signal?.throwIfAborted();
  const documents = options.documents;
  if (!documents.transactDocument || !documents.registerEditingParticipant || !documents.settleEditing) throw new Error("This example requires admitted document editing and settlement.");
  const document = options.openLocation
    ? await documents.openDocument<TextSystemExampleModel>({ typeId: textSystemDocumentType.id, location: options.openLocation, signal: options.signal })
    : await documents.newDocument<TextSystemExampleModel>({ typeId: textSystemDocumentType.id, initialModel: options.initialModel ?? createExampleModel(), signal: options.signal });
  const lifetime = new AbortController(), signal = AbortSignal.any([lifetime.signal, ...(options.signal ? [options.signal] : [])]);
  const retainedFontBytes = options.fontBytes.slice();
  const resources = new ExampleResources(retainedFontBytes);
  const resourceClient = options.documentResources, decodePNG = options.decodePNG ?? decodeExamplePNG;
  let assetLease: ExampleAssetLease | null = null;
  const hydrateAsset = async (model: Readonly<TextSystemExampleModel>, retained: ExampleResources, operationSignal: AbortSignal) => {
    if (!model.assets.length) return null;
    if (!resourceClient) throw new Error("This native document requires the mounted scoped resource capability.");
    const lease = await resourceClient.acquireAsset(document.id, model.assets[0], operationSignal);
    try {
      const bytes = resourceClient.resolve(document.id, lease, operationSignal);
      if (!bytes) throw new Error("The scoped image lease was revoked.");
      const image = await decodePNG(bytes, operationSignal);
      operationSignal.throwIfAborted(); retained.replaceImage(image); return lease;
    } catch (failure) { resourceClient.release(document.id, lease); throw failure; }
  };
  const owners = {
    body: createSynWareNSETextOwner<TextSystemExampleModel>({ documents, documentId: document.id, flowId: "body", readContent: model => model.flows.body, writeContent: (model, body) => ({ ...model, flows: { ...model.flows, body } }), signal }),
    caption: createSynWareNSETextOwner<TextSystemExampleModel>({ documents, documentId: document.id, flowId: "caption", readContent: model => model.flows.caption, writeContent: (model, caption) => ({ ...model, flows: { ...model.flows, caption } }), signal }),
  };
  const history = documents.getUndoManager(document.id);
  const sessions = Object.freeze({
    body: new TextEditingSession({ id: "example-body", documentId: document.id, textOwner: owners.body, history, ownerSignal: signal }),
    bodyMirror: new TextEditingSession({ id: "example-body-mirror", documentId: document.id, textOwner: owners.body, history, ownerSignal: signal }),
    caption: new TextEditingSession({ id: "example-caption", documentId: document.id, textOwner: owners.caption, history, ownerSignal: signal }),
  });
  const participants = Object.values(sessions).map(session => bindSynWareNSETextEditingSession({ documents, documentId: document.id, session, lifetime: { signal } }));
  const listeners = new Set<() => void>(), presentations = new Map<ExampleViewId, ExamplePresentationResolver>();
  let disposed = false, activeView: ExampleViewId = "body", zoom = 1, layoutGeneration = 0, transformRevision = 0, error: string | null = null;
  let objectMove: { target: ExampleObjectTarget; original: TextSystemExampleModel["object"]; preview: TextSystemExampleModel["object"]; signal?: AbortSignal; isCurrent?: () => boolean; unsubscribe: () => void } | null = null;
  let layouts: Partial<Record<ExampleFlowId, NSEShapedTextLayoutResult>> = {}, ready: Promise<void> = Promise.resolve(), layoutController: AbortController | null = null;
  const currentRevision = () => documents.getDocument(document.id)?.dirtyRevision ?? -1;
  const adapters = {
    body: new NSEShapedTextLayoutAdapter({ signal, isCurrent: revision => !disposed && revision.modelRevision === currentRevision() && revision.layoutGeneration === layoutGeneration && revision.fontGeneration === resources.fontGeneration && revision.resourceGeneration === resources.resourceGeneration }),
    caption: new NSEShapedTextLayoutAdapter({ signal, isCurrent: revision => !disposed && revision.modelRevision === currentRevision() && revision.layoutGeneration === layoutGeneration && revision.fontGeneration === resources.fontGeneration && revision.resourceGeneration === resources.resourceGeneration }),
  };
  const snapshotValue = (): TextSystemExampleSnapshot => {
    if (disposed) return Object.freeze({ ...snapshot, disposed: true, geometryReady: false, objectPreview: null, history: Object.freeze({ canUndo: false, canRedo: false }) });
    const selected = sessions[activeView].getSnapshot();
    const font = effectiveNSETextAttribute(selected.model, selected.selection.range, "font", { typingAttributes: selected.typingAttributes });
    return Object.freeze<TextSystemExampleSnapshot>({
      documentId: document.id, revision: selected.model.revision,
      bodyText: sessions.body.getSnapshot().model.text, captionText: sessions.caption.getSnapshot().model.text,
      activeView, activeFlow: flowFor(activeView),
      selections: Object.freeze({ body: sessions.body.getSnapshot().selection.range, bodyMirror: sessions.bodyMirror.getSnapshot().selection.range, caption: sessions.caption.getSnapshot().selection.range }),
      geometryReady: !disposed && Object.values(layouts).length === 2 && Object.values(layouts).every(layout => layout?.complete && layout.provider.snapshot().current),
      fontGeneration: resources.fontGeneration, resourceGeneration: resources.resourceGeneration,
      fontSizeState: font.state === "uniform" ? font.value.size === undefined ? { state: "unset" } : { state: "uniform", value: font.value.size } : { state: font.state },
      history: Object.freeze({ canUndo: history.canUndo, canRedo: history.canRedo }), zoom, disposed, error,
      object: documents.getDocument<TextSystemExampleModel>(document.id)?.model.object ?? document.model.object,
      objectPreview: objectMove?.preview ?? null,
      canSaveNative: !!options.nativeDestination || !!options.openLocation,
    });
  };
  let snapshot = snapshotValue();
  const publish = () => { snapshot = snapshotValue(); for (const listener of [...listeners]) listener(); };
  const assertLive = () => { signal.throwIfAborted(); if (disposed) throw new Error("Text-system example disposed."); };
  const cancelMove = () => { if (!objectMove) return; objectMove.unsubscribe(); objectMove = null; publish(); };
  const resolveMove = (target: ExampleObjectTarget) => {
    assertLive();
    const move = objectMove, current = documents.getDocument<TextSystemExampleModel>(document.id);
    if (!move || move.target !== target || move.signal?.aborted || move.isCurrent?.() === false || !current || current.state === "closed" || current.state === "closing" || current.dirtyRevision !== target.revision || current.model.object.id !== target.objectId) {
      if (move?.target === target) cancelMove();
      throw new Error("Object move target is stale.");
    }
    return move;
  };
  const objectParticipant = documents.registerEditingParticipant<TextSystemExampleModel>(document.id, {
    id: "example-object-gesture",
    settle() { return objectMove ? { status: "refused", reason: "Commit or cancel the object preview before save, output or close." } : { status: "settled" }; },
    discard() { cancelMove(); return { status: "settled" }; },
  }, { signal });
  const relayout = () => {
    if (disposed) return;
    const generation = ++layoutGeneration, revision = currentRevision(), model = documents.getDocument<TextSystemExampleModel>(document.id)!.model;
    layoutController?.abort();
    layoutController = new AbortController();
    const operationSignal = AbortSignal.any([signal, layoutController.signal]);
    adapters.body.invalidate(); adapters.caption.invalidate(); layouts = {}; error = null; publish();
    ready = (async () => {
      try {
        await resources.prepareModelFonts(model, operationSignal);
        const next: Partial<Record<ExampleFlowId, NSEShapedTextLayoutResult>> = {};
        for (const flow of ["body", "caption"] as const) {
          signal.throwIfAborted();
          next[flow] = await layoutExampleFlow({ model, flow, resources, adapter: adapters[flow], revision: () => ({
            modelRevision: revision, layoutGeneration: generation, fontGeneration: resources.fontGeneration, resourceGeneration: resources.resourceGeneration,
            containerGeneration: 1, ownerGeneration: owners[flow].getSnapshot().ownerGeneration,
          }), signal: operationSignal });
        }
        if (generation !== layoutGeneration || disposed) return;
        layouts = next;
        if (!Object.values(next).every(layout => layout?.complete)) error = "The private sixteen-page/two-column limit was reached. Text remains canonical; PDF export refuses overflow.";
        publish();
      } catch (failure) {
        if (generation !== layoutGeneration || disposed || signal.aborted) return;
        error = String(failure); publish();
      }
    })();
  };
  const unsubscribers = [
    ...Object.values(sessions).map(session => session.subscribe(publish)),
    history.subscribe(publish),
    documents.subscribeDocument(document.id, () => { cancelMove(); relayout(); }),
  ];
  const output = createSynWareDocumentOutputPreparation<TextSystemExampleModel>({ documents, documentId: document.id, signal });
  const example: TextSystemExample = {
    documentId: document.id, sessions, resources,
    getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    activate(view) { assertLive(); activeView = view; publish(); },
    select(view, anchor, focus = anchor) { assertLive(); activeView = view; sessions[view].select(anchor, focus); publish(); },
    insertText(view, text) { assertLive(); activeView = view; sessions[view].insertText(text); },
    captureFontTarget() { assertLive(); return Object.freeze({ view: activeView, selection: sessions[activeView].captureTarget() }); },
    applyFontSize(size, target = example.captureFontTarget()) {
      assertLive();
      if (!Number.isFinite(size) || size < 1 || size > 48) throw new RangeError("Font size must be 1..48 CSS pixels.");
      if (!sessions[target.view].resolveTarget(target.selection)) throw new Error("Inspector target is stale.");
      sessions[target.view].applyAttributes({ font: { familyId: "example.noto", size } }, target.selection);
    },
    beginObjectMove(lifetime = {}) {
      assertLive(); lifetime.signal?.throwIfAborted();
      if (lifetime.isCurrent?.() === false) throw new Error("Object surface mount is stale.");
      cancelMove();
      const current = documents.getDocument<TextSystemExampleModel>(document.id);
      if (!current || current.state === "closed" || current.state === "closing") throw new Error("Object document is closed or unavailable.");
      const target = Object.freeze({ documentId: document.id, revision: current.dirtyRevision, objectId: current.model.object.id });
      const abort = () => { if (objectMove?.target === target) cancelMove(); };
      lifetime.signal?.addEventListener("abort", abort, { once: true });
      objectMove = { target, original: current.model.object, preview: current.model.object, ...lifetime, unsubscribe: () => lifetime.signal?.removeEventListener("abort", abort) };
      publish(); return target;
    },
    previewObjectMove(target, point) {
      const move = resolveMove(target);
      if (![point.x, point.y].every(Number.isFinite)) throw new RangeError("Object coordinates must be finite.");
      objectMove!.preview = Object.freeze({ ...move.original, x: Math.max(16, Math.min(284 - move.original.width, point.x)), y: Math.max(16, Math.min(204 - move.original.height, point.y)) });
      publish();
    },
    cancelObjectMove(target) { if (!target || objectMove?.target === target) cancelMove(); },
    commitObjectMove(target) {
      const move = resolveMove(target), next = move.preview;
      if (next.x === move.original.x && next.y === move.original.y) { cancelMove(); return; }
      const result = documents.transactDocument<TextSystemExampleModel>(document.id, current => {
        resolveMove(target);
        if (current.object.id !== target.objectId) throw new Error("Object identity changed.");
        return { ...current, object: next };
      }, { expectedRevision: target.revision, actionName: "Move object", signal });
      if (result.status === "rejected") throw result.error;
      cancelMove();
    },
    async insertImage() {
      assertLive();
      if (!resourceClient?.assetCapabilities) throw new Error("The host has not supplied scoped asset storage.");
      const before = documents.getDocument<TextSystemExampleModel>(document.id)!;
      if (before.model.assets.length) throw new Error("The private example already has its single image asset.");
      const bytes = resources.image!.toPNG();
      const lease = await resourceClient.acquire(document.id, { type: "image/png", size: bytes.length, arrayBuffer: async () => bytes.slice().buffer }, signal);
      let admitted = false;
      try {
        const reference = await resourceClient.persist(document.id, lease, signal);
        assertLive();
        const next = { ...before.model, assets: [reference] };
        const prepared = await resourceClient.prepareEdit(document.id, before.model, next, { signal });
        try {
          assertLive();
          const result = documents.transactDocument<TextSystemExampleModel>(document.id, () => next, { expectedRevision: prepared.expectedRevision, actionName: "Insert image", retainResources: prepared.retainResources, signal });
          if (result.status === "rejected") throw result.error;
          admitted = true; assetLease = lease;
        } finally { await prepared.release(); }
      } finally { if (!admitted) resourceClient.release(document.id, lease); }
      await example.whenReady();
    },
    async saveNative(destination = options.nativeDestination) {
      assertLive();
      const currentLocation = documents.getDocument(document.id)?.location;
      const sameLocation = destination && currentLocation && JSON.stringify(destination, Object.keys(destination).sort()) === JSON.stringify(currentLocation, Object.keys(currentLocation).sort());
      if (destination && !sameLocation) await documents.saveAsDocument({ documentId: document.id, destination, signal });
      else await documents.saveDocument(document.id, { signal });
      assertLive(); return documents.getDocument<TextSystemExampleModel>(document.id)!;
    },
    nativeSnapshot: () => documents.getDocument<TextSystemExampleModel>(document.id),
    assetReceipt() {
      if (!assetLease || !resourceClient?.assetCapabilities) return null;
      const bytes = resourceClient.resolve(document.id, assetLease);
      return { descriptor: assetLease, bytes: bytes ? Array.from(bytes) : [], active: resourceClient.isActive(document.id, assetLease), width: resources.image?.width ?? 0, height: resources.image?.height ?? 0, assetDurability: resourceClient.assetCapabilities.durability };
    },
    isAssetLeaseActive(lease) { try { return resourceClient?.isActive(document.id, lease) ?? false; } catch { return false; } },
    setZoom(value) { assertLive(); if (!Number.isFinite(value) || value < .5 || value > 2) throw new RangeError("Zoom must be 0.5..2."); zoom = value; transformRevision++; publish(); },
    setPresentation(view, resolver) { if (resolver) presentations.set(view, resolver); else presentations.delete(view); transformRevision++; },
    transformsFor(view, requestedSpace) {
      const layout = layouts[flowFor(view)], state = sessions[view].getSnapshot();
      const caret = layout?.provider.caret({ ...layout.provider.snapshot(), offset: state.selection.focus, affinity: state.selection.affinity });
      const space = requestedSpace ?? caret?.primary.space;
      const presentation = space && presentations.get(view)?.(space);
      if (!presentation || !space) return {};
      const transforms = createNSETextPresentationTransforms({ layoutSpace: space, revision: transformRevision, zoom, scroll: { x: 0, y: 0 }, ...presentation });
      return { client: transforms.client, screen: transforms.screen };
    },
    layoutFor: view => layouts[flowFor(view)] ?? null,
    async whenReady() { let operation: Promise<void>; do { operation = ready; await operation; } while (operation !== ready); },
    async undo() { assertLive(); await history.undo(); await example.whenReady(); publish(); },
    async redo() { assertLive(); await history.redo(); await example.whenReady(); publish(); },
    preparePDF: () => output.prepare({ purpose: "export", configurationId: "private-fixed-columns-v1", engine: async (captured, outputSignal) => {
      const retained = new ExampleResources(retainedFontBytes);
      const bodyAdapter = new NSEShapedTextLayoutAdapter({ signal: outputSignal }), captionAdapter = new NSEShapedTextLayoutAdapter({ signal: outputSignal });
      let outputAssetLease: ExampleAssetLease | null = null;
      try {
        await retained.ready(outputSignal);
        outputAssetLease = await hydrateAsset(captured.model, retained, outputSignal);
        await retained.prepareModelFonts(captured.model, outputSignal);
        const revision = () => ({ modelRevision: captured.revision, layoutGeneration: 0, fontGeneration: retained.fontGeneration, resourceGeneration: retained.resourceGeneration, containerGeneration: 1, ownerGeneration: 0 });
        const body = await layoutExampleFlow({ model: captured.model, flow: "body", resources: retained, adapter: bodyAdapter, revision, signal: outputSignal });
        const caption = await layoutExampleFlow({ model: captured.model, flow: "caption", resources: retained, adapter: captionAdapter, revision, signal: outputSignal });
        if (!body.complete || !caption.complete) throw new Error("Private output policy refuses truncated/overflowing text.");
        const indices = body.containers.filter(box => box.outcome === "consumed" || box.outcome === "empty").map(box => box.containerIndex);
        const pages = Math.max(1, Math.ceil((Math.max(0, ...indices) + 1) / 2));
        const plan: DocumentOutputPlan<TextSystemExampleModel> = {
          metadata: { title: captured.model.title },
          dependencies: [
            { id: "example-snapshot-fonts", kind: "font", retain: () => ({ status: "retained", lease: { value: retained, release: () => retained.dispose() } }) },
            { id: "example-snapshot-layout-and-image", kind: "resource", retain: () => ({ status: "retained", lease: { value: { body, caption, image: retained.image }, release: () => { bodyAdapter.dispose(); captionAdapter.dispose(); if (outputAssetLease) resourceClient!.release(document.id, outputAssetLease); } } }) },
          ],
          pages: Array.from({ length: pages }, (_, page) => ({
            geometry: { width: (examplePolicy.boxWidth * 2 + examplePolicy.boxGap + 32) * .75, height: (examplePolicy.boxHeight + examplePolicy.captionHeight + 48) * .75 },
            draw(context) {
              context.setFillColour(GFXColour.rgba(.08, .13, .12));
              const drawBox = (layout: NSEShapedTextLayoutResult, index: number, x: number, y: number) => {
                context.save(); context.concatTransform({ a: .75, b: 0, c: 0, d: .75, tx: x * .75, ty: y * .75 });
                for (const frame of layout.frames.filter(record => record.containerId === `container:${index}`)) for (const line of frame.frame.lines) context.drawPositionedText(TFXGlyphDrawing.pdfTextRunsForLine(line.line, line.origin));
                context.restore();
              };
              drawBox(body, page * 2, 16, 16); drawBox(body, page * 2 + 1, 16 + examplePolicy.boxWidth + examplePolicy.boxGap, 16);
              if (page === 0) {
                context.drawImage(retained.image!, { x: (16 + captured.model.object.x) * .75, y: (16 + captured.model.object.y) * .75, width: captured.model.object.width * .75, height: captured.model.object.height * .75 });
                drawBox(caption, 0, 16, examplePolicy.boxHeight + 32);
              }
            },
          })),
        };
        return plan;
      } catch (failure) { bodyAdapter.dispose(); captionAdapter.dispose(); retained.dispose(); if (outputAssetLease) resourceClient!.release(document.id, outputAssetLease); throw failure; }
    } }),
    dispose() {
      if (disposed) return;
      disposed = true; layoutGeneration++; layoutController?.abort();
      if (assetLease) resourceClient?.release(document.id, assetLease);
      cancelMove(); objectParticipant.dispose();
      for (const unsubscribe of unsubscribers) unsubscribe();
      for (const participant of participants) participant.dispose();
      for (const session of Object.values(sessions)) session.dispose();
      owners.body.dispose(); owners.caption.dispose(); adapters.body.dispose(); adapters.caption.dispose(); resources.dispose();
      layouts = {}; publish(); listeners.clear(); lifetime.abort(); options.signal?.removeEventListener("abort", example.dispose);
    },
  };
  options.signal?.addEventListener("abort", example.dispose, { once: true });
  try { await resources.ready(signal); assetLease = await hydrateAsset(document.model, resources, signal); relayout(); await example.whenReady(); return example; }
  catch (failure) { example.dispose(); throw failure; }
}
