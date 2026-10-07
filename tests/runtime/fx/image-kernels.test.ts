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
import { GFXImage } from "../../../src/FX/GraphicsFX/public";
import { IFXImage, IFXSampler, IFXKernel, IFXColourKernel, IFXWarpKernel, IFXBlendKernel, IFXFilterGraph, IFXFilterRegistry } from "../../../src/FX/ImageFX/public";
const image = IFXImage.fromPixels(new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]) }));
describe("ImageFX bounded portable programs", () => {
    it("executes a colour program and serializes data rather than executable callbacks", () => {
        const kernel = new IFXColourKernel([{ op: "sample", input: 0 }, { op: "constant", value: [1, 1, 1, 2] }, { op: "subtract", left: 1, right: 0 }], 2);
        const output = kernel.apply(image);
        expect(new IFXSampler(output).sample({ x: .5, y: .5 })).toEqual({ r: 0, g: 1, b: 1, a: 1 });
        const restored = IFXFilterGraph.deserialize(new IFXFilterGraph(output).serialize());
        expect(new IFXSampler(restored.output).sample({ x: .5, y: .5 }).g).toBe(1);
    });
    it("bounds a warp displacement and calculates conservative source ROI", () => {
        const kernel = new IFXWarpKernel([{ op: "constant", value: [1, 0, 0, 0] }], 0, 1);
        const output = kernel.apply(image);
        expect(new IFXSampler(output).sample({ x: .5, y: .5 }).b).toBe(1);
        expect(new IFXFilterGraph(output).regionsOfInterest({ x: 0, y: 0, width: 1, height: 1 })[0]?.region.width).toBe(2);
        const invalid = new IFXWarpKernel([{ op: "constant", value: [2, 0, 0, 0] }], 0, 1);
        expect(() => new IFXSampler(invalid.apply(image)).sample({ x: .5, y: .5 })).toThrow("displacement");
    });
    it("evaluates a two-input blend and rejects wrong input count or invalid registers", () => {
        const kernel = new IFXBlendKernel([{ op: "sample", input: 0 }, { op: "sample", input: 1 }, { op: "mix", left: 0, right: 1, amount: .5 }], 2);
        expect(new IFXSampler(kernel.apply(image, image)).sample({ x: .5, y: .5 }).r).toBe(1);
        expect(() => kernel.apply(image)).toThrow();
        expect(() => new IFXColourKernel([{ op: "add", left: 0, right: 0 }], 0)).toThrow();
        expect(() => new IFXColourKernel([{ op: "sample", input: 0, offset: { x: 1, y: 0 } }], 0)).toThrow();
    });
    it("rejects executable programs, unknown opcodes and excessive register work", () => {
        expect(() => new IFXKernel({ inputCount: 1, instructions: [{ op: "evaluate", run: () => null }], output: 0 } as never)).toThrow();
        expect(() => new IFXKernel({ inputCount: 1, instructions: Array.from({ length: 129 }, () => ({ op: "sample", input: 0 })), output: 0 })).toThrow();
        let calls = 0;
        const program = { inputCount: 1, instructions: [], get output() {
                calls++;
                return 0;
            } };
        expect(() => IFXKernel.deserialize(program)).toThrow();
        expect(calls).toBe(0);
    });
    it("registers reviewed portable data programs without overwriting built-in filters", () => {
        const registry = new IFXFilterRegistry(), kernel = new IFXColourKernel([{ op: "sample", input: 0 }], 0);
        registry.register("custom:pixel", kernel);
        expect(registry.custom("custom:pixel")).toBe(kernel);
        expect(() => registry.register("custom:pixel", kernel)).toThrow();
        expect(() => registry.register("invert", kernel)).toThrow();
    });
});
