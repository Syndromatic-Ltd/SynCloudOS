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

import type { GFXPoint, GFXRect } from "../GraphicsFX/GFXGeometry";
import { normaliseRect } from "../GraphicsFX/GFXGeometry";
import { createProcessingImage, imageNode, IFXImage } from "./IFXImage";
import { finiteExtent, infiniteExtent, unionExtent, type IFXExtent } from "./extent";
import type { ImageProcessor, ProcessingAccess, ProcessingPreparationAccess } from "./processing";
import type { IFXPremultipliedSample } from "./IFXSampler";
import { IFXKernel, type IFXKernelInstruction, type IFXKernelProgram } from "./kernels/IFXKernel";

export type IFXProcessorParameterRule =
    | Readonly<{ type: "number"; default?: number; minimum?: number; maximum?: number; integer?: boolean }>
    | Readonly<{ type: "boolean"; default?: boolean }>
    | Readonly<{ type: "enum"; values: readonly string[]; default?: string }>;

export type IFXProcessorOutputDeclaration =
    | Readonly<{ kind: "first-input" }>
    | Readonly<{ kind: "union" }>
    | Readonly<{ kind: "finite"; rect: GFXRect }>;

export type IFXProcessorROIDeclaration =
    | Readonly<{ kind: "identity" }>
    | Readonly<{ kind: "support"; radius: number }>
    | Readonly<{ kind: "global" }>;

export interface IFXProcessorPortableBinding {
    readonly parameter: string;
    readonly instruction: number;
    readonly components: readonly (0 | 1 | 2 | 3)[];
}

export interface IFXProcessorPortableKernelProgram {
    readonly kind: "kernel";
    readonly version: 1;
    readonly program: IFXKernelProgram;
    readonly bindings: readonly IFXProcessorPortableBinding[];
}

export type IFXProcessorPortableProgram = IFXProcessorPortableKernelProgram;

export interface IFXProcessorDescriptor {
    readonly id: string;
    readonly version: number;
    readonly inputCount: number;
    readonly parameters: Readonly<Record<string, IFXProcessorParameterRule>>;
    readonly output: IFXProcessorOutputDeclaration;
    readonly roi: IFXProcessorROIDeclaration;
    readonly preparation?: NonNullable<ImageProcessor["preparation"]>;
    readonly portableProgram?: IFXProcessorPortableProgram;
}

export interface IFXProcessorDefinitionOptions extends IFXProcessorDescriptor {
    readonly evaluate: (position: GFXPoint, access: ProcessingAccess, parameters: Readonly<Record<string, unknown>>) => IFXPremultipliedSample;
    readonly prepare?: (access: ProcessingPreparationAccess, parameters: Readonly<Record<string, unknown>>) => Promise<void>;
}

type Implementation = Readonly<{
    evaluate: IFXProcessorDefinitionOptions["evaluate"];
    prepare?: IFXProcessorDefinitionOptions["prepare"];
}>;

const implementations = new WeakMap<IFXProcessorDefinition, Implementation>();
const wirePrefix = "portableProcessor/";

function plainRecord(value: unknown, message: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
        throw new TypeError(message);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some(descriptor => !("value" in descriptor)))
        throw new TypeError(message);
    return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, (descriptor as PropertyDescriptor & { value: unknown }).value]));
}

function finiteNumber(value: unknown, label: string, minimum = -1e12, maximum = 1e12): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)
        throw new RangeError(`${label} exceeds its range.`);
    return value;
}

