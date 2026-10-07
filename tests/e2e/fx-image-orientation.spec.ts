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

import { expect, test } from "playwright/test";
import linearICC from "../fixtures/linear-icc-formats.json" with { type: "json" };

test("browser image pixels numerically honour a supported source ICC profile", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createBrowserImagePlatform } = await import("/src/SynCloudOS/PlatformAdapters/BrowserImagePlatform.ts");
    // Synthetic 1x1 RGB(96) PNG with a linear matrix/TRC ICC v4 profile.
    // Correct sRGB publication is approximately 165, not the encoded 96.
    const encoded = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAnWlDQ1BMaW5lYXIAAHicY2BgtGBgYGBgYWBgyM0rKQpyd1KIiIxSYEACicnFBQx4wbdrDIwg+rIufnVYAVtRRGQUAwPDGQYGBpF0CPsBiJ0EYX8BsYtCgpwZGBg5GBgYBNIhbAkQOwnC1gCxEe7OX8zAYPGNgYF5IkIsaQoDw/ZWBgaJOwgxlYUMDPytDAzbriSXFpVB3cMI8gohPgBrAiXsjHbs9gAAAAlwSFlzAAAD6AAAA+gBtXtSawAAAA1JREFUeJxjSEhI+A8ABGQCIH+fkS4AAAAASUVORK5CYII="), character => character.charCodeAt(0));
    const platform = createBrowserImagePlatform(document, window);
    const decoded = await platform.decode({ kind: "bytes", mimeType: "image/png", bytes: encoded }, new AbortController().signal);
    try {
      const pixels = await platform.readPixels!(decoded.src, decoded.intrinsicSize, new AbortController().signal);
      const exported = await platform.export!(decoded.src, decoded.intrinsicSize, "image/png", new AbortController().signal);
      const webp = await platform.export!(decoded.src, decoded.intrinsicSize, "image/webp", new AbortController().signal);
      const bitmap = await createImageBitmap(new Blob([exported as BlobPart], { type: "image/png" }));
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      const exportedRed = context.getImageData(0, 0, 1, 1).data[0];
      bitmap.close();
      return { pixel: pixels.pixel(0, 0), exportedRed, sourceProfileBytes: decoded.sourceICCProfile?.length,
        webpHeader: String.fromCharCode(...webp.subarray(0, 4)), webpFormat: String.fromCharCode(...webp.subarray(8, 12)) };
    } finally { platform.revokeObjectURL(decoded.src); }
  });
  expect(result.sourceProfileBytes).toBe(312);
  expect(result.pixel.r * 255).toBeGreaterThanOrEqual(163);
  expect(result.pixel.r * 255).toBeLessThanOrEqual(167);
  expect(result.exportedRed).toBeGreaterThanOrEqual(163);
  expect(result.exportedRed).toBeLessThanOrEqual(167);
  expect(result.webpHeader).toBe("RIFF");
  expect(result.webpFormat).toBe("WEBP");
  expect(result.pixel.g).toBeCloseTo(result.pixel.r, 5);
  expect(result.pixel.b).toBeCloseTo(result.pixel.r, 5);
});

test("unsupported source ICC remains metadata without falsely claiming sRGB pixels", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createBrowserImagePlatform } = await import("/src/SynCloudOS/PlatformAdapters/BrowserImagePlatform.ts");
    // Valid 1x1 PNG with a bounded ICC header but no supported transform tags.
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAHWlDQ1BzUkdCAAB4nGNgYGhhIAASk4sLCKmhBAAA3w8CLOyuWtsAAAANSURBVHicY0hISPgPAARkAiB/n5EuAAAAAElFTkSuQmCC"), character => character.charCodeAt(0));
    const platform = createBrowserImagePlatform(document, window);
    const signal = new AbortController().signal;
    const decoded = await platform.decode({ kind: "bytes", mimeType: "image/png", bytes }, signal);
    try {
      let pixelError: string | null = null, exportError: string | null = null;
      try { await platform.readPixels!(decoded.src, decoded.intrinsicSize, signal); }
      catch (error) { pixelError = error instanceof Error ? error.name : String(error); }
      try { await platform.export(decoded.src, decoded.intrinsicSize, "image/png", signal); }
      catch (error) { exportError = error instanceof Error ? error.name : String(error); }
      return { profileBytes: decoded.sourceICCProfile?.length, pixelError, exportError };
    } finally { platform.revokeObjectURL(decoded.src); }
  });
  expect(result).toEqual({ profileBytes: 132, pixelError: "NotSupportedError", exportError: "NotSupportedError" });
});

