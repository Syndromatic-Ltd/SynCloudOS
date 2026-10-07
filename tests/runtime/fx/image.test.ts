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
import { GFXImage, GFXColour } from "../../../src/FX/GraphicsFX/public";
import { IFXImage, IFXContext, IFXRenderDestination, IFXFilterGraph, IFXImageAccumulator, IFXSampler } from "../../../src/FX/ImageFX/public";
const red = () => new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 128]) });
describe("ImageFX graph and rendering", () => {
    it("composites shared nodes in premultiplied working space and caches samples", async () => {
        const image = IFXImage.fromPixels(red());
        const context = new IFXContext();
        const result = await context.render(image.compositedOver(image));
        expect(result.image.pixel(0, 0).r).toBe(1);
        expect(result.image.pixel(0, 0).a).toBeCloseTo(192 / 255, 5);
        expect(result.info.cacheHits).toBeGreaterThan(0);
        context.dispose();
    });
    it("renders transformed nonzero extents, crops infinite colour and propagates ROI", async () => {
        const source = IFXImage.fromPixels(red()).transformed({ a: 1, b: 0, c: 0, d: 1, tx: 3, ty: 4 });
        expect(source.extent).toEqual({ kind: "finite", rect: { x: 3, y: 4, width: 1, height: 1 } });
        const context = new IFXContext();
        expect((await context.render(source)).image.pixel(0, 0).r).toBe(1);
        const infinite = IFXImage.constant(GFXColour.rgba(0, 1, 0));
        expect(() => new IFXRenderDestination(infinite.extent)).toThrow();
        expect((await context.render(infinite.cropped({ x: -1, y: 0, width: 2, height: 1 }))).image.pixel(1, 0).g).toBe(1);
        expect(new IFXFilterGraph(source).regionsOfInterest({ x: 3, y: 4, width: 1, height: 1 })[0]?.region).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });
    it("rejects stale, canceled and disposed tasks without publishing", async () => {
        const context = new IFXContext();
        const image = IFXImage.constant(GFXColour.rgba(1, 0, 0)).cropped({ x: 0, y: 0, width: 2, height: 2 });
        const dest = new IFXRenderDestination(image.extent);
        const old = context.startTask(image, dest);
        const next = context.startTask(image, dest);
        await expect(old.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
        await next.waitUntilCompleted();
        const task = context.startTask(image, dest);
        task.cancel();
        await expect(task.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
        context.dispose();
        expect(() => context.startTask(image, dest)).toThrow();
    });
    it("round trips a data-only graph and rejects forward references and unknown fields", async () => {
        const graph = new IFXFilterGraph(IFXImage.fromPixels(red()).cropped({ x: 0, y: 0, width: 1, height: 1 }));
        const data = graph.serialize();
        const copy = IFXFilterGraph.deserialize(data);
        expect((await new IFXContext().render(copy.output)).image.pixel(0, 0)).toEqual(red().pixel(0, 0));
        expect(() => IFXFilterGraph.deserialize({ ...data, run: () => null })).toThrow();
        const malformed = JSON.parse(JSON.stringify(data));
        malformed.nodes[1].input = 1;
        expect(() => IFXFilterGraph.deserialize(malformed)).toThrow();
    });
    it("updates only dirty accumulator pixels and preserves old snapshots", async () => {
        const accumulator = new IFXImageAccumulator({ x: 0, y: 0, width: 2, height: 1 });
        const context = new IFXContext();
        const before = accumulator.image;
        await accumulator.update(IFXImage.constant(GFXColour.rgba(0, 1, 0)), context, { x: 1, y: 0, width: 1, height: 1 });
        expect((await context.render(before)).image.pixel(1, 0).a).toBe(0);
        const output = (await context.render(accumulator.image)).image;
        expect(output.pixel(0, 0).a).toBe(0);
        expect(output.pixel(1, 0).g).toBe(1);
        accumulator.dispose();
        expect(() => accumulator.image).toThrow();
    });
});
describe("ImageFX numerical and failure boundaries", () => {
    it("interpolates in linear working space and avoids transparent colour halos", async () => {
        const pixels = new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]) });
        const image = IFXImage.fromPixels(pixels);
        expect(new IFXSampler(image).sample({ x: 1, y: .5 }).r).toBeCloseTo(.5, 6);
        const output = await new IFXContext().render(image.transformed({ a: .5, b: 0, c: 0, d: 1, tx: 0, ty: 0 }));
        expect(output.image.pixel(0, 0).r).toBeCloseTo(188 / 255, 6);
        const edge = new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 0, 0, 0, 255, 255]) });
        expect(new IFXSampler(IFXImage.fromPixels(edge)).sample({ x: 1, y: .5 })).toEqual({ r: 0, g: 0, b: .5, a: .5 });
    });
    it("bounds graph work and leaves prior destination pixels intact", async () => {
        const image = IFXImage.constant(GFXColour.rgba(1, 0, 0)).cropped({ x: 0, y: 0, width: 2, height: 1 });
        const dest = new IFXRenderDestination(image.extent);
        await new IFXContext().render(image, dest);
        const before = dest.image;
        await expect(new IFXContext("linear-srgb", 1).render(image, dest)).rejects.toThrow("budget");
        expect(dest.image).toBe(before);
        expect(() => image.transformed({ a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 })).toThrow();
        expect(() => image.cropped({ x: Infinity, y: 0, width: 1, height: 1 })).toThrow();
    });
    it("does not execute serialized graph accessors", () => {
        let calls = 0;
        const value = { version: 1, nodes: [], get output() {
                calls++;
                return 0;
            } };
        expect(() => IFXFilterGraph.deserialize(value)).toThrow();
        expect(calls).toBe(0);
    });
    it("cancels between bounded row batches without publishing pixels", async () => {
        const image = IFXImage.constant(GFXColour.rgba(1, 0, 0)).cropped({ x: 0, y: 0, width: 2, height: 40 });
        const dest = new IFXRenderDestination(image.extent), task = new IFXContext().startTask(image, dest);
        setTimeout(() => task.cancel(), 0);
        await expect(task.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
        expect(dest.image).toBeNull();
    });
});
