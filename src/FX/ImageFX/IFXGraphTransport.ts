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

import { GFXFloatImage } from "../GraphicsFX/GFXFloatImage";
import type { GFXPixelSampleFormat } from "../GraphicsFX/GFXPixelDescriptor";
import type { IFXFilterGraph } from "./IFXFilterGraph";
import { IFXFilterRegistry } from "./IFXFilterRegistry";
import type { IFXImage } from "./IFXImage";
import { buildIFXGraphNodes, decodeIFXGraphNodes, graphVersion, IFXGraphStructureBudgetError, type IFXGraphPixelSource } from "./IFXGraphNodes";

// Internal binary transport for local graph execution (worker backends).
//
// A transport plan is compiled once per immutable output image from graph
// metadata alone: node records, a table of distinct pixel backings and their
// formats/bytes. Backends decide eligibility and admission from the plan
// without touching pixel samples. Only an admitted submission materialises the
// payload, copying each distinct backing once into an owned ArrayBuffer that
// is then transferred; caller-visible GFXImage storage is never detached.
//
// The portable `IFXGraphCodec` form (numeric arrays, 4 MiB interchange limit)
// remains the persistence/debugging format and is not used on this path.

/** Default bound on distinct source pixel bytes carried by one transported job. */
export const IFX_DEFAULT_TRANSPORT_PIXEL_BYTES = 64 * 1024 * 1024;

/** Version 2/3 graph whose pixel nodes carry `data: ArrayBuffer`. */
export interface IFXTransportGraph {
    readonly version: 2 | 3;
    readonly nodes: readonly Readonly<Record<string, unknown>>[];
    readonly output: number;
}

export type IFXGraphTransportPlan =
    | Readonly<{ transportable: false; reason: "structure-budget" }>
    | Readonly<{
        transportable: true;
        version: 2 | 3;
        /** Node records; a pixel node's `data` is its index in `resources`. */
        nodes: readonly Readonly<Record<string, unknown>>[];
        output: number;
        /** Distinct pixel backings in first-use order. Shared backing is listed once. */
        resources: readonly IFXGraphPixelSource[];
        /** Sum of distinct backing bytes (row stride included). */
        pixelBytes: number;
        pixelFormats: readonly string[];
        sampleFormats: readonly GFXPixelSampleFormat[];
        customProcessors: number;
        /** Custom processors without a portable program; they cannot leave this realm. */
        localOnlyProcessors: number;
    }>;

export type IFXTransportableGraphPlan = Extract<IFXGraphTransportPlan, { transportable: true }>;

export interface IFXGraphTransport {
    readonly graph: IFXTransportGraph;
    readonly transfer: readonly ArrayBuffer[];
    readonly bytes: number;
}

export interface IFXGraphTransportDecodeOptions {
    readonly maximumPixelBytes?: number;
    readonly registry?: IFXFilterRegistry;
}

const plans = new WeakMap<IFXImage, IFXGraphTransportPlan>();

function compilePlan(image: IFXImage): IFXGraphTransportPlan {
    const resources: IFXGraphPixelSource[] = [];
    const resourceIndex = new Map<IFXGraphPixelSource, number>();
    const pixelFormats = new Set<string>();
    const sampleFormats = new Set<GFXPixelSampleFormat>();
    let pixelBytes = 0;
    let structure;
    try {
        structure = buildIFXGraphNodes(image, pixels => {
            pixelFormats.add(pixels.pixelFormat);
            sampleFormats.add(pixels instanceof GFXFloatImage ? pixels.sampleFormat : "unorm8");
            let index = resourceIndex.get(pixels);
            if (index === undefined) {
                index = resources.length;
                resources.push(pixels);
                resourceIndex.set(pixels, index);
                pixelBytes += pixels.bytesPerRow * pixels.height;
            }
            return index;
        });
    } catch (error) {
        if (error instanceof IFXGraphStructureBudgetError)
            return Object.freeze({ transportable: false, reason: "structure-budget" });
        throw error;
    }
    let customProcessors = 0, localOnlyProcessors = 0;
    for (const node of structure.nodes) {
        if (node.kind !== "operation") continue;
        const processor = node.processor as Readonly<Record<string, unknown>>;
        if (processor.kind !== "custom") continue;
        customProcessors += 1;
        if (!Object.prototype.hasOwnProperty.call(processor, "program")) localOnlyProcessors += 1;
    }
    return Object.freeze({
        transportable: true,
        version: structure.version,
        nodes: structure.nodes,
        output: structure.output,
        resources: Object.freeze(resources),
        pixelBytes,
        pixelFormats: Object.freeze([...pixelFormats]),
        sampleFormats: Object.freeze([...sampleFormats]),
        customProcessors,
        localOnlyProcessors,
    });
}