test("JPEG, WebP and GIF source ICC pixels and PNG export use one measured conversion", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async (fixtures) => {
    const { createBrowserImagePlatform } = await import("/src/SynCloudOS/PlatformAdapters/BrowserImagePlatform.ts");
    const platform = createBrowserImagePlatform(document, window);
    const outputs: Record<string, { pixel: number; exported: number; profileBytes: number | null }> = {};
    for (const [format, base64] of Object.entries({ jpeg: fixtures.jpeg, webp: fixtures.webp, gif: fixtures.gif })) {
      const encoded = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      const decoded = await platform.decode({ kind: "bytes", mimeType: `image/${format}`, bytes: encoded }, new AbortController().signal);
      try {
        const pixels = await platform.readPixels!(decoded.src, decoded.intrinsicSize, new AbortController().signal);
        const exported = await platform.export!(decoded.src, decoded.intrinsicSize, "image/png", new AbortController().signal);
        const bitmap = await createImageBitmap(new Blob([exported as BlobPart], { type: "image/png" }));
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);
        outputs[format] = { pixel: pixels.pixel(0, 0).r * 255,
          exported: context.getImageData(0, 0, 1, 1).data[0]!, profileBytes: decoded.sourceICCProfile?.length ?? null };
        bitmap.close();
      } finally { platform.revokeObjectURL(decoded.src); }
    }
    return outputs;
  }, linearICC);
  for (const format of ["jpeg", "webp", "gif"] as const) {
    expect(result[format]?.profileBytes).toBe(312);
    expect(result[format]!.pixel).toBeGreaterThanOrEqual(162);
    expect(result[format]!.pixel).toBeLessThanOrEqual(168);
    expect(result[format]!.exported).toBeGreaterThanOrEqual(162);
    expect(result[format]!.exported).toBeLessThanOrEqual(168);
  }
});

test("browser decode retains an owned GIF89a ICC application profile", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createBrowserImagePlatform } = await import("/src/SynCloudOS/PlatformAdapters/BrowserImagePlatform.ts");
    const base = Uint8Array.from(atob("R0lGODlhAQABAAD/ACwAAAAAAQABAAACAUwAOw=="), character => character.charCodeAt(0));
    const descriptor = base.indexOf(0x2c, 13);
    if (descriptor < 0) throw new Error("GIF fixture omitted image descriptor.");
    const profile = new Uint8Array(132);
    new DataView(profile.buffer).setUint32(0, profile.length);
    profile.set([97, 99, 115, 112], 36);
    const extension = new Uint8Array([33, 255, 11, ...new TextEncoder().encode("ICCRGBG1012"), 132, ...profile, 0]);
    const gif = new Uint8Array(base.length + extension.length);
    gif.set(base.subarray(0, descriptor));
    gif.set(extension, descriptor);
    gif.set(base.subarray(descriptor), descriptor + extension.length);
    const platform = createBrowserImagePlatform(document, window);
    const decoded = await platform.decode({ kind: "bytes", mimeType: "image/gif", bytes: gif }, new AbortController().signal);
    try {
      gif.fill(0);
      return { size: decoded.intrinsicSize, profile: decoded.sourceICCProfile ? Array.from(decoded.sourceICCProfile) : null };
    } finally { platform.revokeObjectURL(decoded.src); }
  });
  expect(result.size).toEqual({ width: 1, height: 1 });
  expect(result.profile).toHaveLength(132);
  expect(result.profile?.slice(36, 40)).toEqual([97, 99, 115, 112]);
});

