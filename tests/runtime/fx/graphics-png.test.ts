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

import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { encodeImagePNG } from "../../../src/FX/GraphicsFX/imagePNG";
describe("GraphicsFX generated PNG pixel data", () => {
    it("emits valid PNG chunks, CRCs and independently decoded RGBA scanlines", () => {
        const image = new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]) });
        const bytes = encodeImagePNG(image);
        expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        const view = new DataView(bytes.buffer);
        const names: string[] = [];
        for (let offset = 8; offset < bytes.length;) {
            const length = view.getUint32(offset), name = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
            names.push(name);
            const contents = bytes.slice(offset + 8, offset + 8 + length);
            let crc = 0xffffffff;
            for (const byte of bytes.slice(offset + 4, offset + 8 + length)) {
                crc ^= byte;
                for (let bit = 0; bit < 8; bit++)
                    crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
            }
            expect(view.getUint32(offset + 8 + length)).toBe((crc ^ 0xffffffff) >>> 0);
            if (name === "IDAT")
                expect([...inflateSync(contents)]).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 128]);
            offset += length + 12;
        }
        expect(names).toEqual(["IHDR", "sRGB", "IDAT", "IEND"]);
    });
    it("crosses DEFLATE block boundaries without changing scanline pixels", () => {
        const data = new Uint8Array(256 * 128 * 4);
        for (let i = 0; i < data.length; i++)
            data[i] = i % 251;
        const image = new GFXImage({ width: 256, height: 128, alpha: "straight", colourSpace: "srgb", data });
        const png = encodeImagePNG(image), view = new DataView(png.buffer);
        for (let offset = 8; offset < png.length;) {
            const length = view.getUint32(offset);
            if (new TextDecoder().decode(png.slice(offset + 4, offset + 8)) === "IDAT") {
                const decoded = inflateSync(png.slice(offset + 8, offset + 8 + length));
                expect(decoded.length).toBe(128 * (256 * 4 + 1));
                expect([...decoded.slice(1, 257)]).toEqual([...data.slice(0, 256)]);
                expect([...decoded.slice(decoded.length - 256)]).toEqual([...data.slice(data.length - 256)]);
            }
            offset += length + 12;
        }
    });
});
