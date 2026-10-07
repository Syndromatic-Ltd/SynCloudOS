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

import { borrowGFXImageBytes, bytePixelComponents, type GFXImage } from '../../FX/GraphicsFX/GFXImage';

/** Match the renderer's top-left contentsRect coordinates to WebGL texture rows.
 * UNPACK_FLIP_Y_WEBGL does not flip typed-array uploads. Cache/upload this once
 * per immutable image, including image-backed masks and byte-backed VFX frames.
 */
export function afxImageTexturePixels(source: GFXImage): Uint8Array {
  // sRGB bytes with straight or opaque alpha are already the upload's
  // encoding (opaque is straight with a = 1), so read the image's storage
  // directly; anything else is converted by GraphicsFX first.
  const direct = source.colourSpace === 'srgb' && (source.alpha === 'straight' || source.alpha === 'opaque');
  const image = direct ? source : source.converting('srgb', 'straight');
  const { width, height, bytesPerRow } = image;
  const stride = width * 4, bytes = new Uint8Array(stride * height);
  const input = borrowGFXImageBytes(image);
  if (image.pixelFormat === 'rgba8' && image.alpha === 'straight') {
    for (let y = 0; y < height; y++) {
      const start = y * bytesPerRow;
      bytes.set(input.subarray(start, start + stride), (height - 1 - y) * stride);
    }
    return bytes;
  }
  const format = image.pixelFormat, alpha = image.alpha, bytesPerPixel = image.bytesPerPixel;
  for (let y = 0; y < height; y++) {
    let at = (height - 1 - y) * stride, index = y * bytesPerRow;
    for (let x = 0; x < width; x++, at += 4, index += bytesPerPixel) {
      const pixel = bytePixelComponents(input, index, format, alpha);
      bytes[at] = Math.round(pixel.r * 255);
      bytes[at + 1] = Math.round(pixel.g * 255);
      bytes[at + 2] = Math.round(pixel.b * 255);
      bytes[at + 3] = Math.round(pixel.a * 255);
    }
  }
  return bytes;
}
