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

import { afterEach, expect, it, vi } from "vitest";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { afxImageTexturePixels } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAFXImagePixels";

afterEach(() => { vi.restoreAllMocks(); });

/** The previous per-pixel implementation, kept as the reference. */
function reference(source: GFXImage): Uint8Array {
  const image = source.converting("srgb", "straight");
  const stride = image.width * 4, bytes = new Uint8Array(stride * image.height);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const pixel = image.pixel(x, y), at = (image.height - 1 - y) * stride + x * 4;
    bytes.set([pixel.r, pixel.g, pixel.b, pixel.a].map(channel => Math.round(channel * 255)), at);
  }
  return bytes;
}

const formats = [
  { pixelFormat: "rgba8", alpha: "straight", channels: 4 },
  { pixelFormat: "bgra8", alpha: "straight", channels: 4 },
  { pixelFormat: "bgra8", alpha: "opaque", channels: 4 },
  { pixelFormat: "rgb8", alpha: "opaque", channels: 3 },
  { pixelFormat: "a8", alpha: "straight", channels: 1 },
] as const;

it.each(formats)("uploads $pixelFormat/$alpha rows bottom-up without copying or per-pixel records", ({ pixelFormat, alpha, channels }) => {
  const width = 5, height = 3, bytesPerRow = width * channels + 3;
  const data = Uint8Array.from({ length: bytesPerRow * height }, (_, index) => (index * 37 + 11) % 256);
  const image = new GFXImage({ width, height, bytesPerRow, pixelFormat, alpha, colourSpace: "srgb", data });
  const expected = reference(image);
  const copy = vi.spyOn(GFXImage.prototype, "copyData");
  const pixel = vi.spyOn(GFXImage.prototype, "pixel");
  const actual = afxImageTexturePixels(image);
  expect(copy).not.toHaveBeenCalled();
  expect(pixel).not.toHaveBeenCalled();
  expect(Array.from(actual)).toEqual(Array.from(expected));
});

it("keeps converting premultiplied, grayscale or other colour spaces through GraphicsFX first", () => {
  const images = [
    new GFXImage({ width: 2, height: 2, pixelFormat: "rgba8", alpha: "premultiplied", colourSpace: "srgb",
      data: new Uint8Array([128, 64, 0, 128, 255, 255, 255, 255, 0, 0, 0, 0, 10, 20, 30, 40]) }),
    new GFXImage({ width: 3, height: 2, pixelFormat: "gray8", alpha: "opaque", colourSpace: "grayscale",
      data: new Uint8Array([0, 40, 128, 200, 255, 17]) }),
    new GFXImage({ width: 2, height: 1, pixelFormat: "rgba8", alpha: "straight", colourSpace: "display-p3",
      data: new Uint8Array([255, 0, 0, 255, 0, 128, 255, 64]) }),
  ];
  for (const image of images) expect(Array.from(afxImageTexturePixels(image))).toEqual(Array.from(reference(image)));
});