function compileRule(value: unknown): IFXProcessorParameterRule {
    const raw = plainRecord(value, "Processor parameter schema must contain plain data.");
    if (raw.type === "number") {
        for (const key of Object.keys(raw))
            if (!["type", "default", "minimum", "maximum", "integer"].includes(key))
                throw new TypeError("Unknown processor parameter schema field.");
        const minimum = raw.minimum === undefined ? -1e6 : finiteNumber(raw.minimum, "Parameter minimum");
        const maximum = raw.maximum === undefined ? 1e6 : finiteNumber(raw.maximum, "Parameter maximum");
        if (minimum > maximum)
            throw new RangeError("Processor parameter range is inverted.");
        const integer = raw.integer === undefined ? false : raw.integer;
        if (typeof integer !== "boolean")
            throw new TypeError("Processor integer flag must be boolean.");
        let fallback: number | undefined;
        if (raw.default !== undefined) {
            fallback = finiteNumber(raw.default, "Parameter default", minimum, maximum);
            if (integer && !Number.isSafeInteger(fallback))
                throw new RangeError("Processor integer default must be integral.");
        }
        return Object.freeze({ type: "number", ...(fallback === undefined ? {} : { default: fallback }), minimum, maximum, integer });
    }
    if (raw.type === "boolean") {
        for (const key of Object.keys(raw))
            if (!["type", "default"].includes(key))
                throw new TypeError("Unknown processor parameter schema field.");
        if (raw.default !== undefined && typeof raw.default !== "boolean")
            throw new TypeError("Processor boolean default must be boolean.");
        return Object.freeze({ type: "boolean", ...(raw.default === undefined ? {} : { default: raw.default as boolean }) });
    }
    if (raw.type === "enum") {
        for (const key of Object.keys(raw))
            if (!["type", "values", "default"].includes(key))
                throw new TypeError("Unknown processor parameter schema field.");
        if (!Array.isArray(raw.values) || Object.getPrototypeOf(raw.values) !== Array.prototype || raw.values.length < 1 || raw.values.length > 32)
            throw new TypeError("Processor enum values are invalid.");
        const values: string[] = [];
        for (let index = 0; index < raw.values.length; index++) {
            const descriptor = Object.getOwnPropertyDescriptor(raw.values, String(index));
            if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string" || !descriptor.value.length || descriptor.value.length > 64 || values.includes(descriptor.value))
                throw new TypeError("Processor enum values must be unique data strings.");
            values.push(descriptor.value);
        }
        if (raw.default !== undefined && (typeof raw.default !== "string" || !values.includes(raw.default)))
            throw new RangeError("Processor enum default is not declared.");
        return Object.freeze({ type: "enum", values: Object.freeze(values), ...(raw.default === undefined ? {} : { default: raw.default as string }) });
    }
    throw new TypeError("Unknown processor parameter schema type.");
}

function compileParameters(value: unknown): Readonly<Record<string, IFXProcessorParameterRule>> {
    const raw = plainRecord(value, "Processor parameter schema must be a plain record.");
    const keys = Object.keys(raw);
    if (keys.length > 32)
        throw new RangeError("Processor parameter schema exceeds 32 fields.");
    const output: Record<string, IFXProcessorParameterRule> = {};
    for (const key of keys) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key))
            throw new TypeError("Processor parameter name is invalid.");
        output[key] = compileRule(raw[key]);
    }
    return Object.freeze(output);
}

function compileOutput(value: unknown): IFXProcessorOutputDeclaration {
    const raw = plainRecord(value, "Processor output declaration must be plain data.");
    if (raw.kind === "first-input" || raw.kind === "union") {
        if (Object.keys(raw).length !== 1)
            throw new TypeError("Processor output declaration has unknown fields.");
        return Object.freeze({ kind: raw.kind });
    }
    if (raw.kind === "finite") {
        if (Object.keys(raw).length !== 2 || !Object.prototype.hasOwnProperty.call(raw, "rect"))
            throw new TypeError("Finite processor output declaration is invalid.");
        return Object.freeze({ kind: "finite", rect: Object.freeze(normaliseRect(raw.rect as GFXRect)) });
    }
    throw new TypeError("Unknown processor output declaration.");
}

function compileROI(value: unknown): IFXProcessorROIDeclaration {
    const raw = plainRecord(value, "Processor ROI declaration must be plain data.");
    if (raw.kind === "identity" || raw.kind === "global") {
        if (Object.keys(raw).length !== 1)
            throw new TypeError("Processor ROI declaration has unknown fields.");
        return Object.freeze({ kind: raw.kind });
    }
    if (raw.kind === "support") {
        if (Object.keys(raw).length !== 2 || !Object.prototype.hasOwnProperty.call(raw, "radius"))
            throw new TypeError("Processor ROI support declaration is invalid.");
        const radius = finiteNumber(raw.radius, "Processor ROI support radius", 0, 1024);
        return Object.freeze({ kind: "support", radius });
    }
    throw new TypeError("Unknown processor ROI declaration.");
}

function compilePreparation(value: unknown): NonNullable<ImageProcessor["preparation"]> | undefined {
    if (value === undefined)
        return undefined;
    const raw = plainRecord(value, "Processor preparation declaration must be plain data.");
    if (Object.keys(raw).length !== 3 || !["regional", "global"].includes(raw.scope as string))
        throw new TypeError("Processor preparation declaration is invalid.");
    const scratchBytes = finiteNumber(raw.scratchBytes, "Processor preparation scratch", 0, 1024 * 1024 * 1024);
    const work = finiteNumber(raw.work, "Processor preparation work", 0, 1024 * 1024 * 1024);
    if (!Number.isSafeInteger(scratchBytes) || !Number.isSafeInteger(work))
        throw new RangeError("Processor preparation budgets must be integral.");
    return Object.freeze({ scope: raw.scope as "regional" | "global", scratchBytes, work });
}

