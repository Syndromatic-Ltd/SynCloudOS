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

import { GFXColour } from "../GraphicsFX/GFXColour";
import { GFXImage } from "../GraphicsFX/GFXImage";
import { GFXFloatImage, type GFXFloatSampleFormat } from "../GraphicsFX/GFXFloatImage";
import { IFXFilterGraph } from "./IFXFilterGraph";
import type { IFXFilterRegistry } from "./IFXFilterRegistry";
import { IFXImage, imageNode } from "./IFXImage";
import { IFXKernel } from "./kernels/IFXKernel";
import { applyIFXProcessorPortableProgram, parseIFXProcessorWireName } from "./IFXProcessorDefinition";

// Graph structure shared by the portable interchange codec and the internal
// binary worker transport. Both use the same node records and ordering; they
// differ only in how a pixel node carries its samples (numeric array versus an
// owned ArrayBuffer). Not part of the public ImageFX entry.

export type IFXGraphPixelSource = GFXImage | GFXFloatImage;
export type IFXGraphPixelStorage = Uint8Array | Float32Array | Uint16Array;

export interface IFXGraphNodeStructure {
    readonly version: 2 | 3;
    readonly nodes: readonly Readonly<Record<string, unknown>>[];
    readonly output: number;
}

export const IFX_GRAPH_MAXIMUM_NODES = 1024;
export const IFX_GRAPH_MAXIMUM_DEPTH = 128;

/** A graph exceeds the structural node/depth budget of the portable forms. The
 * graph is still valid for direct CPU rendering. */
export class IFXGraphStructureBudgetError extends RangeError {
    constructor(message: string) {
        super(message);
        this.name = "RangeError";
    }
}

export function graphRecord(value: unknown, keys: readonly string[], message = "Graph record shape is invalid."): Record<string, unknown> {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
        throw new TypeError(message);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length !== keys.length || keys.some(key => !descriptors[key] || !("value" in descriptors[key]!)))
        throw new TypeError(message);
    return Object.fromEntries(keys.map(key => [key, (descriptors[key] as PropertyDescriptor & { value: unknown }).value]));
}

function numericRecord(value: unknown, keys: readonly string[]): Record<string, number> {
    const result = graphRecord(value, keys);
    for (const entry of Object.values(result))
        if (typeof entry !== "number" || !Number.isFinite(entry))
            throw new TypeError("Finite graph numbers required.");
    return result as Record<string, number>;
}

export function graphArrayData(value: unknown, maximum: number, message: string): readonly unknown[] {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum)
        throw new TypeError(message);
    for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor))
            throw new TypeError(message);
    }
    return value;
}

export function graphVersion(value: unknown): unknown {
    if (!value || typeof value !== "object")
        throw new TypeError("Graph data must be an object.");
    const descriptor = Object.getOwnPropertyDescriptor(value, "version");
    if (!descriptor || !("value" in descriptor))
        throw new TypeError("Graph version must be plain data.");
    return descriptor.value;
}

function processorDescriptor(name: unknown, portableProgram?: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    if (typeof name !== "string")
        throw new TypeError("Processor name must be a string.");
    if (name === "portableKernel")
        return Object.freeze({ kind: "kernel", version: 1 });
    const custom = parseIFXProcessorWireName(name);
    if (custom)
        return Object.freeze({ kind: "custom", id: custom.id, version: custom.version, ...(portableProgram ? { program: portableProgram } : {}) });
    return Object.freeze({ kind: "builtin", name, version: 1 });
}

/**
 * Builds portable node records for an authentic graph in dependency order
 * (inputs before consumers; a node shared by several consumers appears once).
 * `pixelData` supplies each pixel node's `data` field and is invoked once per
 * distinct pixel node, in node order. Structural budgets throw RangeError.
 */
