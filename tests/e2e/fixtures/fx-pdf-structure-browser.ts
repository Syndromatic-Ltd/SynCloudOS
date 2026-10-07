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
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import {
  GFXColour,
  GFXPDFContext,
  GFXPDFDocument,
  GFXPDFScanner,
  GFXPath,
} from "../../../src/FX/GraphicsFX/public";
import {
  TFXAttributedString,
  TFXFont,
  TFXFontDescriptor,
  TFXGlyphDrawing,
  TFXTypesetter,
} from "../../../src/FX/TextFX/public";
import latinFontUrl from "../../fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf?url";
import arabicFontUrl from "../../fixtures/fx/fonts/notosansarabic-NotoSansArabic[wdth,wght].ttf?url";
import devanagariFontUrl from "../../fixtures/fx/fonts/notosansdevanagari-NotoSansDevanagari[wdth,wght].ttf?url";

async function positionedRun(url: string, text: string, y: number) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`font fetch failed: ${response.status}`);
  const font = await TFXFont.create(
    new Uint8Array(await response.arrayBuffer()),
    new TFXFontDescriptor({ size: 18 }),
  );
  const line = new TFXTypesetter(
    new TFXAttributedString(text, [{ start: 0, end: text.length, font }]),
  ).createLine(0, text.length);
  return { font, runs: TFXGlyphDrawing.pdfTextRunsForLine(line, { x: 10, y }) };
}

export async function runFX09BrowserSpecimen() {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const latin = await positionedRun(latinFontUrl, "office", 22);
  const arabic = await positionedRun(arabicFontUrl, "مرحبا", 45);
  const devanagari = await positionedRun(devanagariFontUrl, "नमस्ते", 68);
  try {
    const writer = new GFXPDFContext({ title: "FX-09 browser specimen" });
    writer.setLanguage("en-GB");
    writer.beginPage({ width: 180, height: 90 });
    writer.drawPositionedText(latin.runs);
    writer.drawPositionedText(arabic.runs);
    writer.drawPositionedText(devanagari.runs);
    writer.beginMarkedContent({ tag: "P", actualText: "Browser structured paragraph" });
    writer.fill(GFXPath.rect({ x: 135, y: 8, width: 30, height: 14 }), GFXColour.rgba(0.2, 0.4, 0.8));
    writer.endMarkedContent();
    writer.addLink({ rect: { x: 135, y: 30, width: 30, height: 14 }, uri: "https://example.test/read" });
    writer.endPage();
    writer.addOutline({ title: "Introduction", pageIndex: 0 });
    const bytes = await writer.finish();

    const task = getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false });
    const pdf = await task.promise;
    const readerPage = await pdf.getPage(1);
    const text = await readerPage.getTextContent();
    const extracted = text.items.map(item => "str" in item ? item.str : "").join("");
    const outline = await pdf.getOutline();
    const annotations = await readerPage.getAnnotations({ intent: "display" });

    const document = await GFXPDFDocument.open(bytes, { maximumOperationMilliseconds: 10000 });
    const scanner = new GFXPDFScanner(document, 1024 * 1024);
    const operators: string[] = [];
    for (const object of scanner.objects().filter(entry => entry.kind === "stream")) {
      try {
        operators.push(...(await scanner.contentOperators(object.reference)).map(entry => entry.operator));
      } catch {
        // Font and image streams are not page content streams.
      }
    }
    const result = {
      title: document.metadata.title,
      pageCount: document.pageCount,
      extracted,
      outlineTitle: outline?.[0]?.title ?? null,
      linkUrl: annotations.find(annotation => annotation.subtype === "Link")?.url ?? null,
      hasBDC: operators.includes("BDC"),
      hasEMC: operators.includes("EMC"),
      objectCount: scanner.objects().length,
    };
    document.dispose();
    await task.destroy();
    return result;
  } finally {
    latin.font.dispose();
    arabic.font.dispose();
    devanagari.font.dispose();
  }
}
