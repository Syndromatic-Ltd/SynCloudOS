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
import { Buffer as ShapingBuffer } from "harfbuzzjs";
import LineBreaker from "linebreak";
import { expect, it, vi } from "vitest";
import { TFXFont, TFXFontDescriptor, TFXAttributedString, TFXTypesetter } from "../../../src/FX/TextFX/public";

async function font() {
  return TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 16 }));
}

function suggestLineBreakByShaping(setter: TFXTypesetter, text: string, start: number, width: number): number {
  const suffix = text.slice(start);
  const breaker = new LineBreaker(suffix);
  let accepted = 0;
  for (let next = breaker.nextBreak(); next; next = breaker.nextBreak()) {
    if (setter.createLine(start, next.position).width > width) break;
    accepted = next.position;
    if (next.required) return accepted;
  }
  if (accepted) return accepted;
  for (const { index, segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(suffix)) {
    const end = index + segment.length;
    if (setter.createLine(start, end).width > width) return accepted || end;
    accepted = end;
  }
  return accepted;
}

it("matches the prefix-shaping break offsets at exact widths and on either side", async () => {
  const f = await font();
  try {
    const vocabularies = [
      ["office", "AVATAR", "e\u0301", "fitness", "fluff", "wait"],
      ["slow", "word\tcell", "after\r\nlast", "left", "e\u0301", "long"],
      ["A", "אבג", "مرحبا", "漢字", "😀", "456"],
    ];
    for (const [group, words] of vocabularies.entries()) {
      for (let seed = 0; seed < 9; seed += 1) {
        const text = " ".repeat(seed % 3) + Array.from({ length: 7 }, (_, index) => words[(seed + index * (seed + 1)) % words.length]).join(seed % 2 ? " " : "  ");
        const split = text.indexOf(" ", seed % 3) + 1;
        const runs = [{ start: 0, end: text.length, font: f, ...(seed % 2 ? { language: "en", features: { kern: 0, liga: 0 } } : {}) }];
        if (group === 2 && split > 0 && split < text.length) runs.splice(0, 1, { ...runs[0]!, end: split }, { ...runs[0]!, start: split });
        const setter = new TFXTypesetter(new TFXAttributedString(text, runs), seed % 3 === 1 && group === 2 ? "rtl" : "ltr", group === 2 && seed % 3 === 2 ? "vertical" : "horizontal");
        for (const start of new Set([0, seed % 3, split])) {
          const exact = setter.createLine(start, text.length - start).width;
          for (const width of [0, 1, 50, 97, exact - 1e-8, exact, exact + 1e-8]) {
            expect(setter.suggestLineBreak(start, width), JSON.stringify({ text, start, width })).toBe(suggestLineBreakByShaping(setter, text, start, width));
          }
          const breaker = new LineBreaker(text.slice(start));
          for (let next = breaker.nextBreak(); next; next = breaker.nextBreak()) {
            const width = setter.createLine(start, next.position).width;
            for (const threshold of [Math.max(0, width - 1e-8), width, width + 1e-8]) {
              expect(setter.suggestLineBreak(start, threshold), JSON.stringify({ text, start, threshold })).toBe(suggestLineBreakByShaping(setter, text, start, threshold));
            }
            if (next.required) break;
          }
        }
      }
    }
  } finally { f.dispose(); }
});

it("shapes far fewer prefixes of a fitting Latin line", async () => {
  const f = await font();
  try {
    const text = "office e\u0301 one two three four five six seven eight nine ".repeat(10).trimEnd();
    const setter = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font: f }]));
    const shape = vi.spyOn(ShapingBuffer.prototype, "getGlyphPositions");
    try {
      expect(setter.suggestLineBreak(0, 10000)).toBe(text.length);
      expect(shape.mock.calls.length).toBeLessThanOrEqual(5);
    } finally { shape.mockRestore(); }
    const width = setter.createLine(0, 304).width;
    for (const threshold of [width - 1e-8, width, width + 1e-8]) {
      expect(setter.suggestLineBreak(0, threshold)).toBe(suggestLineBreakByShaping(setter, text, 0, threshold));
    }
  } finally { f.dispose(); }
});

it("preserves attributed UTF-16 ranges and breaks at actual shaped widths", async () => {
  const f = await font();
  const input = new TFXAttributedString("hello world hello", [{ start: 0, end: 17, font: f }]);
  const setter = new TFXTypesetter(input);
  const width = f.shape("hello ").advance.width + 1;
  const count = setter.suggestLineBreak(0, width);
  expect(count).toBe(6);
  const line = setter.createLine(0, count);
  expect(line.width).toBeLessThanOrEqual(width);
  expect(line.trailingWhitespaceWidth).toBeGreaterThan(0);
  expect(line.stringIndexForPosition(0)).toBe(0);
  expect(line.stringIndexForPosition(line.width + 10)).toBe(6);
  f.dispose();
});

it("rejects gaps, overlaps and surrogate-splitting attributed ranges", async () => {
  const f = await font();
  expect(() => new TFXAttributedString("abc", [{ start: 0, end: 2, font: f }])).toThrow();
  expect(() => new TFXAttributedString("a😀b", [{ start: 0, end: 2, font: f }, { start: 2, end: 4, font: f }])).toThrow();
  f.dispose();
});

it("fits long unbreakable words at grapheme boundaries and honors explicit newlines", async () => {
  const f = await font();
  const text = "abcdefgh\nlast";
  const setter = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font: f }]));
  expect(setter.suggestLineBreak(0, 1)).toBe(1);
  expect(setter.suggestLineBreak(0, 1000)).toBe(9);
  expect(() => setter.suggestLineBreak(0, NaN)).toThrow();
  f.dispose();
});
