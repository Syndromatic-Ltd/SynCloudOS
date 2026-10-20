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

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { attributedContent, paragraph, textRun, NSETextInputClient } from "@syndromatic/syncloudos/nse/text";
import { createTextSystemExample } from "../../examples/TextSystem.app/Contents/example";
import { createExampleModel, textSystemDocumentType, type TextSystemExampleModel } from "../../examples/TextSystem.app/Contents/model";
// Internal machinery is confined to this host-side test driver. The app has only public imports.
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "../runtime/helpers";
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import { GFXImage } from "@syndromatic/syncloudos/fx/graphics";
import type { AppDocumentLocation } from "@syndromatic/syncloudos/sdk";

const cleanups: Array<() => unknown | Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const fontBytes = new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf"));
const assetScope = { authorizationId: "com.example.example.text-system", documentId: "example-native" };
const nativeLocation = { kind: "memory", namespace: "text-system-test", key: assetScope.documentId } as const;
async function fixture(initialModel = createExampleModel(), persistence?: { adapter: InMemoryDocumentAdapter; store: ReturnType<typeof createInMemoryDocumentAssetStore>; openLocation?: AppDocumentLocation }) {
  const environment = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ environment, applicationDocuments: { initialTypes: [textSystemDocumentType], ...(persistence ? {
    initialAdapters: [persistence.adapter], assetBacking: { store: persistence.store, scopeForDocument: () => assetScope,
      manifest: { enumerateReferences: value => (value as TextSystemExampleModel).assets, scopeForLocation: () => assetScope, nativeDurability: "memory" as const } },
  } : {}) } });
  cleanups.push(() => runtime.dispose("test"));
  registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.example.text-system", version: "0.1.0", displayName: "Text system", routes: [{ path: "/text-system", primary: true }], documentTypes: [{ id: textSystemDocumentType.id, displayName: textSystemDocumentType.displayName }] });
  const mounted = mountTestSynWareRuntime(runtime, "com.example.example.text-system");
  cleanups.push(() => mounted.dispose("test"));
  const app = createSynWareContextValue(mounted.runtime);
  const { workspaceDocuments: documents, documentResources } = app.documents;
  const sourceFontBytes = fontBytes.slice();
  const example = await createTextSystemExample({ documents, documentResources, fontBytes: sourceFontBytes, initialModel, signal: app.signal,
    ...(persistence ? { openLocation: persistence.openLocation, nativeDestination: nativeLocation,
      decodePNG: async (bytes: Uint8Array) => {
        expect(Array.from(bytes.subarray(0, 8))).toEqual([137,80,78,71,13,10,26,10]);
        return new GFXImage({ width: 2, height: 2, alpha: "opaque", colourSpace: "srgb", data: new Uint8Array([31,100,90,255,55,139,122,255,55,139,122,255,31,100,90,255]) });
      } } : {}) });
  cleanups.push(() => example.dispose());
  return { example, documents, sourceFontBytes, runtime, mounted };
}

