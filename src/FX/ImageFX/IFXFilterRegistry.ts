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
import { createProcessingImage, imageNode, IFXImage } from "./IFXImage";
import type { IFXFilterName, IFXFilterParameters, IFXFilterCategory } from "./filterTypes";
import { spatial } from "./filters/spatial";
import { colours } from "./filters/colour";
import { generated } from "./filters/generated";
import { geometry } from "./filters/geometry";
import { reduction } from "./filters/reduction";
import { canny } from "./filters/canny";
import { barcodes } from "./filters/barcode";
import { palette } from "./filters/palette";
import { resampling } from "./filters/resampling";
import { tiling } from "./filters/tiling";
import { transitions } from "./filters/transitions";
import { stylizing } from "./filters/stylizing";
import { models } from "./filters/model";
import type { Definition } from "./filters/common";
import { IFXProcessorDefinition } from "./IFXProcessorDefinition";
const definitions: Readonly<Record<string, Definition>> = Object.freeze({ ...spatial, ...colours, ...palette, ...generated, ...geometry, ...resampling, ...tiling, ...transitions, ...stylizing, ...models, ...reduction, ...canny, ...barcodes });
function definition(name: unknown): Definition {
    if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(definitions, name))
        throw new TypeError("Unknown ImageFX filter.");
    return definitions[name]!;
}
export class IFXFilter<K extends IFXFilterName = IFXFilterName> {
    readonly parameters: Readonly<IFXFilterParameters[K]>;
    readonly category: IFXFilterCategory;
    readonly inputCount: number;
    constructor(readonly name: K, parameters: NoInfer<IFXFilterParameters[K]>) {
        const spec = definition(name);
        this.parameters = Object.freeze(spec.normalise(parameters)) as Readonly<IFXFilterParameters[K]>;
        this.category = spec.category;
        this.inputCount = spec.inputs;
        Object.freeze(this);
    }
    apply(...inputs: readonly IFXImage[]): IFXImage {
        const spec = definition(this.name);
        if (inputs.length !== spec.inputs)
            throw new RangeError(`${this.name} requires exactly ${spec.inputs} image inputs.`);
        inputs.forEach(imageNode);
        return createProcessingImage(inputs, spec.build(inputs, this.parameters as Readonly<Record<string, unknown>>));
    }
}
export class IFXFilterRegistry {
    readonly #custom = new Map<string, IFXKernel>();
    readonly #processors = new Map<string, IFXProcessorDefinition>();
    register(name: string, kernel: IFXKernel): void {
        if (typeof name !== "string" || !/^custom:[a-zA-Z][a-zA-Z0-9._-]{0,63}$/.test(name) || this.#custom.has(name) || this.#custom.size >= 64)
            throw new TypeError("Custom kernel name is invalid, duplicate or exceeds the registry limit.");
        if (!(kernel instanceof IFXKernel))
            throw new TypeError("Portable kernel required.");
        kernel.serialize();
        this.#custom.set(name, kernel);
    }
    custom(name: string): IFXKernel {
        const kernel = this.#custom.get(name);
        if (!kernel)
            throw new TypeError("Unknown custom kernel.");
        return kernel;
    }
    registerProcessor(definition: IFXProcessorDefinition): void {
        if (!(definition instanceof IFXProcessorDefinition))
            throw new TypeError("Portable processor definition required.");
        const { id, version } = definition.descriptor, key = `${id}@${version}`;
        if (this.#processors.has(key) || this.#processors.size >= 64)
            throw new TypeError("Custom processor registry collision or limit exceeded.");
        this.#processors.set(key, definition);
    }
    processor(id: string, version: number): IFXProcessorDefinition {
        if (typeof id !== "string" || !Number.isSafeInteger(version))
            throw new TypeError("Custom processor identity/version required.");
        const definition = this.#processors.get(`${id}@${version}`);
        if (!definition)
            throw new TypeError("Unknown custom processor version.");
        return definition;
    }
    constructor() {
        Object.freeze(this);
    }
    names(category?: IFXFilterCategory): readonly IFXFilterName[] {
        return Object.freeze(Object.keys(definitions).filter(name => category === undefined || definitions[name]!.category === category).sort() as IFXFilterName[]);
    }
    create<K extends IFXFilterName>(name: K, parameters: NoInfer<IFXFilterParameters[K]>): IFXFilter<K> {
        return new IFXFilter(name, parameters);
    }
}
