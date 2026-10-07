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

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerSource from "pdfjs-dist/legacy/build/pdf.worker.mjs?raw";
import fontUrl from "../../fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf?url";
import { createDocumentOutputPreparation } from "../../../src/SynCloudOS/Documents/DocumentOutputPreparation";
import { createBrowserDocumentOutputPrintHost, requestDocumentOutputPrint } from "../../../src/SynCloudOS/Documents/documentOutputPrint";
import type { DocumentOutputPDFArtifact } from "../../../src/SynCloudOS/Documents/documentOutputTypes";
import { TFXAttributedString, TFXFont, TFXFontDescriptor, TFXGlyphDrawing, TFXTypesetter } from "../../../src/FX/TextFX/public";
import { GFXColour, GFXImage, GFXPath } from "../../../src/FX/GraphicsFX/public";

const scope = window as typeof window & { customTextOutput?: {
  state: "running" | "passed" | "failed"; error?: string; result?: Record<string, unknown>;
  printCalls: number; printStatus?: string; printActive?: boolean; initialPrintActive?: boolean;
} };
scope.customTextOutput = { state: "running", printCalls: 0 };
let artifact: DocumentOutputPDFArtifact | null = null;
const host = createBrowserDocumentOutputPrintHost({ navigator, print() { scope.customTextOutput!.printCalls++; } });
document.querySelector("#request-print")!.addEventListener("click", () => {
  if (!artifact) return;
  scope.customTextOutput!.printActive = navigator.userActivation.isActive;
  scope.customTextOutput!.printStatus = requestDocumentOutputPrint(artifact, host).status;
});

async function run() {
  const canonical = { documentId: "browser-private-engine", revision: 12, model: { text: "office café" } };
  let fontReleases = 0, imageReleases = 0;
  const prepared = await createDocumentOutputPreparation({ settle: () => ({ status: "settled" }), capture: () => canonical })
    .prepare({ purpose: "print", configurationId: "private-browser-fixed-pages", engine: () => ({ dependencies: [
      { id: "font", kind: "font", async retain() {
        const response = await fetch(fontUrl);
        if (!response.ok) return { status: "missing", reason: `font fetch ${response.status}` };
        const font = await TFXFont.create(new Uint8Array(await response.arrayBuffer()), new TFXFontDescriptor({ size: 18 }));
        return { status: "retained", lease: { value: font, release() { fontReleases++; font.dispose(); } } };
      } },
      { id: "image", kind: "resource", retain: () => ({ status: "retained", lease: {
        value: new GFXImage({ width: 1, height: 1, alpha: "opaque", colourSpace: "srgb", data: new Uint8Array([0, 255, 0, 255]) }),
        release() { imageReleases++; },
      } }) },
    ], pages: [{ geometry: { width: 120, height: 100 }, draw(context, drawing) {
      const text = drawing.snapshot.model.text;
      const font = drawing.dependencies.get("font") as TFXFont;
      const line = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
      context.drawPositionedText(TFXGlyphDrawing.pdfTextRunsForLine(line, { x: 5, y: 25 }));
      context.fill(GFXPath.rect({ x: 10, y: 40, width: 20, height: 20 }), GFXColour.rgba(1, 0, 0));
      context.drawImage(drawing.dependencies.get("image") as GFXImage, { x: 50, y: 40, width: 20, height: 20 });
      context.addLink({ rect: { x: 80, y: 40, width: 20, height: 20 }, uri: "https://example.test/output" });
    } }, { geometry: { width: 72, height: 144, rotation: 90 }, draw(context) {
      context.fill(GFXPath.rect({ x: 5, y: 5, width: 5, height: 5 }));
    } }] }) });
  if (prepared.status !== "prepared") throw new Error(`${prepared.status}: ${prepared.receipt.reason}`);
  canonical.model.text = "later canonical edit";
  canonical.revision++;
  const exported = await prepared.output.exportPDF();
  if (exported.status !== "exported") throw new Error(`${exported.status}: ${exported.receipt.reason}`);
  artifact = exported;
  scope.customTextOutput!.initialPrintActive = navigator.userActivation.isActive;
  scope.customTextOutput!.printStatus = requestDocumentOutputPrint(artifact, host).status;
  // Run the real vendor worker in an isolated entry. Vite's injected worker HMR
  // WebSocket confuses Firefox protocol bookkeeping in the test harness.
  const parserWorkerURL = URL.createObjectURL(new Blob([pdfWorkerSource], { type: "text/javascript" }));
  const parserWorker = new Worker(parserWorkerURL, { type: "module" });
  GlobalWorkerOptions.workerPort = parserWorker;
  const task = getDocument({ data: exported.bytes.slice(), useSystemFonts: false, disableFontFace: true });
  try {
    const pdf = await task.promise;
    const first = await pdf.getPage(1), second = await pdf.getPage(2);
    const text = await first.getTextContent();
    const canvas = document.createElement("canvas");
    canvas.width = 120; canvas.height = 100;
    const context = canvas.getContext("2d")!;
    await first.render({ canvas, canvasContext: context, viewport: first.getViewport({ scale: 1 }) }).promise;
    const operators = await first.getOperatorList();
    const annotations = await first.getAnnotations();
    return {
      revision: exported.receipt.revision, readiness: exported.receipt.readiness, pages: exported.receipt.pages,
      pageViews: [first.view, second.view], rotations: [first.rotate, second.rotate],
      extracted: text.items.map(item => "str" in item ? item.str : "").join(""),
      red: Array.from(context.getImageData(20, 50, 1, 1).data), green: Array.from(context.getImageData(60, 50, 1, 1).data),
      operatorCount: operators.fnArray.length, link: annotations.find(item => item.url)?.url,
      fontReleases, imageReleases,
    };
  } finally {
    try { await task.destroy(); }
    finally { parserWorker.terminate(); URL.revokeObjectURL(parserWorkerURL); GlobalWorkerOptions.workerPort = null; }
  }
}
void run().then(result => {
  scope.customTextOutput!.state = "passed"; scope.customTextOutput!.result = result;
  console.info("framework:custom-text-output:passed");
}, error => {
  scope.customTextOutput!.state = "failed"; scope.customTextOutput!.error = error instanceof Error ? error.stack : String(error);
  console.info("framework:custom-text-output:failed");
});
