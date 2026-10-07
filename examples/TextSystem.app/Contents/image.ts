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

import { GFXImage } from "@syndromatic/syncloudos/fx/graphics";

/** Private browser decoder. Saved bytes, rather than a regenerated placeholder, supply screen and PDF pixels. */
export async function decodeExamplePNG(bytes: Uint8Array, signal: AbortSignal): Promise<GFXImage> {
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(new Blob([bytes.slice().buffer], { type: "image/png" }));
  try {
    signal.throwIfAborted();
    if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > 256 || bitmap.height > 256) throw new Error("The private example accepts PNG objects up to 256 × 256 pixels.");
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG pixel decoding is unavailable.");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    signal.throwIfAborted();
    return new GFXImage({ width: bitmap.width, height: bitmap.height, colourSpace: "srgb", alpha: "straight", data: new Uint8Array(pixels.data) });
  } finally { bitmap.close(); }
}
