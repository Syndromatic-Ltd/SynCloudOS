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

import { describe, expect, it } from "vitest";

import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { IFXFilterGraph } from "../../../src/FX/ImageFX/IFXFilterGraph";

describe("FX value snapshot regressions", () => {
  it("rejects accessor-backed GFX image descriptors without invoking them", () => {
    let getterCalls = 0;
    const descriptor: Record<string, unknown> = {
      height: 1,
      alpha: "straight",
      colourSpace: "srgb",
      data: new Uint8Array([255, 0, 0, 255]),
    };
    Object.defineProperty(descriptor, "width", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 1;
      },
    });

    expect(() => new GFXImage(descriptor as never)).toThrow(/data shape|plain data|accessor/i);
    expect(getterCalls).toBe(0);
  });

  it("owns source pixel bytes and returned copies independently", () => {
    const source = new Uint8Array([255, 0, 0, 128]);
    const image = new GFXImage({
      width: 1,
      height: 1,
      alpha: "straight",
      colourSpace: "srgb",
      data: source,
    });

    source[0] = 0;
    const copy = image.copyData();
    copy[0] = 0;

    expect(image.pixel(0, 0)).toEqual({ r: 1, g: 0, b: 0, a: 128 / 255 });
  });

  it("rejects accessor-backed serialized IFX nodes without invoking them", () => {
    let getterCalls = 0;
    const node: Record<string, unknown> = {
      origin: { x: 0, y: 0 },
      width: 1,
      height: 1,
      bytesPerRow: 4,
      pixelFormat: "rgba8",
      alpha: "straight",
      colorSpace: "srgb",
      data: [255, 0, 0, 255],
    };
    Object.defineProperty(node, "kind", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "pixels";
      },
    });

    expect(() => IFXFilterGraph.deserialize({ version: 1, nodes: [node], output: 0 })).toThrow(
      /unknown portable graph operation|record shape|data/i,
    );
    expect(getterCalls).toBe(0);
  });
});
