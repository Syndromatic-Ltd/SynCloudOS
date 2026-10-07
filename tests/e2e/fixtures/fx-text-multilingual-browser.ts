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

import {
  TFXAttributedString,
  TFXFont,
  TFXFontCollection,
  TFXFontDescriptor,
  TFXGlyphDrawing,
  TFXRubyAnnotation,
  TFXTypesetter,
  TFX_VERTICAL_ORIENTATION_UNICODE_VERSION,
  tfxVerticalOrientationForGrapheme,
} from "../../../src/FX/TextFX/public";
import type { GFXPath } from "../../../src/FX/GraphicsFX/public";
import verticalFontUrl from "../../fixtures/fx/fonts/notosansjp-vertical-subset.ttf?url";
import arabicFontUrl from "../../fixtures/fx/fonts/notosansarabic-NotoSansArabic[wdth,wght].ttf?url";
import devanagariFontUrl from "../../fixtures/fx/fonts/notosansdevanagari-NotoSansDevanagari[wdth,wght].ttf?url";

async function font(url: string, size: number) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`font fetch failed: ${response.status}`);
  return TFXFont.create(new Uint8Array(await response.arrayBuffer()), new TFXFontDescriptor({ size }));
}

function svgPath(path: GFXPath): string {
  return path.commands.map(command => {
    if (command.kind === "close") return "Z";
    if (command.kind === "move") return `M${command.point.x} ${command.point.y}`;
    if (command.kind === "line") return `L${command.point.x} ${command.point.y}`;
    if (command.kind === "quad") return `Q${command.control.x} ${command.control.y} ${command.point.x} ${command.point.y}`;
    return `C${command.control1.x} ${command.control1.y} ${command.control2.x} ${command.control2.y} ${command.point.x} ${command.point.y}`;
  }).join(" ");
}

function appendOutlines(svg: SVGSVGElement, outlines: ReturnType<typeof TFXGlyphDrawing.pathsForLine>, fill: string) {
  for (const outline of outlines) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "path");
    node.setAttribute("d", svgPath(outline.path));
    node.setAttribute("fill", fill);
    node.dataset.stringIndex = String(outline.stringIndex);
    svg.appendChild(node);
  }
}