export function buildIFXGraphNodes(output: IFXImage, pixelData: (pixels: IFXGraphPixelSource) => unknown): IFXGraphNodeStructure {
    const ids = new Map<IFXImage, number>();
    const nodes: Readonly<Record<string, unknown>>[] = [];
    let float = false;
    const visit = (image: IFXImage, depth: number): number => {
        const found = ids.get(image);
        if (found !== undefined)
            return found;
        if (depth > IFX_GRAPH_MAXIMUM_DEPTH || nodes.length >= IFX_GRAPH_MAXIMUM_NODES)
            throw new IFXGraphStructureBudgetError("Serialized graph budget exceeded.");
        const node = imageNode(image);
        let data: Record<string, unknown>;
        if (node.kind === "operation") {
            const inputs = node.inputs.map(input => visit(input, depth + 1));
            data = { kind: "operation", processor: processorDescriptor(node.processor.name, node.processor.portableProgram), parameters: node.processor.parameters, inputs };
        }
        else if (node.kind === "pixels") {
            const pixels = node.pixels;
            data = { kind: "pixels", origin: node.origin, width: pixels.width, height: pixels.height, bytesPerRow: pixels.bytesPerRow, pixelFormat: pixels.pixelFormat, alpha: pixels.alpha, colorSpace: pixels.colourSpace, data: pixelData(pixels) };
            if (pixels instanceof GFXFloatImage) {
                data.sampleFormat = pixels.sampleFormat;
                float = true;
            }
        }
        else if (node.kind === "constant")
            data = { kind: "constant", components: node.colour.components, colorSpace: node.colour.space };
        else if (node.kind === "over") {
            const foreground = visit(node.foreground, depth + 1);
            data = { kind: "over", foreground, background: visit(node.background, depth + 1) };
        }
        else if (node.kind === "transform")
            data = { kind: "transform", input: visit(node.input, depth + 1), transform: node.transform, interpolation: node.interpolation };
        else if (node.kind === "crop")
            data = { kind: "crop", input: visit(node.input, depth + 1), rect: node.rect };
        else
            data = { kind: "clamp", input: visit(node.input, depth + 1) };
        const id = nodes.length;
        if (id >= IFX_GRAPH_MAXIMUM_NODES)
            throw new IFXGraphStructureBudgetError("Serialized graph node budget exceeded.");
        nodes.push(Object.freeze(data));
        ids.set(image, id);
        return id;
    };
    const root = visit(output, 0);
    return Object.freeze({ version: float ? 3 : 2, nodes: Object.freeze(nodes), output: root });
}

/**
 * Decodes the typed samples of one pixel node. `node` has already passed the
 * shared field-set validation; the decoder validates and bounds `node.data`
 * for its representation and returns storage matching `sampleFormat`
 * (bytes when null).
 */
export type IFXGraphPixelDecoder = (node: Readonly<Record<string, unknown>>, sampleFormat: GFXFloatSampleFormat | null) => IFXGraphPixelStorage;

const bytePixelKeys = ["kind", "origin", "width", "height", "bytesPerRow", "pixelFormat", "alpha", "colorSpace", "data"] as const;
const floatPixelKeys = [...bytePixelKeys, "sampleFormat"] as const;

