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

import { IFXKernel } from "./kernels/IFXKernel";
import { IFXFilterRegistry } from "./IFXFilterRegistry";
import { GFXImage } from "../GraphicsFX/GFXImage";
import { GFXColour } from "../GraphicsFX/GFXColour";
import { intersectRects, unionRects, transformRect, normaliseRect, type GFXRect } from "../GraphicsFX/GFXGeometry";
import { IFXImage, imageNode } from "./IFXImage";
export interface IFXSerializedGraph {
    readonly version: 1;
    readonly nodes: readonly Readonly<Record<string, unknown>>[];
    readonly output: number;
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
        throw new TypeError("Graph data must contain plain records.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length !== keys.length || keys.some(key => !descriptors[key] || !("value" in descriptors[key]!)))
        throw new TypeError("Graph record shape is invalid.");
    return Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]));
}
function numericRecord(value: unknown, keys: readonly string[]): Record<string, number> {
    const r = record(value, keys);
    for (const v of Object.values(r))
        if (typeof v !== "number" || !Number.isFinite(v))
            throw new TypeError("Finite graph numbers required.");
    return r as Record<string, number>;
}
export class IFXFilterGraph {
    constructor(readonly output: IFXImage) {
        imageNode(output);
        Object.freeze(this);
    }
    regionsOfInterest(bounds: GFXRect): readonly Readonly<{
        image: IFXImage;
        region: GFXRect;
    }>[] {
        const regions = new Map<IFXImage, GFXRect>();
        let work = 0;
        const visit = (image: IFXImage, region: GFXRect, depth: number) => {
            if (++work > 4096 || depth > 128)
                throw new RangeError("ROI graph budget exceeded.");
            if (image.extent.kind === "finite") {
                const clipped = intersectRects(region, image.extent.rect);
                if (!clipped || clipped.width === 0 || clipped.height === 0)
                    return;
                region = clipped;
            }
            const node = imageNode(image);
            if (node.kind === "operation") {
                const regions = node.processor.regions(region);
                if (regions.length !== node.inputs.length)
                    throw new RangeError("Invalid processor ROI count.");
                node.inputs.forEach((input, index) => visit(input, normaliseRect(regions[index]!), depth + 1));
            }
            else if (node.kind === "pixels") {
                regions.set(image, regions.has(image) ? unionRects(regions.get(image)!, region) : region);
            }
            else if (node.kind === "crop")
                visit(node.input, region, depth + 1);
            else if (node.kind === "transform") {
                let r = transformRect(region, node.inverse);
                if (node.interpolation === "linear")
                    r = { x: r.x - 0.5, y: r.y - 0.5, width: r.width + 1, height: r.height + 1 };
                visit(node.input, r, depth + 1);
            }
            else if (node.kind === "over") {
                visit(node.foreground, region, depth + 1);
                visit(node.background, region, depth + 1);
            }
            else if (node.kind === "clamp" && node.input.extent.kind === "finite")
                visit(node.input, node.input.extent.rect, depth + 1);
        };
        visit(this.output, normaliseRect(bounds), 0);
        return Object.freeze([...regions].map(([image, region]) => Object.freeze({ image, region: Object.freeze(region) })));
    }
    serialize(): IFXSerializedGraph {
        const ids = new Map<IFXImage, number>(), nodes: Record<string, unknown>[] = [];
        let bytes = 0;
        const visit = (image: IFXImage, depth: number): number => {
            const found = ids.get(image);
            if (found !== undefined)
                return found;
            if (depth > 128 || nodes.length >= 1024)
                throw new RangeError("Serialized graph budget exceeded.");
            const node = imageNode(image);
            let data: Record<string, unknown>;
            if (node.kind === "operation") {
                data = { kind: "operation", name: node.processor.name, parameters: node.processor.parameters, inputs: node.inputs.map(input => visit(input, depth + 1)) };
            }
            else if (node.kind === "pixels") {
                const pixels = node.pixels;
                bytes += pixels.bytesPerRow * pixels.height;
                if (bytes > 4 * 1024 * 1024)
                    throw new RangeError("Serialized graph pixel budget exceeded.");
                data = { kind: "pixels", origin: node.origin, width: pixels.width, height: pixels.height, bytesPerRow: pixels.bytesPerRow, pixelFormat: pixels.pixelFormat, alpha: pixels.alpha, "colorSpace": pixels.colourSpace, data: Array.from(pixels.copyData()) };
            }
            else if (node.kind === "constant")
                data = { kind: "constant", components: node.colour.components, "colorSpace": node.colour.space };
            else if (node.kind === "over")
                data = { kind: "over", foreground: visit(node.foreground, depth + 1), background: visit(node.background, depth + 1) };
            else if (node.kind === "transform")
                data = { kind: "transform", input: visit(node.input, depth + 1), transform: node.transform, interpolation: node.interpolation };
            else if (node.kind === "crop")
                data = { kind: "crop", input: visit(node.input, depth + 1), rect: node.rect };
            else
                data = { kind: "clamp", input: visit(node.input, depth + 1) };
            const id = nodes.length;
            if (id >= 1024)
                throw new RangeError("Serialized graph node budget exceeded.");
            nodes.push(Object.freeze(data));
            ids.set(image, id);
            return id;
        };
        const output = visit(this.output, 0);
        return Object.freeze({ version: 1, nodes: Object.freeze(nodes), output });
    }
    static deserialize(value: unknown): IFXFilterGraph {
        const graph = record(value, ["version", "nodes", "output"]);
        if (graph.version !== 1 || !Array.isArray(graph.nodes) || Object.getPrototypeOf(graph.nodes) !== Array.prototype || graph.nodes.length < 1 || graph.nodes.length > 1024)
            throw new TypeError("Unsupported graph version or node list.");
        const images: IFXImage[] = [];
        let bytes = 0;
        const input = (value: unknown): IFXImage => {
            if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= images.length)
                throw new TypeError("Graph references must name earlier nodes.");
            return images[value as number]!;
        };
        for (let i = 0; i < graph.nodes.length; i++) {
            const property = Object.getOwnPropertyDescriptor(graph.nodes, String(i));
            if (!property || !("value" in property))
                throw new TypeError("Graph nodes must be data.");
            const raw = property.value;
            const kindDescriptor = raw && typeof raw === "object" ? Object.getOwnPropertyDescriptor(raw, "kind") : null;
            const kind = kindDescriptor && "value" in kindDescriptor ? kindDescriptor.value : null;
            let image: IFXImage;
            if (kind === "operation") {
                const n = record(raw, ["kind", "name", "parameters", "inputs"]);
                if (!Array.isArray(n.inputs) || n.inputs.length > 4 || Object.getPrototypeOf(n.inputs) !== Array.prototype)
                    throw new TypeError("Invalid processor inputs.");
                const inputs: IFXImage[] = [];
                for (let j = 0; j < n.inputs.length; j++) {
                    const d = Object.getOwnPropertyDescriptor(n.inputs, String(j));
                    if (!d || !("value" in d))
                        throw new TypeError("Processor references must be data.");
                    inputs.push(input(d.value));
                }
                image = n.name === "portableKernel" ? IFXKernel.deserialize(n.parameters).apply(...inputs) : new IFXFilterRegistry().create(n.name as never, n.parameters as never).apply(...inputs);
            }
            else if (kind === "pixels") {
                const n = record(raw, ["kind", "origin", "width", "height", "bytesPerRow", "pixelFormat", "alpha", "colorSpace", "data"]);
                if (!Array.isArray(n.data) || Object.getPrototypeOf(n.data) !== Array.prototype || n.data.length > 4 * 1024 * 1024 || (bytes += n.data.length) > 4 * 1024 * 1024)
                    throw new RangeError("Graph pixels exceed budget.");
                const data = new Uint8Array(n.data.length);
                for (let j = 0; j < data.length; j++) {
                    const d = Object.getOwnPropertyDescriptor(n.data, String(j));
                    if (!d || !("value" in d) || !Number.isInteger(d.value) || d.value < 0 || d.value > 255)
                        throw new TypeError("Graph pixels must be byte data.");
                    data[j] = d.value;
                }
                const origin = numericRecord(n.origin, ["x", "y"]);
                image = IFXImage.fromPixels(new GFXImage({ width: n.width as number, height: n.height as number, bytesPerRow: n.bytesPerRow as number, pixelFormat: n.pixelFormat as never, alpha: n.alpha as never, colourSpace: n.colorSpace as never, data }), { x: origin.x!, y: origin.y! });
            }
            else if (kind === "constant") {
                const n = record(raw, ["kind", "components", "colorSpace"]), c = numericRecord(n.components, ["r", "g", "b", "a"]);
                if (!["srgb", "linear-srgb", "display-p3", "grayscale"].includes(n.colorSpace as string))
                    throw new TypeError("Unknown graph colour space.");
                const colour = n.colorSpace === "linear-srgb" ? GFXColour.linearSRGB(c.r!, c.g!, c.b!, c.a!) : n.colorSpace === "display-p3" ? GFXColour.displayP3(c.r!, c.g!, c.b!, c.a!) : GFXColour.rgba(c.r!, c.g!, c.b!, c.a!);
                image = IFXImage.constant(colour);
            }
            else if (kind === "over") {
                const n = record(raw, ["kind", "foreground", "background"]);
                image = input(n.foreground).compositedOver(input(n.background));
            }
            else if (kind === "crop") {
                const n = record(raw, ["kind", "input", "rect"]), r = numericRecord(n.rect, ["x", "y", "width", "height"]);
                image = input(n.input).cropped({ x: r.x!, y: r.y!, width: r.width!, height: r.height! });
            }
            else if (kind === "transform") {
                const n = record(raw, ["kind", "input", "transform", "interpolation"]), t = numericRecord(n.transform, ["a", "b", "c", "d", "tx", "ty"]);
                image = input(n.input).transformed({ a: t.a!, b: t.b!, c: t.c!, d: t.d!, tx: t.tx!, ty: t.ty! }, n.interpolation as never);
            }
            else if (kind === "clamp") {
                const n = record(raw, ["kind", "input"]);
                image = input(n.input).clampedToExtent();
            }
            else
                throw new TypeError("Unknown portable graph operation.");
            images.push(image);
        }
        return new IFXFilterGraph(input(graph.output));
    }
}