/** Metadata-only transport plan for an authentic graph, compiled once per
 * immutable output image. Never reads pixel samples. */
export function planIFXGraphTransport(image: IFXImage): IFXGraphTransportPlan {
    const cached = plans.get(image);
    if (cached) return cached;
    const plan = compilePlan(image);
    plans.set(image, plan);
    return plan;
}

function ownedBuffer(pixels: IFXGraphPixelSource): ArrayBuffer {
    const view = pixels.copyData();
    const buffer = view.buffer as ArrayBuffer;
    return view.byteOffset === 0 && view.byteLength === buffer.byteLength
        ? buffer
        : buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

/** Copies each distinct backing of an admitted plan once into an owned,
 * transferable ArrayBuffer. */
export function materializeIFXGraphTransport(plan: IFXGraphTransportPlan): IFXGraphTransport {
    if (!plan.transportable) throw new DOMException("This ImageFX graph exceeds the transport structure budget.", "NotSupportedError");
    const buffers = plan.resources.map(ownedBuffer);
    const nodes = plan.nodes.map(node => node.kind === "pixels" ? Object.freeze({ ...node, data: buffers[node.data as number] }) : node);
    return Object.freeze({
        graph: Object.freeze({ version: plan.version, nodes: Object.freeze(nodes), output: plan.output }),
        transfer: Object.freeze(buffers),
        bytes: buffers.reduce((total, buffer) => total + buffer.byteLength, 0),
    });
}

function boundedBytes(value: number | undefined): number {
    const selected = value ?? IFX_DEFAULT_TRANSPORT_PIXEL_BYTES;
    if (!Number.isSafeInteger(selected) || selected < 1)
        throw new RangeError("Transport pixel budget must be a positive safe integer.");
    return selected;
}

/** Reconstructs a transported graph over its received buffers. Typed views
 * enforce sample domains, so no per-sample boxing or descriptor walk occurs;
 * image constructors still validate extents, strides and float finiteness. */
export function decodeIFXGraphTransport(value: unknown, options: IFXGraphTransportDecodeOptions = {}): IFXFilterGraph {
    const version = graphVersion(value);
    if (version !== 2 && version !== 3)
        throw new TypeError("Image worker graph is invalid.");
    const maximum = boundedBytes(options.maximumPixelBytes);
    const registry = options.registry ?? new IFXFilterRegistry();
    const received = new Set<ArrayBuffer>();
    let bytes = 0;
    return decodeIFXGraphNodes(registry, version, value, (node, sampleFormat) => {
        const data = node.data;
        if (!(data instanceof ArrayBuffer)) throw new TypeError("Transferred image pixels must own an ArrayBuffer.");
        if (data.byteLength === 0) throw new TypeError("Transferred image pixel storage is detached.");
        if (!received.has(data)) {
            received.add(data);
            bytes += data.byteLength;
            if (bytes > maximum) throw new RangeError("Transferred image pixels exceed budget.");
        }
        if (sampleFormat === "float32") {
            if (data.byteLength % 4) throw new RangeError("Transferred float32 pixels are misaligned.");
            return new Float32Array(data);
        }
        if (sampleFormat === "float16") {
            if (data.byteLength % 2) throw new RangeError("Transferred float16 pixels are misaligned.");
            return new Uint16Array(data);
        }
        return new Uint8Array(data);
    });
}