function compilePortableProgramData(value: unknown): IFXProcessorPortableKernelProgram {
    const raw = plainRecord(value, "Portable processor program must be plain data.");
    if (Object.keys(raw).length !== 4 || raw.kind !== "kernel" || raw.version !== 1)
        throw new TypeError("Unsupported portable processor program.");
    const programRaw = plainRecord(raw.program, "Portable processor kernel must be plain data.");
    if (Object.prototype.hasOwnProperty.call(programRaw, "extent"))
        throw new TypeError("Portable custom processor kernels cannot declare an output extent.");
    const kernel = new IFXKernel(programRaw as unknown as IFXKernelProgram);
    const serialized = kernel.serialize();
    if (serialized.kind !== "general" || serialized.maximumDisplacement !== 0)
        throw new TypeError("Portable custom processor requires a general point kernel.");
    const inputCount = serialized.inputCount as number;
    const instructions = serialized.instructions as readonly Readonly<Record<string, unknown>>[];
    for (const instruction of instructions) {
        if (instruction.op !== "sample") continue;
        const offset = instruction.offset as Readonly<{ x: number; y: number }>;
        if (offset.x !== 0 || offset.y !== 0)
            throw new TypeError("Portable custom processor kernels may sample only the current point.");
    }
    const rawBindings = raw.bindings;
    if (!Array.isArray(rawBindings) || Object.getPrototypeOf(rawBindings) !== Array.prototype || rawBindings.length > 128)
        throw new TypeError("Portable processor bindings must be a bounded data array.");
    const bindings: IFXProcessorPortableBinding[] = [];
    const targets = new Set<string>();
    for (let index = 0; index < rawBindings.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(rawBindings, String(index));
        if (!descriptor || !("value" in descriptor))
            throw new TypeError("Portable processor bindings must be data.");
        const binding = plainRecord(descriptor.value, "Portable processor binding must be plain data.");
        if (Object.keys(binding).length !== 3 || typeof binding.parameter !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(binding.parameter))
            throw new TypeError("Portable processor binding is invalid.");
        if (!Number.isSafeInteger(binding.instruction) || (binding.instruction as number) < 0 || (binding.instruction as number) >= instructions.length)
            throw new RangeError("Portable processor binding instruction is invalid.");
        const targetInstruction = instructions[binding.instruction as number]!;
        if (targetInstruction.op !== "constant")
            throw new TypeError("Portable processor parameters may bind only constant instructions.");
        const rawComponents = binding.components;
        if (!Array.isArray(rawComponents) || Object.getPrototypeOf(rawComponents) !== Array.prototype || rawComponents.length < 1 || rawComponents.length > 4)
            throw new TypeError("Portable processor binding components are invalid.");
        const components: (0 | 1 | 2 | 3)[] = [];
        for (let componentIndex = 0; componentIndex < rawComponents.length; componentIndex++) {
            const componentDescriptor = Object.getOwnPropertyDescriptor(rawComponents, String(componentIndex));
            const component = componentDescriptor && "value" in componentDescriptor ? componentDescriptor.value : null;
            if (!Number.isInteger(component) || (component as number) < 0 || (component as number) > 3 || components.includes(component as 0 | 1 | 2 | 3))
                throw new TypeError("Portable processor binding component is invalid.");
            const target = `${binding.instruction}:${component}`;
            if (targets.has(target))
                throw new TypeError("Portable processor binding target is duplicated.");
            targets.add(target);
            components.push(component as 0 | 1 | 2 | 3);
        }
        bindings.push(Object.freeze({ parameter: binding.parameter, instruction: binding.instruction as number, components: Object.freeze(components) }));
    }
    const canonicalInstructions = instructions as unknown as readonly IFXKernelInstruction[];
    return Object.freeze({
        kind: "kernel",
        version: 1,
        program: Object.freeze({ inputCount, instructions: Object.freeze(canonicalInstructions), output: serialized.output as number }),
        bindings: Object.freeze(bindings),
    });
}

