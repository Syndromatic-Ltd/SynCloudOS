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

import type { GFXImage } from "./GFXImage";
import { GFXColour } from "./GFXColour";
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++)
        value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes)
        crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name: string, data: Uint8Array): Uint8Array {
    const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++)
        bytes[i + 4] = name.charCodeAt(i);
    bytes.set(data, 8);
    view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
    return bytes;
}
/** Portable RGBA8 PNG encoder using bounded, uncompressed DEFLATE blocks. */
export function encodeImagePNG(image: GFXImage): Uint8Array {
    if (image.width * image.height > 1048576)
        throw new RangeError("PNG export exceeds the one-megapixel work limit.");
    const row = image.width * 4 + 1, raw = new Uint8Array(row * image.height);
    for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
            const pixel = image.pixel(x, y);
            const value = (image.colourSpace === "display-p3" ? GFXColour.displayP3(pixel.r, pixel.g, pixel.b, pixel.a) : image.colourSpace === "linear-srgb" ? GFXColour.linearSRGB(pixel.r, pixel.g, pixel.b, pixel.a) : GFXColour.rgba(pixel.r, pixel.g, pixel.b, pixel.a)).converting("srgb").components;
            const i = y * row + 1 + x * 4;
            raw[i] = Math.round(value.r * 255);
            raw[i + 1] = Math.round(value.g * 255);
            raw[i + 2] = Math.round(value.b * 255);
            raw[i + 3] = Math.round(value.a * 255);
        }
    const blockCount = Math.ceil(raw.length / 65535), deflate = new Uint8Array(2 + raw.length + blockCount * 5 + 4);
    deflate[0] = 0x78;
    deflate[1] = 0x01;
    let output = 2;
    for (let offset = 0; offset < raw.length; offset += 65535) {
        const length = Math.min(65535, raw.length - offset);
        deflate[output++] = offset + length === raw.length ? 1 : 0;
        deflate[output++] = length & 255;
        deflate[output++] = length >>> 8;
        deflate[output++] = (~length) & 255;
        deflate[output++] = ((~length) >>> 8) & 255;
        deflate.set(raw.subarray(offset, offset + length), output);
        output += length;
    }
    let a = 1, b = 0;
    for (const byte of raw) {
        a = (a + byte) % 65521;
        b = (b + a) % 65521;
    }
    new DataView(deflate.buffer).setUint32(output, ((b << 16) | a) >>> 0);
    const header = new Uint8Array(13), view = new DataView(header.buffer);
    view.setUint32(0, image.width);
    view.setUint32(4, image.height);
    header[8] = 8;
    header[9] = 6;
    const chunks = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("sRGB", new Uint8Array([0])), chunk("IDAT", deflate), chunk("IEND", new Uint8Array())];
    const result = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let cursor = 0;
    for (const value of chunks) {
        result.set(value, cursor);
        cursor += value.length;
    }
    return result;
}
export function imagePNGDataURL(image: GFXImage): string {
    const bytes = encodeImagePNG(image);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return `data:image/png;base64,${btoa(binary)}`;
}