test("browser decode preserves PNG eXIf source orientation from a valid encoded image", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createBrowserImagePlatform } = await import("/src/SynCloudOS/PlatformAdapters/BrowserImagePlatform.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 3; canvas.height = 2;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "red"; context.fillRect(0, 0, 1, 2);
    context.fillStyle = "blue"; context.fillRect(2, 0, 1, 2);
    const encoded = new Uint8Array(await (await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"))).arrayBuffer());
    const tiff = new Uint8Array(26);
    const tiffView = new DataView(tiff.buffer);
    tiff.set([73, 73]); tiffView.setUint16(2, 42, true); tiffView.setUint32(4, 8, true);
    tiffView.setUint16(8, 1, true); tiffView.setUint16(10, 274, true);
    tiffView.setUint16(12, 3, true); tiffView.setUint32(14, 1, true); tiffView.setUint16(18, 6, true);
    const chunk = (name: string, payload: Uint8Array) => {
      const result = new Uint8Array(12 + payload.length);
      const view = new DataView(result.buffer);
      view.setUint32(0, payload.length);
      result.set(new TextEncoder().encode(name), 4); result.set(payload, 8);
      let crc = 0xffffffff;
      for (const byte of result.subarray(4, result.length - 4)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0);
      return result;
    };
    const exif = chunk("eXIf", tiff);
    // A small zlib stream for a 132-byte owned ICC specimen with an acsp header.
    const compressedICC = new Uint8Array([120, 156, 99, 96, 96, 104, 97, 32, 0, 18, 147, 139, 11, 8, 169, 161, 4, 0, 0, 223, 15, 2, 44]);
    const icc = chunk("iCCP", new Uint8Array([115, 82, 71, 66, 0, 0, ...compressedICC]));
    const encodedView = new DataView(encoded.buffer);
    const originalChunks: Uint8Array[] = [];
    for (let offset = 8; offset + 12 <= encoded.length;) {
      const length = encodedView.getUint32(offset);
      const name = new TextDecoder().decode(encoded.subarray(offset + 4, offset + 8));
      if (offset + 12 + length > encoded.length) throw new Error("Browser PNG fixture contains a truncated chunk.");
      // WebKit's canvas encoder emits an ICC profile; the fixture supplies its own.
      if (name !== "iCCP") originalChunks.push(encoded.subarray(offset, offset + 12 + length));
      offset += length + 12;
      if (name === "IEND") break;
    }
    if (originalChunks[0]?.[4] !== 73 || originalChunks.at(-1)?.[4] !== 73)
      throw new Error("Browser PNG encoder omitted IHDR or IEND.");
    const png = new Uint8Array(8 + originalChunks.reduce((sum, part) => sum + part.length, 0) + exif.length + icc.length);
    png.set(encoded.subarray(0, 8));
    let position = 8;
    png.set(originalChunks[0]!, position); position += originalChunks[0]!.length;
    png.set(icc, position); position += icc.length;
    for (const part of originalChunks.slice(1, -1)) { png.set(part, position); position += part.length; }
    png.set(exif, position); position += exif.length;
    png.set(originalChunks.at(-1)!, position);
    const platform = createBrowserImagePlatform(document, window);
    const decoded = await platform.decode({ kind: "bytes", mimeType: "image/png", bytes: png }, new AbortController().signal);
    try { return { orientation: decoded.sourceOrientation, profile: decoded.sourceICCProfile ? Array.from(decoded.sourceICCProfile) : null, size: decoded.intrinsicSize }; }
    finally { platform.revokeObjectURL(decoded.src); }
  });
  expect(result.orientation).toBe(6);
  expect(result.profile).toHaveLength(132);
  expect(result.profile?.slice(36, 40)).toEqual([97, 99, 115, 112]);
  expect(result.size.width * result.size.height).toBe(6);
});

