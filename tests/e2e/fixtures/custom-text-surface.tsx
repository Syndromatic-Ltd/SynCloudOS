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

import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import type { NSETextInputClient, NSETextRange } from "@syndromatic/syncloudos/nse/text";
import { createTextSystemExampleApp, textSystemDocumentType, type TextSystemExampleAppOptions } from "../../../examples/TextSystem.app/Contents";
import type { ExampleViewId } from "../../../examples/TextSystem.app/Contents/model";
import type { TextSystemExample, TextSystemExampleSnapshot, ExampleAssetLease, ExampleObjectTarget } from "../../../examples/TextSystem.app/Contents/example";
import fontURL from "../../fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf?url";

interface CustomTextSurface {
  getSnapshot(): TextSystemExampleSnapshot & { readonly inputClients: readonly ExampleViewId[]; readonly pdf?: { readonly revision: number; readonly byteLength: number } };
  activate(view: ExampleViewId): void;
  select(view: ExampleViewId, anchor: number, focus?: number): void;
  insertText(view: ExampleViewId, text: string): void;
  applyFontSize(size: number): void;
  setZoom(zoom: number): void;
  beginObjectMove(): ExampleObjectTarget;
  previewObjectMove(target: ExampleObjectTarget, point: { x: number; y: number }): void;
  commitObjectMove(target: ExampleObjectTarget): void;
  cancelObjectMove(): void;
  insertImage(): Promise<void>;
  saveNative(): ReturnType<TextSystemExample["saveNative"]>;
  nativeSnapshot(): ReturnType<TextSystemExample["nativeSnapshot"]>;
  assetReceipt(): ReturnType<TextSystemExample["assetReceipt"]>;
  isAssetLeaseActive(lease: ExampleAssetLease): boolean;
  startFreshHost(reopen?: boolean): Promise<void>;
  inputSnapshot(view: ExampleViewId): ReturnType<NSETextInputClient["getSnapshot"]> | null;
  firstRect(view: ExampleViewId, range: NSETextRange): ReturnType<NSETextInputClient["firstRectForRange"]> | null;
  exportPDF(): Promise<{ readonly revision: number; readonly byteLength: number }>;
  dispose(): Promise<void>;
}
type PersistenceHost = ReturnType<typeof import("../../../examples/TextSystem.app/Host/bootstrap")["createExamplePersistenceHost"]>;
type PreviousLeaseReceipt = { readonly leaseId: string; readonly wasActive: boolean; readonly revoked: boolean; readonly rejectedByFreshHost: boolean };
declare global { interface Window { customTextSurface?: CustomTextSurface; customHostReceipt?: ReturnType<PersistenceHost["getReceipt"]> & { readonly previousLease: PreviousLeaseReceipt | null }; customNativeRecord?: Awaited<ReturnType<PersistenceHost["readNativeRecord"]>> } }
const clients = new Map<ExampleViewId, NSETextInputClient>();
let example: TextSystemExample | null = null, pdf: { readonly revision: number; readonly byteLength: number } | undefined;
let persistence: PersistenceHost | null = null;
let previousLease: PreviousLeaseReceipt | null = null;
let resolveFreshReady: (() => void) | null = null, rejectFreshReady: ((failure: unknown) => void) | null = null;
let host: { dispose(): Promise<unknown> };
const appOptions: TextSystemExampleAppOptions = {
  async loadFontBytes(signal) { const response = await fetch(fontURL, { signal }); if (!response.ok) throw new Error(`Example font: ${response.status}`); return new Uint8Array(await response.arrayBuffer()); },
  onInputClient(view, client) { if (client) clients.set(view, client); else clients.delete(view); },
  onError(error) { document.getElementById("fixture-error")!.textContent = String(error); rejectFreshReady?.(error); },
  onReady(value) {
    example = value;
    window.customTextSurface = {
      getSnapshot: () => ({ ...value.getSnapshot(), inputClients: [...clients.keys()], ...(pdf ? { pdf } : {}) }),
      activate: view => value.activate(view), select: (view, anchor, focus) => value.select(view, anchor, focus),
      insertText: (view, text) => value.insertText(view, text), applyFontSize: size => value.applyFontSize(size), setZoom: zoom => value.setZoom(zoom),
      beginObjectMove: () => value.beginObjectMove(), previewObjectMove: (target, point) => value.previewObjectMove(target, point),
      commitObjectMove: target => value.commitObjectMove(target), cancelObjectMove: () => value.cancelObjectMove(),
      insertImage: () => value.insertImage(), nativeSnapshot: () => value.nativeSnapshot(),
      assetReceipt: () => value.assetReceipt(), isAssetLeaseActive: lease => value.isAssetLeaseActive(lease),
      async saveNative() { const saved = await value.saveNative(); if (persistence) window.customNativeRecord = await persistence.readNativeRecord(); return saved; },
      async startFreshHost(reopen = false) {
        // Preserve the ORIGINAL capability object across hosts, rather than testing a serialized descriptor clone.
        const priorLease = value.assetReceipt()?.descriptor;
        const wasActive = priorLease ? value.isAssetLeaseActive(priorLease) : false;
        value.dispose(); const disposition = await host.dispose();
        if (disposition && typeof disposition === "object" && "status" in disposition && disposition.status !== "disposed") throw new Error(`Previous host disposal ${disposition.status}`);
        if (!persistence) {
          const { createExamplePersistenceHost } = await import("../../../examples/TextSystem.app/Host/bootstrap");
          persistence = createExamplePersistenceHost({ databaseName: `custom-text-example-${crypto.randomUUID()}`, indexedDB });
        }
        clients.clear(); pdf = undefined;
        const ready = new Promise<void>((resolve, reject) => { resolveFreshReady = resolve; rejectFreshReady = reject; });
        host = await persistence.mount(document.getElementById("root")!, appOptions, reopen);
        await ready; resolveFreshReady = null; rejectFreshReady = null;
        previousLease = priorLease ? { leaseId: priorLease.leaseId, wasActive, revoked: !value.isAssetLeaseActive(priorLease), rejectedByFreshHost: !example!.isAssetLeaseActive(priorLease) } : null;
        window.customHostReceipt = { ...persistence.getReceipt(), previousLease };
      },
      inputSnapshot: view => clients.get(view)?.getSnapshot() ?? null,
      firstRect: (view, range) => clients.get(view)?.firstRectForRange(range, "client") ?? null,
      async exportPDF() {
        const prepared = await value.preparePDF();
        if (prepared.status !== "prepared") throw new Error(`Output ${prepared.status}: ${prepared.receipt.reason}`);
        const output = await prepared.output.exportPDF();
        if (output.status !== "exported") throw new Error(`Output ${output.status}`);
        pdf = { revision: output.receipt.revision!, byteLength: output.bytes.length }; return pdf;
      },
      async dispose() { value.dispose(); const result = await host.dispose(); if (persistence) window.customHostReceipt = { ...persistence.getReceipt(), previousLease };
        if (result && typeof result === "object" && "status" in result && result.status !== "disposed") throw new Error(`Host disposal ${result.status}`); },
    };
    resolveFreshReady?.();
  },
};
const app = createTextSystemExampleApp(appOptions);
// Document type registration is a trusted host option, separate from the app's declaration.
const testHost = createSynWareTestHost({ app, document, container: document.getElementById("root")!, strictMode: false, documentTypes: [textSystemDocumentType] });
host = testHost;
void testHost.render().catch(error => { document.getElementById("fixture-error")!.textContent = String(error); });
window.addEventListener("pagehide", () => { example?.dispose(); void host.dispose(); }, { once: true });
