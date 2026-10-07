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

import { IFXFilterGraph, type IFXSerializedGraph } from "./IFXFilterGraph";
import { IFXFilterRegistry } from "./IFXFilterRegistry";
import { buildIFXGraphNodes, decodeIFXGraphNodes, graphArrayData, graphVersion } from "./IFXGraphNodes";

export interface IFXSerializedGraphV2 {
    readonly version: 2;
    readonly nodes: readonly Readonly<Record<string, unknown>>[];
    readonly output: number;
}
export interface IFXSerializedGraphV3 {
    readonly version: 3;
    readonly nodes: readonly Readonly<Record<string, unknown>>[];
    readonly output: number;
}
export type IFXPortableGraph = IFXSerializedGraphV2 | IFXSerializedGraphV3;

/** Total source samples a portable interchange document may carry. */
const portablePixelBudgetBytes = 4 * 1024 * 1024;

/**
 * Portable interchange for persistence, debugging and cross-version exchange.
 * Pixels are plain numeric arrays so a graph survives JSON. This is not the
 * local execution representation: workers receive the binary transport in
 * `IFXGraphTransport`, which carries typed buffers and has its own job budget.
 */
export class IFXGraphCodec {
    constructor(readonly registry: IFXFilterRegistry = new IFXFilterRegistry()) {
        if (!(registry instanceof IFXFilterRegistry))
            throw new TypeError("IFXFilterRegistry required.");
        Object.freeze(this);
    }

    encode(graph: IFXFilterGraph): IFXPortableGraph {
        if (!(graph instanceof IFXFilterGraph))
            throw new TypeError("IFXFilterGraph required.");
        let pixelBytes = 0;
        return buildIFXGraphNodes(graph.output, pixels => {
            pixelBytes += pixels.bytesPerRow * pixels.height;
            if (pixelBytes > portablePixelBudgetBytes)
                throw new RangeError("Serialized graph pixel budget exceeded.");
            return Array.from(pixels.copyData());
        }) as IFXPortableGraph;
    }

    migrate(value: IFXSerializedGraph | IFXPortableGraph | unknown): IFXPortableGraph {
        return this.encode(this.decode(value));
    }

    decode(value: IFXSerializedGraph | IFXPortableGraph | unknown): IFXFilterGraph {
        const version = graphVersion(value);
        if (version === 1)
            return IFXFilterGraph.deserialize(value);
        if (version !== 2 && version !== 3)
            throw new TypeError("Unsupported graph version.");
        let pixelBytes = 0;
        return decodeIFXGraphNodes(this.registry, version, value, (node, sampleFormat) => {
            const samples = graphArrayData(node.data, portablePixelBudgetBytes, "Graph pixels must be bounded plain data.");
            pixelBytes += samples.length * (sampleFormat === "float32" ? 4 : sampleFormat === "float16" ? 2 : 1);
            if (pixelBytes > portablePixelBudgetBytes)
                throw new RangeError("Graph pixels exceed budget.");
            if (sampleFormat !== null) {
                const data = sampleFormat === "float32" ? new Float32Array(samples.length) : new Uint16Array(samples.length);
                for (let sample = 0; sample < samples.length; sample++) {
                    const entry = samples[sample];
                    if (typeof entry !== "number" || (sampleFormat === "float32" ? !Number.isFinite(entry) : !Number.isInteger(entry) || entry < 0 || entry > 65535))
                        throw new TypeError("Graph float pixels must be finite samples or half-float words.");
                    data[sample] = entry;
                }
                return data;
            }
            const data = new Uint8Array(samples.length);
            for (let byte = 0; byte < samples.length; byte++) {
                const entry = samples[byte];
                if (!Number.isInteger(entry) || (entry as number) < 0 || (entry as number) > 255)
                    throw new TypeError("Graph pixels must be byte data.");
                data[byte] = entry as number;
            }
            return data;
        });
    }
}