export async function runFX16BrowserSpecimen() {
  const vertical = await font(verticalFontUrl, 20);
  const primary = await font(verticalFontUrl, 14);
  const arabic = await font(arabicFontUrl, 28);
  const devanagari = await font(devanagariFontUrl, 24);
  try {
    const verticalText = "日12本";
    const verticalLine = new TFXTypesetter(new TFXAttributedString(verticalText, [{
      start: 0, end: verticalText.length, font: vertical, language: "ja", verticalOrientation: "auto", textCombine: "digits2",
    }]), "ltr", "vertical").createLine(0, verticalText.length);
    const combined = verticalLine.runs.find(run => run.start === 1 && run.end === 3);

    const mixedText = "日 مرحبًا नमस्ते";
    const fallback = new TFXFontCollection([primary, arabic, devanagari]);
    const mixedLine = new TFXTypesetter(new TFXAttributedString(mixedText, [{
      start: 0, end: mixedText.length, font: primary, fallbackFonts: fallback,
    }])).createLine(0, mixedText.length);

    const rubyAnnotation = new TFXRubyAnnotation({
      alignment: "lineEdge",
      collisionPolicy: "lineEdge",
      text: {
        before: { text: "日", font: primary },
        after: { text: "日", font: primary },
        interCharacter: { text: "日", font: primary },
        inline: { text: "日", font: primary },
      },
    });
    const rubyLine = new TFXTypesetter(new TFXAttributedString("日", [{
      start: 0, end: 1, font: vertical, language: "ja", rubyAnnotation,
    }])).createLine(0, 1);
    const rtlRuby = new TFXRubyAnnotation({ text: { before: "م", after: "ر", interCharacter: "ح", inline: "ب" } });
    const rtlRubyLine = new TFXTypesetter(new TFXAttributedString("س", [{
      start: 0, end: 1, font: arabic, language: "ar", rubyAnnotation: rtlRuby,
    }]), "rtl").createLine(0, 1);
    const verticalRuby = new TFXRubyAnnotation({ text: { before: "日", after: "本" } });
    const verticalRubyLine = new TFXTypesetter(new TFXAttributedString("日", [{
      start: 0, end: 1, font: vertical, language: "ja", verticalForms: true, rubyAnnotation: verticalRuby,
    }]), "rtl", "vertical").createLine(0, 1);

    const breakText = "あぁい";
    const firstWidth = new TFXTypesetter(new TFXAttributedString("あ", [{ start: 0, end: 1, font: vertical }])).createLine(0, 1).width;
    const strict = new TFXTypesetter(new TFXAttributedString(breakText, [{ start: 0, end: breakText.length, font: vertical, language: "ja", lineBreakPolicy: "strict" }]));
    const loose = new TFXTypesetter(new TFXAttributedString(breakText, [{ start: 0, end: breakText.length, font: vertical, language: "ja", lineBreakPolicy: "loose" }]));

    const svg = document.querySelector<SVGSVGElement>("#fx16-artwork");
    if (!svg) throw new Error("FX-16 specimen SVG is missing.");
    const verticalOutlines = TFXGlyphDrawing.pathsForLine(verticalLine, { x: 85, y: 28 });
    const mixedOutlines = TFXGlyphDrawing.pathsForLine(mixedLine, { x: 145, y: 95 });
    const rubyOutlines = TFXGlyphDrawing.pathsForLine(rubyLine, { x: 430, y: 64 });
    const rtlRubyOutlines = TFXGlyphDrawing.pathsForLine(rtlRubyLine, { x: 620, y: 126 });
    const verticalRubyOutlines = TFXGlyphDrawing.pathsForLine(verticalRubyLine, { x: 510, y: 170 });
    appendOutlines(svg, verticalOutlines, "#171717");
    appendOutlines(svg, mixedOutlines, "#353535");
    appendOutlines(svg, rubyOutlines, "#6b2d2d");
    appendOutlines(svg, rtlRubyOutlines, "#244c73");
    appendOutlines(svg, verticalRubyOutlines, "#386143");
    const rubyRuns = rubyLine.runs[0]?.ruby ?? [];
    const selectionTarget = document.querySelector<HTMLElement>("#fx17-base");
    const selection = window.getSelection();
    if (!selectionTarget?.firstChild || !selection) throw new Error("FX-17 semantic selection target is missing.");
    const range = document.createRange();
    range.selectNodeContents(selectionTarget);
    selection.removeAllRanges();
    selection.addRange(range);
    const selectionText = selection.toString();
    selection.removeAllRanges();

    return {
      unicodeVersion: TFX_VERTICAL_ORIENTATION_UNICODE_VERSION,
      orientations: { han: tfxVerticalOrientationForGrapheme("日"), latin: tfxVerticalOrientationForGrapheme("A") },
      verticalPresentations: verticalLine.runs.map(run => run.verticalPresentation ?? null),
      combinedText: combined?.shaped.text ?? null,
      combinedAdvance: combined?.inlineAdvanceOverride ?? null,
      combinedScale: combined?.combinedScale ?? null,
      combinedCaretSpan: verticalLine.offsetForStringIndex(3).primary - verticalLine.offsetForStringIndex(1).primary,
      fallbackSizes: [...new Set(mixedLine.runs.map(run => run.font.descriptor.size))].sort((left, right) => left - right),
      mixedAscent: mixedLine.ascent,
      primaryAscent: primary.ascent,
      strictBreak: strict.suggestLineBreak(0, firstWidth + 0.01),
      looseBreak: loose.suggestLineBreak(0, firstWidth + 0.01),
      verticalOutlineCount: verticalOutlines.length,
      mixedOutlineCount: mixedOutlines.length,
      combinedOutlineCount: verticalOutlines.filter(outline => outline.stringIndex === 1 || outline.stringIndex === 2).length,
      rubyPositions: rubyRuns.map(run => run.position),
      rubyFontSizes: rubyRuns.map(run => run.font.descriptor.size),
      rubyContained: rubyRuns.every(run => rubyLine.runs[0]!.x + run.inlineOffset >= -1e-9 && rubyLine.runs[0]!.x + run.inlineOffset + run.width <= rubyLine.width + 1e-9),
      rubyCaretSpan: rubyLine.offsetForStringIndex(1).primary - rubyLine.offsetForStringIndex(0).primary,
      rubyOutlinePositions: rubyOutlines.filter(outline => outline.rubyPosition).map(outline => outline.rubyPosition),
      rtlRubyPositions: rtlRubyLine.runs[0]?.ruby?.map(run => run.position) ?? [],
      verticalRubyPositions: verticalRubyLine.runs[0]?.ruby?.map(run => run.position) ?? [],
      rubyOutlineCount: rubyOutlines.length,
      rtlRubyOutlineCount: rtlRubyOutlines.length,
      verticalRubyOutlineCount: verticalRubyOutlines.length,
      selectionText,
      semanticLabel: selectionTarget.closest("[aria-label]")?.getAttribute("aria-label") ?? null,
    };
  } finally {
    vertical.dispose(); primary.dispose(); arabic.dispose(); devanagari.dispose();
  }
}
