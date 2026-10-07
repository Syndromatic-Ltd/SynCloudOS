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

import { expect, it } from 'vitest';
import { GFXImage } from '../../../src/FX/GraphicsFX/GFXImage';
import { AFXTransform3D } from '../../../src/FX/AnimationFX/AFXTransform3D';
import { quadVertices } from '../../../src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer';
import { afxImageTexturePixels } from '../../../src/SynCloudOS/PlatformAdapters/BrowserAFXImagePixels';

it('keeps an asymmetric image and its alpha mask upright under the actual renderer UV convention', () => {
  // A red top row, blue bottom row, and transparent top/opaque bottom mask.
  const image = new GFXImage({ width: 1, height: 2, alpha: 'straight', colourSpace: 'srgb',
    data: new Uint8Array([255,0,0,255, 0,0,255,255]) });
  const mask = new GFXImage({ width: 1, height: 2, pixelFormat: 'a8', alpha: 'straight', colourSpace: 'srgb',
    data: new Uint8Array([0,255]) });
  const vertices = quadVertices({ content: image, uv: { x: 0, y: 0, width: 1, height: 1 },
    bounds: { x: 0, y: 0, width: 1, height: 2 }, transform: new AFXTransform3D(), opacity: 1,
    mask: { content: mask, uv: { x: 0, y: 0, width: 1, height: 1 } },
  }, { width: 1, height: 2, pixelRatio: 1, quads: [] });
  const topV = vertices[5], maskTopV = vertices[16];
  const sample = (bytes: Uint8Array, v: number) => [...bytes.slice(Math.round(v) * 4, Math.round(v) * 4 + 4)];
  expect(sample(afxImageTexturePixels(image), topV)).toEqual([255,0,0,255]);
  expect(sample(afxImageTexturePixels(image), 1 - topV)).toEqual([0,0,255,255]);
  expect(sample(afxImageTexturePixels(mask), maskTopV)[3]).toBe(0);
  expect(sample(afxImageTexturePixels(mask), 1 - maskTopV)[3]).toBe(255);
  expect(image.pixel(0, 0)).toEqual({ r: 1, g: 0, b: 0, a: 1 });
});

it('excludes image row padding from texture pixels', () => {
  const image = new GFXImage({ width: 1, height: 2, bytesPerRow: 8, alpha: 'straight', colourSpace: 'srgb',
    data: new Uint8Array([255,0,0,255, 99,99,99,99, 0,0,255,255, 99,99,99,99]) });
  expect([...afxImageTexturePixels(image)]).toEqual([0,0,255,255, 255,0,0,255]);
});
