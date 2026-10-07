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
import { describe, expect, it } from "vitest";
import {
  TFXAttributedString,
  TFXFont,
  TFXFontDescriptor,
  TFXGlyphDrawing,
  TFXParagraphStyle,
  TFXTextTab,
  TFXTypesetter,
} from "../../../src/FX/TextFX/public";

const loadFont = (file: string, size = 18) => TFXFont.create(
  new Uint8Array(readFileSync(`tests/fixtures/fx/fonts/${file}`)),
  new TFXFontDescriptor({ size }),
);

describe("TextFX tab stops", () => {
  it("uses deterministic default stops without shaping a glyph for the tab control", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "a\tb\tc";
      const style = new TFXParagraphStyle();
      const line = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font, paragraphStyle: style }])).createLine(0, text.length);
      const tabs = line.runs.filter((run) => run.kind === "tab");
      const b = line.runs.find((run) => run.start === 2)!;
      const c = line.runs.find((run) => run.start === 4)!;
      expect(style.tabStops.map((tab) => tab.location)).toEqual(Array.from({ length: 12 }, (_, index) => (index + 1) * 28));
      expect(tabs).toHaveLength(2);
      expect(tabs.every((run) => run.shaped.glyphs.length === 0)).toBe(true);
      expect(b.x).toBeCloseTo(28);
      expect(c.x).toBeCloseTo(56);
      const whitespaceText = "a\t \n";
      const whitespace = new TFXTypesetter(new TFXAttributedString(whitespaceText, [{ start: 0, end: whitespaceText.length, font, paragraphStyle: style }])).createLine(0, whitespaceText.length);
      expect(whitespace.runs.filter((run) => run.kind === "tab").flatMap((run) => run.shaped.glyphs)).toEqual([]);
      expect(whitespace.runs.every((run) => !run.shaped.text.includes("\n"))).toBe(true);
      expect(whitespace.trailingWhitespaceWidth).toBeGreaterThan(font.shape(" ").advance.width);
    } finally { font.dispose(); }
  });

  it("aligns shaped multilingual fields and continues custom stops by the default interval", async () => {
    const latin = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    const devanagari = await loadFont("notosansdevanagari-NotoSansDevanagari[wdth,wght].ttf");
    try {
      const text = "office\tनमस्ते\tend";
      const style = new TFXParagraphStyle({ tabStops: [new TFXTextTab("center", 100)], defaultTabInterval: 40 });
      const line = new TFXTypesetter(new TFXAttributedString(text, [
        { start: 0, end: 7, font: latin, paragraphStyle: style },
        { start: 7, end: 13, font: devanagari },
        { start: 13, end: text.length, font: latin },
      ])).createLine(0, text.length);
      const indic = line.runs.find((run) => run.start === 7)!;
      expect(indic.x + indic.shaped.advance.width / 2).toBeCloseTo(100);
      const final = line.runs.find((run) => run.start === 14)!;
      expect(final.x).toBeCloseTo(120);
      expect(indic.shaped.glyphs.map((glyph) => glyph.id)).toEqual(devanagari.shape("नमस्ते", { script: "Deva" }).glyphs.map((glyph) => glyph.id));

      const continuationText = "a\t\tb";
      const continuationStyle = new TFXParagraphStyle({ tabStops: [new TFXTextTab("left", 120)], defaultTabInterval: 40 });
      const continuation = new TFXTypesetter(new TFXAttributedString(continuationText, [{ start: 0, end: continuationText.length, font: latin, paragraphStyle: continuationStyle }])).createLine(0, continuationText.length);
      expect(continuation.runs.find((run) => run.start === 3)!.x).toBeCloseTo(160);

      const rightText = "a\tword";
      const rightStyle = new TFXParagraphStyle({ tabStops: [new TFXTextTab("right", 100)] });
      const right = new TFXTypesetter(new TFXAttributedString(rightText, [{ start: 0, end: rightText.length, font: latin, paragraphStyle: rightStyle }])).createLine(0, rightText.length);
      const word = right.runs.find((run) => run.start === 2)!;
      expect(word.x + word.shaped.advance.width).toBeCloseTo(100);
    } finally { latin.dispose(); devanagari.dispose(); }
  });

  it("uses natural right alignment and back-margin positions for RTL tabs", async () => {
    const font = await loadFont("notosansarabic-NotoSansArabic[wdth,wght].ttf");
    try {
      const text = "مرحبا\tالعالم";
      const style = new TFXParagraphStyle({ tabStops: [new TFXTextTab("natural", 140)], defaultTabInterval: 40 });
      const line = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font, paragraphStyle: style }]), "rtl").createLine(0, text.length);
      const first = line.runs.find((run) => run.start === 0)!;
      const second = line.runs.find((run) => run.start === 6)!;
      expect(line.direction).toBe("rtl");
      expect(line.width).toBeCloseTo(140);
      expect(first.x + first.shaped.advance.width).toBeCloseTo(140);
      expect(second.x).toBeCloseTo(0);
      expect(first.shaped.direction).toBe("rtl");
      expect(second.shaped.direction).toBe("rtl");
    } finally { font.dispose(); }
  });

  it("validates bounded stops and supports prompt cancellation", async () => {
    expect(() => new TFXParagraphStyle({ tabStops: [new TFXTextTab("left", 20), new TFXTextTab("right", 20)] })).toThrow(/ascending/i);
    expect(() => new TFXParagraphStyle({ tabStops: Array.from({ length: 65 }, (_, index) => new TFXTextTab("left", index + 1)) })).toThrow(/64/i);
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "one\ttwo\tthree";
      const input = new TFXAttributedString(text, [{ start: 0, end: text.length, font }]);
      const excessive = "\t".repeat(1025);
      const excessiveInput = new TFXAttributedString(excessive, [{ start: 0, end: excessive.length, font }]);
      expect(() => new TFXTypesetter(excessiveInput).createLine(0, excessive.length)).toThrow(/1024/i);
      const controller = new AbortController();
      controller.abort(new DOMException("cancelled", "AbortError"));
      expect(() => new TFXTypesetter(input).createLine(0, text.length, controller.signal)).toThrow(/cancelled/i);
    } finally { font.dispose(); }
  });
});