function compilePortableProgramForDefinition(
    value: unknown,
    parameters: Readonly<Record<string, IFXProcessorParameterRule>>,
    inputCount: number,
    output: IFXProcessorOutputDeclaration,
    roi: IFXProcessorROIDeclaration,
    preparation: NonNullable<ImageProcessor["preparation"]> | undefined,
    hasPrepare: boolean,
): IFXProcessorPortableKernelProgram | undefined {
    if (value === undefined) return undefined;
    if (inputCount !== 1 || output.kind !== "first-input" || roi.kind !== "identity" || preparation || hasPrepare)
        throw new TypeError("Portable custom processor v1 supports single-input point processors without preparation.");
    const compiled = compilePortableProgramData(value);
    if (compiled.program.inputCount !== inputCount)
        throw new RangeError("Portable processor program input count does not match its definition.");
    for (const binding of compiled.bindings) {
        const rule = parameters[binding.parameter];
        if (!rule)
            throw new TypeError("Portable processor binding references an undeclared parameter.");
        if (rule.type === "enum")
            throw new TypeError("Portable processor kernel bindings support number and boolean parameters only.");
    }
    return compiled;
}

export function applyIFXProcessorPortableProgram(value: unknown, parameters: unknown, ...inputs: readonly IFXImage[]): IFXImage {
    const compiled = compilePortableProgramData(value);
    if (inputs.length !== compiled.program.inputCount)
        throw new RangeError("Portable processor input count mismatch.");
    inputs.forEach(imageNode);
    const rawParameters = plainRecord(parameters, "Portable processor parameters must contain plain data.");
    const instructions = compiled.program.instructions.map(instruction => {
        if (instruction.op !== "constant") return Object.freeze({ ...instruction });
        const value = instruction.value as readonly number[];
        return Object.freeze({ ...instruction, value: [...value] as [number, number, number, number] });
    }) as Record<string, unknown>[];
    for (const binding of compiled.bindings) {
        if (!Object.prototype.hasOwnProperty.call(rawParameters, binding.parameter))
            throw new TypeError(`Portable processor parameter ${binding.parameter} is missing.`);
        const candidate = rawParameters[binding.parameter];
        const scalar = typeof candidate === "boolean" ? (candidate ? 1 : 0) : finiteNumber(candidate, `Portable processor parameter ${binding.parameter}`, -1e6, 1e6);
        const instruction = instructions[binding.instruction]!;
        if (instruction.op !== "constant" || !Array.isArray(instruction.value))
            throw new TypeError("Portable processor binding target is invalid.");
        const constant = [...instruction.value] as [number, number, number, number];
        for (const component of binding.components) constant[component] = scalar;
        instructions[binding.instruction] = Object.freeze({ ...instruction, value: Object.freeze(constant) });
    }
    return new IFXKernel({
        inputCount: compiled.program.inputCount,
        instructions: instructions as unknown as readonly IFXKernelInstruction[],
        output: compiled.program.output,
    }).apply(...inputs);
}

function extentFor(declaration: IFXProcessorOutputDeclaration, inputs: readonly IFXImage[]): IFXExtent {
    if (declaration.kind === "finite")
        return finiteExtent(declaration.rect);
    if (!inputs.length)
        return infiniteExtent;
    if (declaration.kind === "first-input")
        return inputs[0]!.extent;
    return inputs.map(input => input.extent).reduce(unionExtent);
}

