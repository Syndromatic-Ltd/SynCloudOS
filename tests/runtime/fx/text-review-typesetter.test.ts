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
import { expect, it } from "vitest";
import { TFXAttributedString, TFXFont, TFXFontDescriptor, TFXTypesetter } from "../../../src/FX/TextFX/public";

const loadFont = (family: string, size: number) => TFXFont.create(
  new Uint8Array(readFileSync(`tests/fixtures/fx/fonts/${family}[wdth,wght].ttf`)),
  new TFXFontDescriptor({ size }),
);

it.each(["a नमस्ते", "नमस्ते a", "  नमस्ते a"])("itemizes scripts and retains the Devanagari conjunct in %s", async text => {
  const font = await loadFont("notosansdevanagari-NotoSansDevanagari", 18);
  try {
    const wordStart = text.indexOf("नमस्ते");
    const wordEnd = wordStart + "नमस्ते".length;
    const line = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
    const actual = line.runs.flatMap(run => run.shaped.glyphs
      .filter(glyph => run.start + glyph.cluster >= wordStart && run.start + glyph.cluster < wordEnd)
      .map(glyph => ({ id: glyph.id, cluster: run.start + glyph.cluster - wordStart })));
    const expected = font.shape("नमस्ते", { script: "Deva" }).glyphs.map(({ id, cluster }) => ({ id, cluster }));
    expect(actual).toEqual(expected);
  } finally { font.dispose(); }
});

it("measures trailing whitespace using each actual shaped font run", async () => {
  const small = await loadFont("notosans-NotoSans", 12);
  const large = await loadFont("notosans-NotoSans", 100);
  try {
    const line = new TFXTypesetter(new TFXAttributedString("a  ", [
      { start: 0, end: 2, font: small }, { start: 2, end: 3, font: large },
    ])).createLine(0, 3);
    expect(line.trailingWhitespaceWidth).toBeCloseTo(small.shape(" ").advance.width + large.shape(" ").advance.width);
    expect(line.width - line.trailingWhitespaceWidth).toBeCloseTo(small.shape("a").advance.width);
  } finally { small.dispose(); large.dispose(); }
});
