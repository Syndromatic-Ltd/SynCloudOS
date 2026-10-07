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

import { describe, it, expect } from "vitest";
import { GFXColourProfile } from "../../../src/FX/GraphicsFX/public";
function profile(gamma = 2.2) {
    const names = ["rXYZ", "gXYZ", "bXYZ", "rTRC", "gTRC", "bTRC"], matrix = [[.4360747, .2225045, .0139322], [.3850649, .7168786, .0971045], [.1430804, .0606169, .7141733]], offset = 132 + names.length * 12, size = offset + 3 * 20 + 3 * 16, bytes = new Uint8Array(size), v = new DataView(bytes.buffer), text = (i: number, s: string) => {
        for (let n = 0; n < s.length; n++)
            bytes[i + n] = s.charCodeAt(n);
    };
    v.setUint32(0, size);
    bytes[8] = 4;
    text(12, "mntr");
    text(16, "RGB ");
    text(20, "XYZ ");
    text(36, "acsp");
    [.9642, 1, .8249].forEach((n, i) => v.setInt32(68 + i * 4, Math.round(n * 65536)));
    v.setUint32(128, names.length);
    let pos = offset;
    names.forEach((name, i) => {
        text(132 + i * 12, name);
        v.setUint32(136 + i * 12, pos);
        v.setUint32(140 + i * 12, i < 3 ? 20 : 16);
        if (i < 3) {
            text(pos, "XYZ ");
            matrix[i]!.forEach((n, j) => v.setInt32(pos + 8 + j * 4, Math.round(n * 65536)));
            pos += 20;
        }
        else {
            text(pos, "curv");
            v.setUint32(pos + 8, 1);
            v.setUint16(pos + 12, Math.round(gamma * 256));
            pos += 16;
        }
    });
    return bytes;
}
function lutProfile() {
    const names = ["rXYZ", "gXYZ", "bXYZ", "rTRC", "gTRC", "bTRC", "A2B0", "B2A0"], tagTableEnd = 132 + names.length * 12;
    const lutSize = 48 + 3 * 256 + 2 ** 3 * 3 + 3 * 256;
    const sizes = [20, 20, 20, 16, 16, 16, lutSize, lutSize], size = tagTableEnd + sizes.reduce((sum, value) => sum + value, 0);
    const bytes = new Uint8Array(size), view = new DataView(bytes.buffer), text = (offset: number, value: string) => {
        for (let index = 0; index < value.length; index++) bytes[offset + index] = value.charCodeAt(index);
    };
    view.setUint32(0, size); bytes[8] = 4; text(12, "mntr"); text(16, "RGB "); text(20, "XYZ "); text(36, "acsp");
    [.9642, 1, .8249].forEach((value, index) => view.setInt32(68 + index * 4, Math.round(value * 65536)));
    view.setUint32(128, names.length);
    const columns = [[.4360747, .2225045, .0139322], [.3850649, .7168786, .0971045], [.1430804, .0606169, .7141733]];
    let cursor = tagTableEnd;
    names.forEach((name, index) => {
        text(132 + index * 12, name); view.setUint32(136 + index * 12, cursor); view.setUint32(140 + index * 12, sizes[index]!);
        if (index < 3) {
            text(cursor, "XYZ "); columns[index]!.forEach((value, axis) => view.setInt32(cursor + 8 + axis * 4, Math.round(value * 65536)));
        } else if (index < 6) {
            text(cursor, "curv"); view.setUint32(cursor + 8, 1); view.setUint16(cursor + 12, 256);
        } else {
            text(cursor, "mft1"); bytes[cursor + 8] = 3; bytes[cursor + 9] = 3; bytes[cursor + 10] = 2;
            for (let axis = 0; axis < 9; axis++) view.setInt32(cursor + 12 + axis * 4, axis % 4 === 0 ? 65536 : 0);
            const input = cursor + 48, clut = input + 3 * 256, output = clut + 24;
            for (let channel = 0; channel < 3; channel++) for (let value = 0; value < 256; value++) {
                bytes[input + channel * 256 + value] = value; bytes[output + channel * 256 + value] = value;
            }
            const matrix = index === 6
                ? [.4360747, .3850649, .1430804, .2225045, .7168786, .0606169, .0139322, .0971045, .7141733]
                : [3.1338561, -1.6168667, -.4906146, -.9787684, 1.9161415, .0334540, .0719453, -.2289914, 1.4052427];
            for (let r = 0; r < 2; r++) for (let g = 0; g < 2; g++) for (let b = 0; b < 2; b++) {
                const source = [r, g, b], base = (((r * 2) + g) * 2 + b) * 3;
                for (let channel = 0; channel < 3; channel++) {
                    const value = matrix[channel * 3]! * source[0]! + matrix[channel * 3 + 1]! * source[1]! + matrix[channel * 3 + 2]! * source[2]!;
                    bytes[clut + base + channel] = Math.round(Math.max(0, Math.min(1, value)) * 255);
                }
            }
        }
        cursor += sizes[index]!;
    });
    return bytes;
}
describe("GraphicsFX bounded RGB ICC profiles", () => {
    it("converts matrix/TRC profile values to sRGB and back with explicit alpha", () => {
        const value = new GFXColourProfile(profile());
        const srgb = value.toSRGB({ r: .5, g: .5, b: .5, a: .25 });
        expect(srgb.r).toBeCloseTo(.503867, 3);
        expect(srgb.g).toBeCloseTo(srgb.r, 3);
        const roundtrip = value.fromSRGB(srgb);
        expect(roundtrip.r).toBeCloseTo(.5, 4);
        expect(roundtrip.a).toBe(.25);
        expect(value.version).toBe(4);
    });
    it("converts premultiplied profile pixels without transparent colour fringes", () => {
        const value = new GFXColourProfile(profile(1));
        const image = value.decodeImage({ width: 1, height: 1, alpha: "premultiplied", data: new Uint8Array([64, 64, 64, 128]) });
        expect(image.colourSpace).toBe("srgb");
        expect(image.pixel(0, 0).r).toBeCloseTo(.735, 2);
        expect(image.pixel(0, 0).a).toBe(128 / 255);
    });
    it("rejects missing tags, duplicate/overlapping storage, singular matrices and unknown spaces", () => {
        const bytes = profile();
        bytes[16] = 67;
        expect(() => new GFXColourProfile(bytes)).toThrow();
        const duplicate = profile();
        duplicate.set(duplicate.slice(132, 136), 144);
        expect(() => new GFXColourProfile(duplicate)).toThrow();
        const overlap = profile();
        new DataView(overlap.buffer).setUint32(148, 208);
        expect(() => new GFXColourProfile(overlap)).toThrow();
        const singular = profile();
        singular.fill(0, 212, 272);
        expect(() => new GFXColourProfile(singular)).toThrow();
        expect(() => new GFXColourProfile(profile(0))).toThrow();
    });
    it("executes a bounded paired LUT8 transform while preserving source profile bytes", () => {
        const bytes = lutProfile(), snapshot = bytes.slice(), value = new GFXColourProfile(bytes);
        const red = value.toSRGB({ r: 1, g: 0, b: 0, a: .5 });
        expect(red.r).toBeGreaterThan(.96);
        expect(red.g).toBeLessThan(.08);
        expect(red.b).toBeLessThan(.08);
        expect(red.a).toBe(.5);
        expect(bytes).toEqual(snapshot);
        expect(value.copyData()).toEqual(snapshot);
        const missingPair = lutProfile(), pairEntry = 132 + 7 * 12;
        missingPair.set([88, 88, 88, 88], pairEntry);
        expect(() => new GFXColourProfile(missingPair)).toThrow(/paired A2B0\/B2A0/i);
    });
});
function parametricProfile(kind: number, parameters: number[]) {
    const original = profile(), curveSize = 12 + parameters.length * 4, bytes = new Uint8Array(264 + curveSize * 3), view = new DataView(bytes.buffer);
    bytes.set(original.subarray(0, 264));
    view.setUint32(0, bytes.length);
    for (let i = 0; i < 3; i++) {
        const offset = 264 + i * curveSize;
        view.setUint32(136 + (i + 3) * 12, offset);
        view.setUint32(140 + (i + 3) * 12, curveSize);
        bytes.set([112, 97, 114, 97], offset);
        view.setUint16(offset + 8, kind);
        parameters.forEach((value, j) => view.setInt32(offset + 12 + j * 4, Math.round(value * 65536)));
    }
    return bytes;
}
describe("GraphicsFX ICC parametric curve coverage", () => {
    it("interprets each normalized parametric curve family and inverts the transform", () => {
        const parameters = [[1], [1, 1, 0], [1, 1, 0, 0], [1, 1, 0, 1, .5], [1, 1, 0, 1, .5, 0, 0]];
        for (let kind = 0; kind < 5; kind++) {
            const profile = new GFXColourProfile(parametricProfile(kind, parameters[kind]!));
            const srgb = profile.toSRGB({ r: .25, g: .5, b: .75, a: 1 });
            expect(srgb.r).toBeCloseTo(.537099, 3);
            expect(profile.fromSRGB(srgb).b).toBeCloseTo(.75, 4);
        }
    });
    it("rejects nonmonotonic parametric curves and unsupported LUT transforms", () => {
        expect(() => new GFXColourProfile(parametricProfile(3, [1, 1, 0, -1, .5]))).toThrow();
        const bytes = profile();
        bytes.set([65, 50, 66, 48], 132);
        expect(() => new GFXColourProfile(bytes)).toThrow("LUT");
    });
});