export function parseIFXProcessorWireName(name: string): Readonly<{ id: string; version: number }> | null {
    if (!name.startsWith(wirePrefix))
        return null;
    const payload = name.slice(wirePrefix.length), separator = payload.lastIndexOf("@");
    if (separator <= 0)
        return null;
    const id = payload.slice(0, separator), version = Number(payload.slice(separator + 1));
    return /^custom:[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(id) && Number.isSafeInteger(version) && version >= 1 && version <= 65535
        ? Object.freeze({ id, version })
        : null;
}

export class IFXProcessorDefinition {
    readonly descriptor: IFXProcessorDescriptor;
    readonly wireName: string;

    constructor(options: IFXProcessorDefinitionOptions) {
        const raw = plainRecord(options, "Processor definition must be a plain record.");
        const allowed = ["id", "version", "inputCount", "parameters", "output", "roi", "preparation", "portableProgram", "evaluate", "prepare"];
        if (Object.keys(raw).some(key => !allowed.includes(key)))
            throw new TypeError("Unknown processor definition field.");
        if (typeof raw.id !== "string" || !/^custom:[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(raw.id))
            throw new TypeError("Custom processor identity is invalid.");
        if (!Number.isSafeInteger(raw.version) || (raw.version as number) < 1 || (raw.version as number) > 65535)
            throw new RangeError("Custom processor version is invalid.");
        if (!Number.isSafeInteger(raw.inputCount) || (raw.inputCount as number) < 0 || (raw.inputCount as number) > 4)
            throw new RangeError("Custom processor input count is invalid.");
        if (typeof raw.evaluate !== "function" || raw.prepare !== undefined && typeof raw.prepare !== "function")
            throw new TypeError("Processor implementation callback is invalid.");
        const parameters = compileParameters(raw.parameters);
        const output = compileOutput(raw.output);
        const roi = compileROI(raw.roi);
        const preparation = compilePreparation(raw.preparation);
        if ((output.kind === "first-input" || output.kind === "union" || roi.kind === "global") && raw.inputCount === 0)
            throw new RangeError("Processor declaration requires at least one input.");
        const portableProgram = compilePortableProgramForDefinition(raw.portableProgram, parameters, raw.inputCount as number, output, roi, preparation, raw.prepare !== undefined);
        this.descriptor = Object.freeze({
            id: raw.id,
            version: raw.version as number,
            inputCount: raw.inputCount as number,
            parameters,
            output,
            roi,
            ...(preparation ? { preparation } : {}),
            ...(portableProgram ? { portableProgram } : {}),
        });
        this.wireName = `${wirePrefix}${this.descriptor.id}@${this.descriptor.version}`;
        implementations.set(this, Object.freeze({ evaluate: raw.evaluate as IFXProcessorDefinitionOptions["evaluate"], ...(raw.prepare ? { prepare: raw.prepare as IFXProcessorDefinitionOptions["prepare"] } : {}) }));
        Object.freeze(this);
    }

    normaliseParameters(value: unknown): Readonly<Record<string, unknown>> {
        const raw = plainRecord(value, "Processor parameters must contain plain data.");
        for (const key of Object.keys(raw))
            if (!Object.prototype.hasOwnProperty.call(this.descriptor.parameters, key))
                throw new TypeError("Unknown processor parameter.");
        const output: Record<string, unknown> = {};
        for (const [key, rule] of Object.entries(this.descriptor.parameters)) {
            const candidate = Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : rule.default;
            if (candidate === undefined)
                throw new TypeError(`Required processor parameter ${key} is missing.`);
            if (rule.type === "number") {
                const number = finiteNumber(candidate, `Processor parameter ${key}`, rule.minimum ?? -1e6, rule.maximum ?? 1e6);
                if (rule.integer && !Number.isSafeInteger(number))
                    throw new RangeError(`Processor parameter ${key} must be integral.`);
                output[key] = number;
            }
            else if (rule.type === "boolean") {
                if (typeof candidate !== "boolean")
                    throw new TypeError(`Processor parameter ${key} must be boolean.`);
                output[key] = candidate;
            }
            else {
                if (typeof candidate !== "string" || !rule.values.includes(candidate))
                    throw new RangeError(`Processor parameter ${key} is outside its enum.`);
                output[key] = candidate;
            }
        }
        return Object.freeze(output);
    }

    apply(parameters: unknown, ...inputs: readonly IFXImage[]): IFXImage {
        if (inputs.length !== this.descriptor.inputCount)
            throw new RangeError("Custom processor input count mismatch.");
        inputs.forEach(imageNode);
        const normalised = this.normaliseParameters(parameters);
        const implementation = implementations.get(this);
        if (!implementation)
            throw new TypeError("Authentic processor definition required.");
        const extent = extentFor(this.descriptor.output, inputs);
        const roi = this.descriptor.roi;
        const regions = (bounds: GFXRect): readonly GFXRect[] => {
            const normalized = normaliseRect(bounds);
            if (roi.kind === "identity")
                return inputs.map(() => normalized);
            if (roi.kind === "support")
                return inputs.map(() => Object.freeze({ x: normalized.x - roi.radius, y: normalized.y - roi.radius, width: normalized.width + roi.radius * 2, height: normalized.height + roi.radius * 2 }));
            return inputs.map(input => {
                if (input.extent.kind !== "finite")
                    throw new RangeError("Global processor ROI requires finite inputs.");
                return input.extent.rect;
            });
        };
        const processor: ImageProcessor = Object.freeze({
            name: this.wireName,
            parameters: normalised,
            ...(this.descriptor.portableProgram ? { portableProgram: this.descriptor.portableProgram as unknown as Readonly<Record<string, unknown>> } : {}),
            extent,
            ...(this.descriptor.preparation ? { preparation: this.descriptor.preparation } : {}),
            evaluate: (position: GFXPoint, access: ProcessingAccess) => implementation.evaluate(position, access, normalised),
            regions,
            ...(implementation.prepare ? { prepare: (access: ProcessingPreparationAccess) => implementation.prepare!(access, normalised) } : {}),
        });
        return createProcessingImage(inputs, processor);
    }
}