test("browser decode preserves EXIF source orientation and reads display-oriented pixels", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async (profileFixture) => {
    const { createBrowserImagePlatform } = await import("/src/SynCloudOS/PlatformAdapters/BrowserImagePlatform.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 3;
    canvas.height = 2;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "red";
    context.fillRect(0, 0, 1, 2);
    context.fillStyle = "blue";
    context.fillRect(2, 0, 1, 2);
    const encoded = new Uint8Array(await (await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/jpeg", 1))).arrayBuffer());
    // Canvas encoders in some engines include their own ICC APP2 marker. Strip
    // that fixture metadata so the explicit two-part profile is the only one.
    const stripped: number[] = [255, 216];
    let cursor = 2;
    while (cursor + 3 < encoded.length) {
      if (encoded[cursor] !== 255 || encoded[cursor + 1] === 218) break;
      const marker = encoded[cursor + 1];
      const length = (encoded[cursor + 2]! << 8) | encoded[cursor + 3]!;
      if (length < 2 || cursor + 2 + length > encoded.length) break;
      const isICC = marker === 226 && encoded[cursor + 4] === 73 && encoded[cursor + 5] === 67 && encoded[cursor + 6] === 67;
      if (!isICC) stripped.push(...encoded.subarray(cursor, cursor + 2 + length));
      cursor += 2 + length;
    }
    stripped.push(...encoded.subarray(cursor));
    const original = new Uint8Array(stripped);
    const tiff = new Uint8Array(26);
    const view = new DataView(tiff.buffer);
    tiff.set([73, 73]);
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 274, true);
    view.setUint16(12, 3, true);
    view.setUint32(14, 1, true);
    view.setUint16(18, 6, true);
    const segment = new Uint8Array([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, ...tiff]);
    const webp = Uint8Array.from(atob(profileFixture), character => character.charCodeAt(0));
    const webpView = new DataView(webp.buffer);
    let profile: Uint8Array | null = null;
    for (let offset = 12; offset + 8 <= webp.length;) {
      const length = webpView.getUint32(offset + 4, true);
      const name = new TextDecoder().decode(webp.subarray(offset, offset + 4));
      if (name === "ICCP") profile = webp.slice(offset + 8, offset + 8 + length);
      offset += 8 + length + (length & 1);
    }
    if (!profile || profile.length !== 312) throw new Error("Supported ICC fixture is missing.");
    const iccChunks = [0, 1].map(index => {
      const payload = profile!.subarray(index * 156, (index + 1) * 156);
      const length = payload.length + 16;
      return new Uint8Array([255, 226, length >> 8, length & 255, 73, 67, 67, 95, 80, 82, 79, 70, 73, 76, 69, 0, index + 1, 2, ...payload]);
    });
    const jpeg = new Uint8Array(original.length + segment.length + iccChunks.reduce((sum, chunk) => sum + chunk.length, 0));
    jpeg.set(original.subarray(0, 2));
    jpeg.set(segment, 2);
    let position = 2 + segment.length;
    for (const chunk of iccChunks) { jpeg.set(chunk, position); position += chunk.length; }
    jpeg.set(original.subarray(2), position);
    const platform = createBrowserImagePlatform(document, window);
    const decoded = await platform.decode({ kind: "bytes", mimeType: "image/jpeg", bytes: jpeg }, new AbortController().signal);
    try {
      const pixels = await platform.readPixels!(decoded.src, decoded.intrinsicSize, new AbortController().signal);
      return { sourceOrientation: decoded.sourceOrientation, sourceICCProfile: decoded.sourceICCProfile ? Array.from(decoded.sourceICCProfile) : null, size: decoded.intrinsicSize, pixelSize: [pixels.width, pixels.height], topRight: pixels.pixel(1, 0), bottomLeft: pixels.pixel(0, 2) };
    } finally {
      platform.revokeObjectURL(decoded.src);
    }
  }, linearICC.webp);
  expect(result.sourceOrientation).toBe(6);
  expect(result.sourceICCProfile).toHaveLength(312);
  expect(result.sourceICCProfile?.slice(36, 40)).toEqual([97, 99, 115, 112]);
  expect(result.size).toEqual({ width: 2, height: 3 });
  expect(result.pixelSize).toEqual([2, 3]);
  expect(result.topRight.r).toBeGreaterThan(result.topRight.b);
  expect(result.bottomLeft.b).toBeGreaterThan(result.bottomLeft.r);
});