describe("TextFX line truncation", () => {
  it.each(["head", "middle", "tail"] as const)("fits %s truncation by whole shaped clusters", async (type) => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "office cafe e\u0301 finish";
      const typesetter = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }]));
      const source = typesetter.createLine(0, text.length);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font }])).createLine(0, 1);
      const width = source.width * 0.62;
      const line = source.createTruncatedLine(width, type, token)!;
      expect(line.width).toBeLessThanOrEqual(width + 1e-9);
      expect(line.truncatedRange).not.toBeNull();
      if (type === "head") expect(line.truncatedRange!.location).toBe(0);
      if (type === "tail") expect(line.truncatedRange!.location + line.truncatedRange!.length).toBe(text.length);
      if (type === "middle") {
        expect(line.truncatedRange!.location).toBeGreaterThan(0);
        expect(line.truncatedRange!.location + line.truncatedRange!.length).toBeLessThan(text.length);
      }
      expect(line.runs.some((run) => run.kind === "truncation-token")).toBe(true);
      const originalGlyphs = new Map(source.runs.flatMap((run) => run.shaped.glyphs.map((glyph) => [`${run.start + glyph.cluster}:${glyph.id}`, true])));
      for (const run of line.runs.filter((candidate) => candidate.kind === "glyph")) {
        for (const glyph of run.shaped.glyphs) expect(originalGlyphs.has(`${run.start + glyph.cluster}:${glyph.id}`)).toBe(true);
      }
      expect(line.runs.every((run) => run.start !== text.indexOf("\u0301"))).toBe(true);
    } finally { font.dispose(); }
  });

  it("returns null when the shaped token itself is wider than a required truncation", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const sourceText = "a long line";
      const tokenText = "TOO WIDE";
      const source = new TFXTypesetter(new TFXAttributedString(sourceText, [{ start: 0, end: sourceText.length, font }])).createLine(0, sourceText.length);
      const token = new TFXTypesetter(new TFXAttributedString(tokenText, [{ start: 0, end: tokenText.length, font }])).createLine(0, tokenText.length);
      expect(source.createTruncatedLine(token.width - 1, "tail", token)).toBeNull();
    } finally { font.dispose(); }
  });

  it("recomputes trailing whitespace from the retained logical tail", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "leading words and a tail   ";
      const source = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font }])).createLine(0, 1);
      const head = source.createTruncatedLine(source.width * 0.55, "head", token)!;
      const tail = source.createTruncatedLine(source.width * 0.55, "tail", token)!;
      expect(head.trailingWhitespaceWidth).toBeGreaterThan(0);
      const trailingStart = text.length - 3;
      const actualTrailingAdvance = head.runs
        .filter((run) => run.kind === "glyph")
        .flatMap((run) => run.shaped.glyphs.map((glyph) => ({ run, glyph })))
        .reduce((sum, { run, glyph }) => sum + (run.start + glyph.cluster >= trailingStart ? Math.abs(glyph.advance.x) : 0), 0);
      expect(head.trailingWhitespaceWidth).toBeCloseTo(actualTrailingAdvance);
      expect(tail.trailingWhitespaceWidth).toBe(0);
    } finally { font.dispose(); }
  });

  it("places an RTL tail token on the visual left and maps token hits to the omitted boundary", async () => {
    const font = await loadFont("notosansarabic-NotoSansArabic[wdth,wght].ttf");
    try {
      const text = "مرحبا بالعالم الجميل";
      const source = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }]), "rtl").createLine(0, text.length);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font }]), "rtl").createLine(0, 1);
      const line = source.createTruncatedLine(source.width * 0.55, "tail", token)!;
      const tokenRun = line.runs.find((run) => run.kind === "truncation-token")!;
      expect(tokenRun.x).toBeCloseTo(0);
      expect(line.stringIndexForPosition(tokenRun.x + tokenRun.shaped.advance.width / 2)).toBe(line.truncatedRange!.location);
      expect(line.runs.filter((run) => run.kind === "glyph").every((run) => run.shaped.direction === "rtl")).toBe(true);
      const sourceGlyphs = new Set(source.runs.flatMap((run) => run.shaped.glyphs.map((glyph) => `${run.start + glyph.cluster}:${glyph.id}`)));
      expect(line.runs.filter((run) => run.kind === "glyph").flatMap((run) => run.shaped.glyphs.map((glyph) => sourceGlyphs.has(`${run.start + glyph.cluster}:${glyph.id}`))).every(Boolean)).toBe(true);
    } finally { font.dispose(); }
  });

  it("reshapes an Arabic tail boundary while preserving original UTF-16 indices", async () => {
    const font = await loadFont("notosansarabic-NotoSansArabic[wdth,wght].ttf");
    try {
      const text = "السلام عليكم ورحمة الله";
      const attributes = { start: 0, end: text.length, font, language: "ar" };
      const source = new TFXTypesetter(new TFXAttributedString(text, [attributes]), "rtl").createLine(0, text.length);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font }]), "rtl").createLine(0, 1);
      const line = source.createTruncatedLine(source.width * 0.52, "tail", token)!;
      const boundary = line.truncatedRange!.location;
      const expected = font.shape(text.slice(0, boundary), { direction: "rtl", script: "Arab", language: "ar" });
      const retained = line.runs.filter((run) => run.kind === "glyph");
      const actualGlyphs = retained.flatMap((run) => run.shaped.glyphs.map((glyph) => ({
        id: glyph.id,
        cluster: run.start + glyph.cluster,
      })));
      expect(boundary).toBeGreaterThan(1);
      expect(actualGlyphs).toEqual(expected.glyphs.map((glyph) => ({ id: glyph.id, cluster: glyph.cluster })));
      expect(retained.reduce((sum, run) => sum + run.shaped.advance.width, 0)).toBeCloseTo(expected.advance.width);
      expect(line.width).toBeLessThanOrEqual(source.width * 0.52 + 1e-9);
    } finally { font.dispose(); }
  });

  it("exports every glyph in a multi-glyph token at the explicit omitted-text boundary", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "a substantially longer source line";
      const source = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
      const tokenText = "[...]";
      const token = new TFXTypesetter(new TFXAttributedString(tokenText, [{ start: 0, end: tokenText.length, font }])).createLine(0, tokenText.length);
      const line = source.createTruncatedLine(source.width * 0.72, "tail", token)!;
      const outlines = TFXGlyphDrawing.pathsForLine(line);
      const tokenOutlines = outlines.filter((outline) => outline.kind === "truncation-token");
      expect(tokenOutlines.length).toBeGreaterThan(1);
      expect(tokenOutlines.every((outline) => outline.stringIndex === line.truncatedRange!.location)).toBe(true);
      expect(outlines.filter((outline) => outline.kind === "glyph").every((outline) => outline.stringIndex < line.truncatedRange!.location)).toBe(true);
    } finally { font.dispose(); }
  });

  it("rejects truncating an already-truncated line instead of silently discarding its token", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "retain one explicit token owner";
      const source = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font }])).createLine(0, 1);
      const once = source.createTruncatedLine(source.width * 0.6, "middle", token)!;
      expect(() => once.createTruncatedLine(once.width * 0.8, "tail", token)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    } finally { font.dispose(); }
  });

  it("handles the full attributed-string bound with linear cancellation checkpoints", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf", 8);
    try {
      const text = "a".repeat(65_536);
      const source = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font }])).createLine(0, 1);
      let checks = 0;
      const signal = { throwIfAborted() { checks += 1; } } as AbortSignal;
      const line = source.createTruncatedLine(source.width * 0.8, "middle", token, signal)!;
      expect(line.runs.filter((run) => run.kind === "glyph").flatMap((run) => run.shaped.glyphs).length).toBeGreaterThan(50_000);
      expect(line.width).toBeLessThanOrEqual(source.width * 0.8 + 1e-9);
      expect(checks).toBeLessThanOrEqual(text.length + 300);
    } finally { font.dispose(); }
  });

  it("retains attributed fonts across a multilingual tail cut", async () => {
    const latin = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    const devanagari = await loadFont("notosansdevanagari-NotoSansDevanagari[wdth,wght].ttf");
    try {
      const text = "office नमस्ते ending";
      const indicStart = text.indexOf("न");
      const indicEnd = indicStart + "नमस्ते".length;
      const source = new TFXTypesetter(new TFXAttributedString(text, [
        { start: 0, end: indicStart, font: latin },
        { start: indicStart, end: indicEnd, font: devanagari },
        { start: indicEnd, end: text.length, font: latin },
      ])).createLine(0, text.length);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font: latin }])).createLine(0, 1);
      const line = source.createTruncatedLine(source.width - latin.shape(" ending").advance.width, "tail", token)!;
      const retainedFonts = new Set(line.runs.filter((run) => run.kind === "glyph").map((run) => run.font));
      expect(retainedFonts.has(latin)).toBe(true);
      expect(retainedFonts.has(devanagari)).toBe(true);
    } finally { latin.dispose(); devanagari.dispose(); }
  });

  it("checks cancellation while walking bounded glyph clusters", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "office ".repeat(200);
      const source = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font }])).createLine(0, 1);
      let checks = 0;
      const signal = { throwIfAborted() { if (++checks > 2) throw new DOMException("bounded cancellation", "AbortError"); } } as AbortSignal;
      expect(() => source.createTruncatedLine(source.width / 2, "middle", token, signal)).toThrow(/bounded cancellation/i);
    } finally { font.dispose(); }
  });
});
