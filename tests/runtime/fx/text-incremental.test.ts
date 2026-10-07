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

import { expect, it, vi } from "vitest";
import {
  TFXLayoutCache,
  TFXTextContainer,
  type TFXTextLayoutResult,
} from "../../../src/FX/TextFX/public";
import { NSELayoutManager } from "../../../src/NSE/TextLayout/NSELayoutManager";

function result(text: string): TFXTextLayoutResult {
  return Object.freeze({
    fragments: Object.freeze([
      Object.freeze({
        text,
        range: Object.freeze({ location: 0, length: text.length }),
        graphemeRange: Object.freeze({ location: 0, length: text.length }),
        rect: Object.freeze({ x: 0, y: 0, width: text.length * 8, height: 16 }),
        baseline: 12,
        containerIndex: 0,
      }),
    ]),
    laidOutRange: Object.freeze({ location: 0, length: text.length }),
    truncated: false,
  });
}

const font = Object.freeze({
  families: Object.freeze(["Prelude"]),
  size: 16,
  weight: 400,
  style: "normal" as const,
  stretch: "normal" as const,
});

it("keys cached layout by revision, font generation, locale, direction and container geometry", () => {
  const cache = new TFXLayoutCache({ maximumBytes: 16_384, maximumEntries: 8 });
  const container = new TFXTextContainer({
    size: { width: 160, height: 80 },
    exclusionRects: [{ x: 40, y: 0, width: 20, height: 16 }],
  });
  const key = {
    revision: 4,
    attributedRevision: 2,
    fontGeneration: 7,
    text: "hello",
    font,
    locale: "en-GB",
    direction: "ltr" as const,
    containers: [container],
  };
  const value = result("hello");

  cache.store(key, value);
  expect(cache.lookup(key)).toBe(value);
  expect(cache.lookup({ ...key, revision: 5 })).toBeNull();
  expect(cache.lookup({ ...key, fontGeneration: 8 })).toBeNull();
  expect(cache.lookup({ ...key, locale: "fr-FR" })).toBeNull();
  expect(cache.lookup({ ...key, direction: "rtl" })).toBeNull();
  expect(cache.lookup({
    ...key,
    containers: [new TFXTextContainer({
      size: { width: 161, height: 80 },
      exclusionRects: [{ x: 40, y: 0, width: 20, height: 16 }],
    })],
  })).toBeNull();
});

it("bounds retained layout bytes and releases all retained identities on dispose", () => {
  const cache = new TFXLayoutCache({ maximumBytes: 720, maximumEntries: 16 });
  const container = new TFXTextContainer({ size: { width: 100, height: 60 } });
  const base = {
    attributedRevision: 0,
    fontGeneration: 0,
    font,
    locale: "en-GB",
    direction: "ltr" as const,
    containers: [container],
  };

  for (let revision = 0; revision < 20; revision += 1) {
    const text = `row-${revision}-${"x".repeat(24)}`;
    cache.store({ ...base, revision, text }, result(text));
  }

  expect(cache.diagnostics().liveBytes).toBeLessThanOrEqual(720);
  expect(cache.diagnostics().entryCount).toBeLessThan(20);
  expect(cache.diagnostics().evictionCount).toBeGreaterThan(0);
  cache.dispose();
  expect(cache.diagnostics()).toMatchObject({ entryCount: 0, liveBytes: 0, disposed: true });
  expect(() => cache.store({ ...base, revision: 99, text: "late" }, result("late"))).toThrow(/disposed/i);
});

it("expands Arabic edits to the containing paragraph shaping and bidi dependency boundary", async () => {
  const arabic = String.fromCodePoint(1605, 1585, 1581, 1576, 1575, 32, 1576, 1603, 1605, 32, 1601, 1610, 32, 1575, 1604, 1593, 1575, 1604, 1605);
  const text = `stable prefix\n${arabic}`;
  const paragraphStart = text.indexOf(arabic);
  const secondLineStart = paragraphStart + 10;
  const calls: Array<{ readonly text: string; readonly continuation?: { readonly textOffset: number } }> = [];
  const fullResult: TFXTextLayoutResult = Object.freeze({
    fragments: Object.freeze([
      Object.freeze({
        text: "stable prefix\n",
        range: Object.freeze({ location: 0, length: paragraphStart }),
        graphemeRange: Object.freeze({ location: 0, length: paragraphStart }),
        rect: Object.freeze({ x: 0, y: 0, width: 96, height: 16 }),
        baseline: 12,
        containerIndex: 0,
      }),
      Object.freeze({
        text: text.slice(paragraphStart, secondLineStart),
        range: Object.freeze({ location: paragraphStart, length: secondLineStart - paragraphStart }),
        graphemeRange: Object.freeze({ location: paragraphStart, length: secondLineStart - paragraphStart }),
        rect: Object.freeze({ x: 0, y: 16, width: 96, height: 16 }),
        baseline: 28,
        containerIndex: 0,
      }),
      Object.freeze({
        text: text.slice(secondLineStart),
        range: Object.freeze({ location: secondLineStart, length: text.length - secondLineStart }),
        graphemeRange: Object.freeze({ location: secondLineStart, length: text.length - secondLineStart }),
        rect: Object.freeze({ x: 0, y: 32, width: 96, height: 16 }),
        baseline: 44,
        containerIndex: 0,
      }),
    ]),
    laidOutRange: Object.freeze({ location: 0, length: text.length }),
    truncated: false,
  });
  const service = {
    segment: vi.fn(({ text: value }: { readonly text: string }) => Object.freeze(Array.from(value).map((segment, index) => Object.freeze({
      segment,
      index,
      end: index + segment.length,
      breakOpportunity: false,
    })))),
    layout: vi.fn(async (input: { readonly text: string; readonly continuation?: { readonly textOffset: number } }) => {
      calls.push(input);
      if (!input.continuation) return fullResult;
      return Object.freeze({
        fragments: Object.freeze([
          Object.freeze({
            text: input.text,
            range: Object.freeze({ location: 0, length: input.text.length }),
            graphemeRange: Object.freeze({ location: 0, length: input.text.length }),
            rect: Object.freeze({ x: 0, y: 16, width: 96, height: 16 }),
            baseline: 28,
            containerIndex: 0,
          }),
        ]),
        laidOutRange: Object.freeze({ location: 0, length: input.text.length }),
        truncated: false,
      });
    }),
  };
  const manager = new NSELayoutManager({ service });
  const container = new TFXTextContainer({ size: { width: 120, height: 80 } });

  await manager.layout({ text, font, locale: "ar", direction: "rtl" }, [container]);
  const edit = secondLineStart + 2;
  manager.replaceCharacters({ location: edit, length: 1 }, String.fromCodePoint(1573));
  await manager.layout();

  expect(calls[1]?.continuation?.textOffset).toBe(paragraphStart);
  expect(manager.fragments[0]).toBe(fullResult.fragments[0]);
});


it("reuses an unchanged revision result identity without invoking layout again", async () => {
  const value = result("cache me");
  const service = {
    fontReadinessGeneration: 0,
    segment: vi.fn(() => Object.freeze([])),
    layout: vi.fn(async () => value),
  };
  const manager = new NSELayoutManager({ service });
  const container = new TFXTextContainer({ size: { width: 120, height: 40 } });
  const input = { text: "cache me", font, locale: "en-GB", direction: "ltr" as const };

  const first = await manager.layout(input, [container]);
  const second = await manager.layout(input, [container]);

  expect(second).toBe(first);
  expect(service.layout).toHaveBeenCalledTimes(1);
});