test("browser decode preserves extended WebP EXIF and ICC source metadata", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createBrowserImagePlatform } = await import("/src/SynCloudOS/PlatformAdapters/BrowserImagePlatform.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 3; canvas.height = 2;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white"; context.fillRect(0, 0, 3, 2);
    context.fillStyle = "red"; context.fillRect(0, 0, 1, 2);
    context.fillStyle = "blue"; context.fillRect(2, 0, 1, 2);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), "image/webp", 1));
    if (blob.type !== "image/webp") throw new Error("Browser did not encode WebP for the metadata fixture.");
    const encoded = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(encoded.buffer);
    const imageChunks: Uint8Array[] = [];
    for (let offset = 12; offset + 8 <= encoded.byteLength;) {
      const length = view.getUint32(offset + 4, true);
      const end = offset + 8 + length + (length & 1);
      if (end > encoded.byteLength) throw new Error("Browser WebP fixture has a truncated chunk.");
      const name = new TextDecoder().decode(encoded.subarray(offset, offset + 4));
      if (name === "VP8 " || name === "VP8L") imageChunks.push(encoded.subarray(offset, end));
      offset = end;
    }
    if (imageChunks.length !== 1) throw new Error("Browser WebP fixture has no single image bitstream.");
    const tiff = new Uint8Array(26);
    const tiffView = new DataView(tiff.buffer);
    tiff.set([73, 73]);
    tiffView.setUint16(2, 42, true); tiffView.setUint32(4, 8, true);
    tiffView.setUint16(8, 1, true); tiffView.setUint16(10, 274, true);
    tiffView.setUint16(12, 3, true); tiffView.setUint32(14, 1, true);
    tiffView.setUint16(18, 6, true);
    const profile = new Uint8Array(132);
    new DataView(profile.buffer).setUint32(0, 132);
    profile.set([97, 99, 115, 112], 36);
    const chunk = (name: string, payload: Uint8Array) => new Uint8Array([
      ...new TextEncoder().encode(name), payload.length & 255, (payload.length >>> 8) & 255,
      (payload.length >>> 16) & 255, (payload.length >>> 24) & 255,
      ...payload, ...(payload.length & 1 ? [0] : []),
    ]);
    const extended = chunk("VP8X", new Uint8Array([0x28, 0, 0, 0, 2, 0, 0, 1, 0, 0]));
    const chunks = [extended, chunk("ICCP", profile), imageChunks[0]!, chunk("EXIF", tiff)];
    const total = 12 + chunks.reduce((sum, item) => sum + item.byteLength, 0);
    const webp = new Uint8Array(total);
    webp.set(new TextEncoder().encode("RIFF"));
    new DataView(webp.buffer).setUint32(4, total - 8, true);
    webp.set(new TextEncoder().encode("WEBP"), 8);
    let position = 12;
    for (const item of chunks) { webp.set(item, position); position += item.byteLength; }
    const platform = createBrowserImagePlatform(document, window);
    const decoded = await platform.decode({ kind: "bytes", mimeType: "image/webp", bytes: webp }, new AbortController().signal);
    try {
      return { orientation: decoded.sourceOrientation, profile: decoded.sourceICCProfile ? Array.from(decoded.sourceICCProfile) : null, size: decoded.intrinsicSize };
    } finally { platform.revokeObjectURL(decoded.src); }
  });
  expect(result.orientation).toBe(6);
  expect(result.profile).toHaveLength(132);
  expect(result.profile?.slice(36, 40)).toEqual([97, 99, 115, 112]);
  // Unlike JPEG, these browser decoders report WebP's unrotated canvas size.
  // Preserve the source orientation without claiming a display transform here.
  expect(result.size).toEqual({ width: 3, height: 2 });
});
