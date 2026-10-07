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

import { createProcessingImage, imageNode, IFXImage } from "../IFXImage";
import { finiteExtent, infiniteExtent, unionExtent, type IFXExtent } from "../extent";
import type { GFXPoint, GFXRect } from "../../GraphicsFX/GFXGeometry";
import type { ProcessingAccess } from "../processing";
import type { IFXPremultipliedSample as Sample } from "../IFXSampler";
import { fields, number, integer, tuple, point, rect, processor, expanded, expandedExtent } from "../filters/common";
export type IFXKernelInstruction = Readonly<{
    op: "sample";
    input: number;
    offset?: GFXPoint;
}> | Readonly<{
    op: "constant";
    value: readonly [
        number,
        number,
        number,
        number
    ];
}> | Readonly<{
    op: "add" | "subtract" | "multiply" | "minimum" | "maximum";
    left: number;
    right: number;
}> | Readonly<{
    op: "mix";
    left: number;
    right: number;
    amount: number;
}> | Readonly<{
    op: "swizzle";
    input: number;
    channels: readonly [
        number,
        number,
        number,
        number
    ];
}> | Readonly<{
    op: "compare";
    relation: "less" | "lessOrEqual" | "greater" | "greaterOrEqual" | "equal";
    left: number;
    right: number;
}> | Readonly<{
    op: "select";
    condition: number;
    whenTrue: number;
    whenFalse: number;
}> | Readonly<{
    op: "transcendental";
    function: "abs" | "sqrt" | "sin" | "cos";
    input: number;
}>;
export interface IFXKernelProgram {
    readonly inputCount: number;
    readonly instructions: readonly IFXKernelInstruction[];
    readonly output: number;
    readonly extent?: GFXRect;
}
interface Compiled {
    readonly kind: "general" | "colour" | "blend" | "warp";
    readonly inputCount: number;
    readonly instructions: readonly Readonly<Record<string, unknown>>[];
    readonly output: number;
    readonly extent: GFXRect | null;
    readonly maximumDisplacement: number;
    readonly support: number;
}
const compiledPrograms = new WeakMap<IFXKernel, Compiled>();
function compile(program: unknown, kind: Compiled["kind"], maximumDisplacement: number): Compiled {
    const raw = fields(program, ["inputCount", "instructions", "output", "extent"]), inputCount = integer(raw.inputCount, NaN, 0, 4);
    if (!Array.isArray(raw.instructions) || Object.getPrototypeOf(raw.instructions) !== Array.prototype || raw.instructions.length < 1 || raw.instructions.length > 128)
        throw new RangeError("Kernel requires one to 128 instructions.");
    const instructions: Readonly<Record<string, unknown>>[] = [];
    let support = 0;
    const reference = (value: unknown) => integer(value, NaN, 0, instructions.length - 1);
    for (let i = 0; i < raw.instructions.length; i++) {
        const d = Object.getOwnPropertyDescriptor(raw.instructions, String(i));
        if (!d || !("value" in d))
            throw new TypeError("Kernel instructions must be data.");
        const candidate = d.value, opDescriptor = candidate && typeof candidate === "object" ? Object.getOwnPropertyDescriptor(candidate, "op") : null, op = opDescriptor && "value" in opDescriptor ? opDescriptor.value : null;
        let instruction: Record<string, unknown>;
        if (op === "sample") {
            const p = fields(candidate, ["op", "input", "offset"]), input = integer(p.input, NaN, 0, inputCount - 1), offset = point(p.offset);
            if (Math.abs(offset.x) > 1024 || Math.abs(offset.y) > 1024)
                throw new RangeError("Kernel sampling support exceeds 1024 pixels.");
            if ((kind === "colour" || kind === "blend") && (offset.x !== 0 || offset.y !== 0))
                throw new RangeError("Colour and blend kernels sample only the current pixel.");
            support = Math.max(support, Math.abs(offset.x), Math.abs(offset.y));
            instruction = { op, input, offset };
        }
        else if (op === "constant") {
            const p = fields(candidate, ["op", "value"]);
            instruction = { op, value: tuple(p.value, [], 4) };
        }
        else if (["add", "subtract", "multiply", "minimum", "maximum", "mix"].includes(op)) {
            const p = fields(candidate, op === "mix" ? ["op", "left", "right", "amount"] : ["op", "left", "right"]);
            instruction = { op, left: reference(p.left), right: reference(p.right), ...(op === "mix" ? { amount: number(p.amount, NaN, 0, 1) } : {}) };
        }
        else if (op === "swizzle") {
            const p = fields(candidate, ["op", "input", "channels"]), channels = tuple(p.channels, [], 4);
            channels.forEach(c => integer(c, NaN, 0, 3));
            instruction = { op, input: reference(p.input), channels };
        }
        else if (op === "compare") {
            const p = fields(candidate, ["op", "relation", "left", "right"]);
            if (!["less", "lessOrEqual", "greater", "greaterOrEqual", "equal"].includes(p.relation as string))
                throw new TypeError("Unknown portable comparison relation.");
            instruction = { op, relation: p.relation, left: reference(p.left), right: reference(p.right) };
        }
        else if (op === "select") {
            const p = fields(candidate, ["op", "condition", "whenTrue", "whenFalse"]);
            instruction = { op, condition: reference(p.condition), whenTrue: reference(p.whenTrue), whenFalse: reference(p.whenFalse) };
        }
        else if (op === "transcendental") {
            const p = fields(candidate, ["op", "function", "input"]);
            if (!["abs", "sqrt", "sin", "cos"].includes(p.function as string))
                throw new TypeError("Unknown portable transcendental function.");
            instruction = { op, function: p.function, input: reference(p.input) };
        }
        else
            throw new TypeError("Unknown portable kernel opcode.");
        instructions.push(Object.freeze(instruction));
    }
    if (kind === "colour" && inputCount !== 1 || kind === "blend" && inputCount !== 2 || kind === "warp" && inputCount !== 1)
        throw new RangeError("Kernel input count does not match its kind.");
    return Object.freeze({ kind, inputCount, instructions: Object.freeze(instructions), output: integer(raw.output, NaN, 0, instructions.length - 1), extent: raw.extent === undefined ? null : rect(raw.extent), maximumDisplacement: number(maximumDisplacement, 0, 0, 1024), support });
}
function evaluate(program: Compiled, p: GFXPoint, access: ProcessingAccess): Sample {
    const registers: number[][] = [];
    for (const instruction of program.instructions) {
        let out: number[];
        const op = instruction.op;
        if (op === "sample") {
            const offset = instruction.offset as GFXPoint, c = access.sample(instruction.input as number, { x: p.x + offset.x, y: p.y + offset.y });
            out = [c.r, c.g, c.b, c.a];
        }
        else if (op === "constant")
            out = [...(instruction.value as readonly number[])];
        else if (op === "swizzle") {
            const source = registers[instruction.input as number]!;
            out = (instruction.channels as readonly number[]).map(index => source[index]!);
        }
        else if (op === "compare") {
            const left = registers[instruction.left as number]!, right = registers[instruction.right as number]!, relation = instruction.relation as string;
            out = left.map((value, index) => {
                const other = right[index]!;
                return relation === "less" ? +(value < other)
                    : relation === "lessOrEqual" ? +(value <= other)
                        : relation === "greater" ? +(value > other)
                            : relation === "greaterOrEqual" ? +(value >= other)
                                : +(value === other);
            });
        }
        else if (op === "select") {
            const condition = registers[instruction.condition as number]!, whenTrue = registers[instruction.whenTrue as number]!, whenFalse = registers[instruction.whenFalse as number]!;
            out = condition.map((value, index) => value > 0 ? whenTrue[index]! : whenFalse[index]!);
        }
        else if (op === "transcendental") {
            const input = registers[instruction.input as number]!, fn = instruction.function as string;
            out = input.map(value => fn === "abs" ? Math.abs(value) : fn === "sqrt" ? Math.sqrt(value) : fn === "sin" ? Math.sin(value) : Math.cos(value));
        }
        else {
            const left = registers[instruction.left as number]!, right = registers[instruction.right as number]!;
            out = left.map((v, i) => op === "add" ? v + right[i]! : op === "subtract" ? v - right[i]! : op === "multiply" ? v * right[i]! : op === "minimum" ? Math.min(v, right[i]!) : op === "maximum" ? Math.max(v, right[i]!) : v + (right[i]! - v) * (instruction.amount as number));
        }
        if (out.some(v => !Number.isFinite(v) || Math.abs(v) > 1e12))
            throw new RangeError("Kernel register magnitude exceeded.");
        registers.push(out);
    }
    const output = registers[program.output]!;
    if (program.kind === "warp") {
        if (Math.abs(output[0]!) > program.maximumDisplacement || Math.abs(output[1]!) > program.maximumDisplacement)
            throw new RangeError("Warp displacement exceeds declared ROI.");
        return access.sample(0, { x: p.x + output[0]!, y: p.y + output[1]! });
    }
    return { r: output[0]!, g: output[1]!, b: output[2]!, a: output[3]! };
}
export class IFXKernel {
    constructor(program: IFXKernelProgram, kind: Compiled["kind"] = "general", maximumDisplacement = 0) {
        if (!["general", "colour", "blend", "warp"].includes(kind))
            throw new TypeError("Unknown kernel kind.");
        compiledPrograms.set(this, compile(program, kind, maximumDisplacement));
        Object.freeze(this);
    }
    get inputCount() {
        return compiledPrograms.get(this)!.inputCount;
    }
    apply(...inputs: readonly IFXImage[]): IFXImage {
        const program = compiledPrograms.get(this);
        if (!program)
            throw new TypeError("Authentic kernel required.");
        if (inputs.length !== program.inputCount)
            throw new RangeError("Kernel input count mismatch.");
        inputs.forEach(imageNode);
        let extent: IFXExtent = program.extent ? finiteExtent(program.extent) : inputs.length ? inputs.map(i => i.extent).reduce(unionExtent) : infiniteExtent;
        const support = program.support + program.maximumDisplacement + 1;
        if (!program.extent && program.kind === "general")
            extent = expandedExtent(extent, program.support);
        const parameters = this.serialize();
        return createProcessingImage(inputs, processor("portableKernel", parameters as unknown as Readonly<Record<string, unknown>>, extent, (point, access) => evaluate(program, point, access), bounds => inputs.map(() => expanded(bounds, support))));
    }
    serialize(): Readonly<Record<string, unknown>> {
        const p = compiledPrograms.get(this);
        if (!p)
            throw new TypeError("Authentic kernel required.");
        return Object.freeze({ kind: p.kind, inputCount: p.inputCount, instructions: p.instructions, output: p.output, ...(p.extent ? { extent: p.extent } : {}), maximumDisplacement: p.maximumDisplacement });
    }
    static deserialize(value: unknown): IFXKernel {
        const raw = fields(value, ["kind", "inputCount", "instructions", "output", "extent", "maximumDisplacement"]);
        if (!["general", "colour", "blend", "warp"].includes(raw.kind as string))
            throw new TypeError("Unknown portable kernel kind.");
        return new IFXKernel({ inputCount: raw.inputCount as number, instructions: raw.instructions as readonly IFXKernelInstruction[], output: raw.output as number, ...(raw.extent === undefined ? {} : { extent: raw.extent as GFXRect }) }, raw.kind as Compiled["kind"], number(raw.maximumDisplacement, 0, 0, 1024));
    }
}
export class IFXColourKernel extends IFXKernel {
    constructor(instructions: readonly IFXKernelInstruction[], output: number) {
        super({ inputCount: 1, instructions, output }, "colour");
    }
}
export class IFXBlendKernel extends IFXKernel {
    constructor(instructions: readonly IFXKernelInstruction[], output: number) {
        super({ inputCount: 2, instructions, output }, "blend");
    }
}
export class IFXWarpKernel extends IFXKernel {
    constructor(instructions: readonly IFXKernelInstruction[], output: number, maximumDisplacement: number) {
        super({ inputCount: 1, instructions, output }, "warp", maximumDisplacement);
    }
}