/** Reconstructs an authentic graph from version 2/3 node records. */
export function decodeIFXGraphNodes(registry: IFXFilterRegistry, version: 2 | 3, value: unknown, decodePixels: IFXGraphPixelDecoder): IFXFilterGraph {
    const graph = graphRecord(value, ["version", "nodes", "output"], "Graph shape or field set is invalid.");
    const nodes = graphArrayData(graph.nodes, IFX_GRAPH_MAXIMUM_NODES, "Graph node list must contain plain data.");
    if (nodes.length < 1)
        throw new TypeError("Graph node list must not be empty.");
    const images: IFXImage[] = [];
    const input = (reference: unknown): IFXImage => {
        if (!Number.isSafeInteger(reference) || (reference as number) < 0 || (reference as number) >= images.length)
            throw new TypeError("Graph references must name earlier nodes.");
        return images[reference as number]!;
    };
    const inputs = (value: unknown): readonly IFXImage[] => {
        const references = graphArrayData(value, 4, "Processor references must be data.");
        return references.map(reference => input(reference));
    };
    for (let index = 0; index < nodes.length; index++) {
        const raw = nodes[index];
        const kindDescriptor = raw && typeof raw === "object" ? Object.getOwnPropertyDescriptor(raw, "kind") : null;
        const kind = kindDescriptor && "value" in kindDescriptor ? kindDescriptor.value : null;
        let image: IFXImage;
        if (kind === "operation") {
            const node = graphRecord(raw, ["kind", "processor", "parameters", "inputs"]);
            const processorKind = node.processor && typeof node.processor === "object" ? Object.getOwnPropertyDescriptor(node.processor, "kind") : null;
            const tag = processorKind && "value" in processorKind ? processorKind.value : null;
            const processorInputs = inputs(node.inputs);
            if (tag === "kernel") {
                const processor = graphRecord(node.processor, ["kind", "version"]);
                if (processor.version !== 1)
                    throw new TypeError("Unsupported portable kernel version.");
                image = IFXKernel.deserialize(node.parameters).apply(...processorInputs);
            }
            else if (tag === "builtin") {
                const processor = graphRecord(node.processor, ["kind", "name", "version"]);
                if (processor.version !== 1 || typeof processor.name !== "string")
                    throw new TypeError("Unsupported built-in processor version.");
                image = registry.create(processor.name as never, node.parameters as never).apply(...processorInputs);
            }
            else if (tag === "custom") {
                const hasProgram = !!node.processor && typeof node.processor === "object" && !!Object.getOwnPropertyDescriptor(node.processor, "program");
                const processor = graphRecord(node.processor, hasProgram ? ["kind", "id", "version", "program"] : ["kind", "id", "version"]);
                if (typeof processor.id !== "string" || !Number.isSafeInteger(processor.version))
                    throw new TypeError("Custom processor identity/version is invalid.");
                image = hasProgram
                    ? applyIFXProcessorPortableProgram(processor.program, node.parameters, ...processorInputs)
                    : registry.processor(processor.id, processor.version as number).apply(node.parameters, ...processorInputs);
            }
            else
                throw new TypeError("Unknown graph processor kind.");
        }
        else if (kind === "pixels") {
            const float = version === 3 && Object.getOwnPropertyDescriptor(raw, "sampleFormat") !== undefined;
            const node = graphRecord(raw, float ? floatPixelKeys : bytePixelKeys);
            const origin = numericRecord(node.origin, ["x", "y"]);
            if (float) {
                if (node.pixelFormat !== "rgba-float" || !["float16", "float32"].includes(node.sampleFormat as string))
                    throw new TypeError("Graph float format is invalid.");
                const data = decodePixels(node, node.sampleFormat as GFXFloatSampleFormat) as Float32Array | Uint16Array;
                image = IFXImage.fromPixels(new GFXFloatImage({
                    width: node.width as number, height: node.height as number, sampleFormat: node.sampleFormat as GFXFloatSampleFormat,
                    alpha: node.alpha as never, colourSpace: node.colorSpace as never, data,
                }), { x: origin.x!, y: origin.y! });
                const decoded = imageNode(image);
                if (decoded.kind !== "pixels" || decoded.pixels.bytesPerRow !== node.bytesPerRow)
                    throw new TypeError("Graph float stride is invalid.");
            } else {
                if (node.pixelFormat === "rgba-float") throw new TypeError("Float graph pixels require version 3 sample format.");
                image = IFXImage.fromPixels(new GFXImage({
                    width: node.width as number, height: node.height as number, bytesPerRow: node.bytesPerRow as number,
                    pixelFormat: node.pixelFormat as never, alpha: node.alpha as never,
                    colourSpace: node.colorSpace as never, data: decodePixels(node, null) as Uint8Array,
                }), { x: origin.x!, y: origin.y! });
            }
        }
        else if (kind === "constant") {
            const node = graphRecord(raw, ["kind", "components", "colorSpace"]);
            const components = numericRecord(node.components, ["r", "g", "b", "a"]);
            if (!["srgb", "linear-srgb", "display-p3", "grayscale"].includes(node.colorSpace as string))
                throw new TypeError("Unknown graph colour space.");
            const colour = node.colorSpace === "linear-srgb"
                ? GFXColour.linearSRGB(components.r!, components.g!, components.b!, components.a!)
                : node.colorSpace === "display-p3"
                    ? GFXColour.displayP3(components.r!, components.g!, components.b!, components.a!)
                    : GFXColour.rgba(components.r!, components.g!, components.b!, components.a!);
            image = IFXImage.constant(colour);
        }
        else if (kind === "over") {
            const node = graphRecord(raw, ["kind", "foreground", "background"]);
            image = input(node.foreground).compositedOver(input(node.background));
        }
        else if (kind === "crop") {
            const node = graphRecord(raw, ["kind", "input", "rect"]);
            const rect = numericRecord(node.rect, ["x", "y", "width", "height"]);
            image = input(node.input).cropped({ x: rect.x!, y: rect.y!, width: rect.width!, height: rect.height! });
        }
        else if (kind === "transform") {
            const node = graphRecord(raw, ["kind", "input", "transform", "interpolation"]);
            const transform = numericRecord(node.transform, ["a", "b", "c", "d", "tx", "ty"]);
            image = input(node.input).transformed({
                a: transform.a!, b: transform.b!, c: transform.c!, d: transform.d!, tx: transform.tx!, ty: transform.ty!,
            }, node.interpolation as never);
        }
        else if (kind === "clamp") {
            const node = graphRecord(raw, ["kind", "input"]);
            image = input(node.input).clampedToExtent();
        }
        else
            throw new TypeError("Unknown portable graph operation.");
        images.push(image);
    }
    if (!Number.isSafeInteger(graph.output) || (graph.output as number) < 0 || (graph.output as number) >= images.length)
        throw new TypeError("Graph output reference is invalid.");
    return new IFXFilterGraph(images[graph.output as number]!);
}