describe("private public-package TextSystem engine", () => {
  it("disposes retained image resources after the originating app mount is revoked", async () => {
    const environment = createTestRuntimeEnvironment(), store = createInMemoryDocumentAssetStore();
    cleanups.push(() => store.dispose());
    const current = await fixture(createExampleModel(), { adapter: new InMemoryDocumentAdapter(environment), store });
    await current.example.insertImage(); await current.example.saveNative();
    const lease = current.example.assetReceipt()!.descriptor;
    await current.mounted.dispose("revoke-before-example-cleanup");
    await current.runtime.dispose("revoke-before-example-cleanup");
    expect(() => current.example.dispose()).not.toThrow();
    expect(current.example.isAssetLeaseActive(lease)).toBe(false);
    expect(current.example.getSnapshot()).toMatchObject({ disposed: true, geometryReady: false });
  });

  it("admits a scoped image, saves its native references and reacquires verified bytes in a fresh mounted runtime", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new InMemoryDocumentAdapter(environment), store = createInMemoryDocumentAssetStore();
    cleanups.push(() => store.dispose());
    const first = await fixture(createExampleModel(), { adapter, store });
    const revision = first.example.getSnapshot().revision;
    await first.example.insertImage();
    expect(first.example.getSnapshot().revision).toBe(revision + 1);
    const asset = first.example.assetReceipt()!;
    expect(asset.active).toBe(true);
    expect(first.example.nativeSnapshot()!.model.assets).toHaveLength(1);
    await first.example.undo();
    expect(first.example.nativeSnapshot()!.model.assets).toEqual([]);
    await first.example.redo();
    const move = first.example.beginObjectMove();
    first.example.previewObjectMove(move, { x: 166, y: 16 }); first.example.commitObjectMove(move);
    first.example.select("caption", 0, 6); first.example.insertText("caption", "Saved ");
    const provisional = first.example.beginObjectMove(); first.example.previewObjectMove(provisional, { x: 70, y: 70 });
    await expect(first.example.saveNative()).rejects.toThrow(/object|editing|settle|preview/i);
    expect(first.example.getSnapshot().objectPreview).toMatchObject({ x: 70, y: 70 });
    first.example.cancelObjectMove(provisional);
    const saved = await first.example.saveNative();
    expect(saved.state).toBe("clean");
    expect(saved.model.object).toMatchObject({ x: 166, y: 16 });
    expect(first.example.getSnapshot().objectPreview).toBeNull();
    const nativeRecord = await adapter.read<TextSystemExampleModel>(nativeLocation);
    expect(nativeRecord!.content).toEqual(saved.model);
    expect(nativeRecord!.metadata["syncloudos.document.assets.v1"]).toContain(saved.model.assets[0].hash);
    first.example.dispose();
    expect(first.example.isAssetLeaseActive(asset.descriptor)).toBe(false);
    await first.mounted.dispose("fresh-host-test"); await first.runtime.dispose("fresh-host-test");
    const second = await fixture(createExampleModel(), { adapter, store, openLocation: nativeLocation });
    const reopened = second.example.nativeSnapshot()!;
    expect(reopened.id).not.toBe(saved.id);
    expect(reopened.model).toEqual(saved.model);
    expect(reopened.currentVersion).toEqual(saved.currentVersion);
    const fresh = second.example.assetReceipt()!;
    expect(fresh.bytes).toEqual(asset.bytes);
    expect(fresh.descriptor.leaseId).not.toBe(asset.descriptor.leaseId);
    expect(fresh).toMatchObject({ active: true, width: 2, height: 2, assetDurability: "memory" });
    expect(second.example.isAssetLeaseActive(asset.descriptor)).toBe(false);
    second.example.insertText("body", "Fresh "); await second.example.undo();
    expect(second.example.nativeSnapshot()!.model).toEqual(saved.model);
    expect(second.example.getSnapshot().geometryReady, second.example.getSnapshot().error ?? "").toBe(true);
    const output = await second.example.preparePDF();
    expect(output.status, output.status === "prepared" ? "" : JSON.stringify(output.receipt)).toBe("prepared");
    if (output.status === "prepared") {
      const pdf = await output.output.exportPDF(); expect(pdf.status).toBe("exported");
    }
    expect(second.example.isAssetLeaseActive(fresh.descriptor)).toBe(true);
  });

  it("previews/cancels an object without native publication, then commits once through shared history", async () => {
    const { example, documents } = await fixture();
    const before = documents.getDocument<TextSystemExampleModel>(example.documentId)!;
    const target = example.beginObjectMove();
    example.previewObjectMove(target, { x: 100, y: 70 });
    expect(example.getSnapshot().objectPreview).toMatchObject({ x: 100, y: 70 });
    expect(documents.getDocument(example.documentId)?.model).toEqual(before.model);
    expect(example.getSnapshot().revision).toBe(before.dirtyRevision);
    expect(example.getSnapshot().history.canUndo).toBe(false);
    example.cancelObjectMove(target);
    expect(example.getSnapshot().objectPreview).toBeNull();
    const commitTarget = example.beginObjectMove();
    example.previewObjectMove(commitTarget, { x: 100, y: 70 });
    example.commitObjectMove(commitTarget);
    expect(documents.getDocument<TextSystemExampleModel>(example.documentId)?.model.object).toMatchObject({ x: 100, y: 70 });
    expect(example.getSnapshot().revision).toBe(before.dirtyRevision + 1);
    expect(example.getSnapshot().bodyText).toBe(before.model.flows.body.blocks.map(p => p.runs.map(r => r.kind === "text" ? r.text : "\ufffc").join("")).join("\n"));
    await example.undo();
    expect(documents.getDocument<TextSystemExampleModel>(example.documentId)?.model).toEqual(before.model);
    expect(example.getSnapshot().history.canUndo).toBe(false);
    await example.redo();
    expect(example.getSnapshot().object).toMatchObject({ x: 100, y: 70 });
  });

  it("fences object targets independently by revision, originating surface mount and engine lifetime", async () => {
    const { example, documents } = await fixture();
    const target = example.beginObjectMove();
    example.previewObjectMove(target, { x: 90, y: 90 });
    example.insertText("caption", "Competing edit ");
    const competing = documents.getDocument(example.documentId);
    expect(() => example.commitObjectMove(target)).toThrow(/stale/i);
    expect(documents.getDocument(example.documentId)).toEqual(competing);
    const mount = new AbortController();
    const mountedTarget = example.beginObjectMove({ signal: mount.signal });
    example.previewObjectMove(mountedTarget, { x: 90, y: 90 });
    mount.abort();
    expect(example.getSnapshot().objectPreview).toBeNull();
    expect(() => example.commitObjectMove(mountedTarget)).toThrow();
    const retired = example.beginObjectMove();
    const replacement = example.beginObjectMove();
    expect(() => example.previewObjectMove(retired, { x: 80, y: 80 })).toThrow(/stale/i);
    example.previewObjectMove(replacement, { x: 80, y: 80 });
    example.dispose();
    expect(() => example.commitObjectMove(replacement)).toThrow();
    expect(documents.getDocument(example.documentId)).toEqual(competing);
  });

  it("refuses captured object targets and new previews after the canonical document closes", async () => {
    const { example, documents, runtime } = await fixture();
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    const target = example.beginObjectMove();
    example.cancelObjectMove(target);
    expect(await documents.closeDocument(example.documentId)).toMatchObject({ outcome: "closed" });
    expect(() => example.beginObjectMove()).toThrow(/closed|unavailable|aborted/i);
    expect(() => example.commitObjectMove(target)).toThrow();
  });

  it("refuses save/output while an object preview is unsettled, then captures only its canceled canonical pose", async () => {
    const { example, documents } = await fixture();
    const before = example.getSnapshot();
    let target = example.beginObjectMove();
    example.previewObjectMove(target, { x: 50, y: 50 });
    expect(await documents.settleEditing!(example.documentId, "save")).toMatchObject({ status: "refused", participantId: "example-object-gesture" });
    expect(await example.preparePDF()).toMatchObject({ status: "refused" });
    expect(example.getSnapshot().objectPreview).toMatchObject({ x: 50, y: 50 });
    example.cancelObjectMove(target);
    expect(() => example.commitObjectMove(target)).toThrow(/stale/i);
    target = example.beginObjectMove();
    example.previewObjectMove(target, { x: 60, y: 60 });
    expect(await example.preparePDF()).toMatchObject({ status: "refused" });
    example.cancelObjectMove(target);
    const prepared = await example.preparePDF();
    expect(prepared.status).toBe("prepared");
    expect(example.getSnapshot().objectPreview).toBeNull();
    expect(example.getSnapshot().object).toEqual(before.object);
    expect(example.getSnapshot().revision).toBe(before.revision);
    expect(example.getSnapshot().history.canUndo).toBe(false);
    if (prepared.status === "prepared") prepared.output.release();
  });

  it("shares one canonical document across two flows and independently selected body views", async () => {
    const { example, documents } = await fixture();
    example.select("bodyMirror", 8, 8);
    example.select("body", 0, 5);
    const before = example.getSnapshot();
    example.insertText("body", "Hello");
    const changed = example.getSnapshot();
    expect(changed.revision).toBe(before.revision + 1);
    expect(changed.captionText).toBe(before.captionText);
    expect(changed.selections.bodyMirror).toEqual({ location: 8, length: 0 });
    expect(changed.bodyText).toBe(example.sessions.bodyMirror.getSnapshot().model.text);
    expect(documents.getDocument(example.documentId)?.dirtyRevision).toBe(changed.revision);
    await example.undo();
    expect(example.getSnapshot().bodyText).toBe(before.bodyText);
    expect(example.getSnapshot().history.canUndo).toBe(false);
    await example.redo();
    expect(example.getSnapshot().bodyText).toBe(changed.bodyText);
  });

  it("retains the inspector target across active-view changes and reports mixed sizes", async () => {
    const { example } = await fixture();
    example.select("body", 0, 20);
    expect(example.getSnapshot().fontSizeState).toEqual({ state: "mixed" });
    const target = example.captureFontTarget();
    example.activate("caption");
    const caption = example.sessions.caption.getSnapshot().model.attributedContent;
    example.applyFontSize(22, target);
    expect(example.sessions.caption.getSnapshot().model.attributedContent).toEqual(caption);
    example.activate("body");
    expect(example.getSnapshot().fontSizeState).toEqual({ state: "uniform", value: 22 });
    await example.whenReady();
    expect(example.getSnapshot().geometryReady).toBe(true);
  });

  it("supplies explicit continuation boxes/exclusions, rejects stale geometry and preserves semantic text", async () => {
    const model = createExampleModel();
    const body = attributedContent(Array.from({ length: 36 }, (_, i) => paragraph([textRun(`Paragraph ${i}: app-supplied columns continue this flow without storing frames in the native model.`)])));
    const { example, documents } = await fixture({ ...model, flows: { ...model.flows, body } });
    await example.whenReady();
    const layout = example.layoutFor("body")!;
    expect(layout.complete, example.getSnapshot().error ?? "").toBe(true);
    expect(new Set(layout.frames.map((item: { containerId: string }) => item.containerId)).size).toBeGreaterThan(2);
    expect(layout.frames[0].frame.lines.every((item: any) => item.origin.x + item.line.width - item.line.trailingWhitespaceWidth <= model.object.x || item.origin.x >= model.object.x + model.object.width || item.origin.y - item.line.ascent >= model.object.y + model.object.height)).toBe(true);
    const retained = layout.provider;
    example.insertText("caption", "A");
    expect(retained.snapshot().current).toBe(false);
    await example.whenReady();
    expect(example.layoutFor("body")!.provider.snapshot()).toMatchObject({ current: true, complete: true, revision: { modelRevision: example.getSnapshot().revision } });
    expect(JSON.stringify(documents.getDocument(example.documentId)?.model)).not.toMatch(/glyphId|containerId|fontGeneration/);
  });

  it("exports the captured revision without dirtying history or releasing live view fonts", async () => {
    const { example } = await fixture();
    const before = example.getSnapshot();
    const pending = example.preparePDF();
    const prepared = await pending;
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") throw new Error(JSON.stringify(prepared.receipt));
    example.insertText("body", "Later edit ");
    const result = await prepared.output.exportPDF();
    expect(result.status).toBe("exported");
    if (result.status !== "exported") throw new Error(JSON.stringify(result.receipt));
    expect(new TextDecoder().decode(result.bytes.subarray(0, 8))).toContain("%PDF-");
    expect(result.receipt.revision).toBe(before.revision);
    expect(result.receipt.pages.length).toBeGreaterThan(0);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: result.bytes.slice(), useSystemFonts: false, disableFontFace: true });
    try {
      const pdf = await task.promise;
      let extracted = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i), text = await page.getTextContent();
        extracted += text.items.map(item => "str" in item ? item.str : "").join("");
      }
      expect(extracted).toContain("Small");
      expect(extracted).toContain("Figure 1.");
      expect(extracted).not.toContain("Later edit");
    } finally { await task.destroy(); }
    expect(example.getSnapshot().revision).toBe(before.revision + 1);
    await example.whenReady();
    expect(example.layoutFor("body")!.provider.snapshot().current).toBe(true);
    example.dispose(); example.dispose();
    expect(example.getSnapshot()).toMatchObject({ disposed: true, geometryReady: false });
  });

  it("rejects late geometry during successive edits and shares native input with the canonical owner", async () => {
    const { example } = await fixture();
    const input = new NSETextInputClient({ session: example.sessions.body, geometry: () => example.layoutFor("body")?.provider ?? null });
    cleanups.push(() => input.dispose());
    example.select("body", 0, 5);
    const old = example.layoutFor("body")!.provider;
    expect(input.insertText("Input")).toMatchObject({ status: "applied" });
    example.insertText("caption", "Caption ");
    example.select("body", 0, 5);
    example.applyFontSize(28);
    expect(old.snapshot().current).toBe(false);
    await example.whenReady();
    const current = example.layoutFor("body")!.provider;
    expect(current.snapshot()).toMatchObject({ current: true, complete: true, revision: { fontGeneration: example.getSnapshot().fontGeneration, modelRevision: example.getSnapshot().revision } });
    expect(input.getSnapshot().projection.text).toBe(example.getSnapshot().bodyText);
    const token = input.beginComposition();
    input.setMarkedText("draft", { composition: token });
    const revision = example.getSnapshot().revision;
    expect(await example.preparePDF()).toMatchObject({ status: "refused" });
    expect(example.getSnapshot().revision).toBe(revision);
    input.cancelMarkedText(token);
  });

  it("keeps an oversized flow canonical and refuses PDF at its private page limit", async () => {
    const model = createExampleModel();
    const body = attributedContent(Array.from({ length: 100 }, (_, i) => paragraph([textRun(`Paragraph ${i}. ${"A long app-owned flow does not authorize silent truncation. ".repeat(8)}`)])));
    const { example, documents } = await fixture({ ...model, flows: { ...model.flows, body } });
    expect(example.layoutFor("body")!.complete).toBe(false);
    expect(example.getSnapshot().error).toContain("sixteen-page");
    expect(documents.getDocument<TextSystemExampleModel>(example.documentId)?.model.flows.body).toEqual(body);
    const revision = example.getSnapshot().revision;
    expect(await example.preparePDF()).toMatchObject({ status: "failed" });
    expect(example.getSnapshot().revision).toBe(revision);
    expect(example.getSnapshot().history.canUndo).toBe(false);
  });

  it("retains the original admitted font bytes for later captured output", async () => {
    const { example, sourceFontBytes } = await fixture();
    sourceFontBytes.fill(0);
    const prepared = await example.preparePDF();
    expect(prepared.status).toBe("prepared");
    if (prepared.status === "prepared") prepared.output.release();
  });
});
