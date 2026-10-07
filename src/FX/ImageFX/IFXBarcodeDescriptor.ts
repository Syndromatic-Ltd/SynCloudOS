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

import { encodeAztecMessage, encodeDataMatrixMessage, encodePDF417Message, encodeQRDescriptor, type BarcodeMatrix } from "./barcodeEncoding";
import {
    isSupportedDataMatrixSize,
    type IFXAztecCodeDescriptorOptions,
    type IFXDataMatrixCodeDescriptorOptions,
    type IFXPDF417CodeDescriptorOptions,
} from "./barcodeDescriptors";

export type IFXQRCodeErrorCorrectionLevel = "L" | "M" | "Q" | "H";

export interface IFXQRCodeDescriptorData {
    readonly kind: "qr";
    readonly errorCorrectedPayload: readonly number[];
    readonly symbolVersion: number;
    readonly maskPattern: number;
    readonly errorCorrectionLevel: IFXQRCodeErrorCorrectionLevel;
}

export interface IFXAztecCodeDescriptorData {
    readonly kind: "aztec";
    readonly schemaVersion: 1;
    readonly encoding: "binary-bytes";
    readonly message: readonly number[];
    readonly correctionLevel: number;
    readonly layers: number;
    readonly compactStyle: boolean;
    readonly quietSpace: number;
}

export interface IFXPDF417CodeDescriptorData {
    readonly kind: "pdf417";
    readonly schemaVersion: 1;
    readonly encoding: "binary-bytes";
    readonly message: readonly number[];
    readonly correctionLevel: number;
    readonly dataColumns: number;
    readonly rows: number;
    readonly compactStyle: boolean;
    readonly quietSpace: number;
}

export interface IFXDataMatrixCodeDescriptorData {
    readonly kind: "dataMatrix";
    readonly schemaVersion: 1;
    readonly encoding: "binary-bytes";
    readonly message: readonly number[];
    readonly rows: number;
    readonly columns: number;
    readonly quietSpace: number;
}

export type IFXBarcodeDescriptorData =
    | IFXQRCodeDescriptorData
    | IFXAztecCodeDescriptorData
    | IFXPDF417CodeDescriptorData
    | IFXDataMatrixCodeDescriptorData;
export type IFXBarcodePayloadKind = "data-codewords" | "message";

const maximumDescriptorBytes = 4096;
const matrices = new WeakMap<IFXBarcodeDescriptor, BarcodeMatrix>();

function ownBytes(value: unknown, maximum = maximumDescriptorBytes): Uint8Array {
    if (value instanceof Uint8Array && Object.getPrototypeOf(value) === Uint8Array.prototype) {
        if (value.length < 1 || value.length > maximum)
            throw new RangeError("Barcode payload exceeds its byte limit.");
        return new Uint8Array(value);
    }
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
        throw new TypeError("Barcode payload must be a nonempty plain byte array.");
    if (value.length < 1 || value.length > maximum)
        throw new RangeError("Barcode payload exceeds its byte limit.");
    const descriptors = Object.getOwnPropertyDescriptors(value), bytes = new Uint8Array(value.length);
    if (Object.keys(descriptors).some(key => key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)))
        throw new TypeError("Barcode payload must contain only indexed byte data.");
    for (let index = 0; index < value.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor) || !Number.isInteger(descriptor.value) || descriptor.value < 0 || descriptor.value > 255)
            throw new TypeError("Barcode payload must contain byte data.");
        bytes[index] = descriptor.value;
    }
    return bytes;
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
        throw new TypeError("Barcode descriptor data must be a plain record.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length !== keys.length || keys.some(key => !descriptors[key] || !("value" in descriptors[key]!)))
        throw new TypeError("Barcode descriptor data has an invalid shape.");
    return Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]));
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
    if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
        throw new RangeError(`${label} is outside its supported range.`);
    return value as number;
}

function exact(value: unknown, expected: unknown, label: string): void {
    if (value !== expected)
        throw new TypeError(`${label} is unsupported.`);
}

function boolean(value: unknown, label: string): boolean {
    if (typeof value !== "boolean")
        throw new TypeError(`${label} must be boolean.`);
    return value;
}

export abstract class IFXBarcodeDescriptor {
    static fromData(value: unknown): IFXBarcodeDescriptor {
        const kind = value && typeof value === "object" ? Object.getOwnPropertyDescriptor(value, "kind") : undefined;
        if (!kind || !("value" in kind))
            throw new TypeError("Unsupported barcode descriptor kind.");
        if (kind.value === "qr") {
            const data = record(value, ["kind", "errorCorrectedPayload", "symbolVersion", "maskPattern", "errorCorrectionLevel"]);
            return new IFXQRCodeDescriptor(data.errorCorrectedPayload as never, data.symbolVersion as never, data.maskPattern as never, data.errorCorrectionLevel as never);
        }
        if (kind.value === "aztec") {
            const data = record(value, ["kind", "schemaVersion", "encoding", "message", "correctionLevel", "layers", "compactStyle", "quietSpace"]);
            exact(data.schemaVersion, 1, "Aztec descriptor schema version");
            exact(data.encoding, "binary-bytes", "Aztec descriptor encoding");
            return new IFXAztecCodeDescriptor(data.message as never, {
                correctionLevel: data.correctionLevel as never,
                layers: data.layers as never,
                compactStyle: data.compactStyle as never,
                quietSpace: data.quietSpace as never,
            });
        }
        if (kind.value === "pdf417") {
            const data = record(value, ["kind", "schemaVersion", "encoding", "message", "correctionLevel", "dataColumns", "rows", "compactStyle", "quietSpace"]);
            exact(data.schemaVersion, 1, "PDF417 descriptor schema version");
            exact(data.encoding, "binary-bytes", "PDF417 descriptor encoding");
            return new IFXPDF417CodeDescriptor(data.message as never, {
                correctionLevel: data.correctionLevel as never,
                dataColumns: data.dataColumns as never,
                rows: data.rows as never,
                compactStyle: data.compactStyle as never,
                quietSpace: data.quietSpace as never,
            });
        }
        if (kind.value === "dataMatrix") {
            const data = record(value, ["kind", "schemaVersion", "encoding", "message", "rows", "columns", "quietSpace"]);
            exact(data.schemaVersion, 1, "Data Matrix descriptor schema version");
            exact(data.encoding, "binary-bytes", "Data Matrix descriptor encoding");
            return new IFXDataMatrixCodeDescriptor(data.message as never, {
                rows: data.rows as never,
                columns: data.columns as never,
                quietSpace: data.quietSpace as never,
            });
        }
        throw new TypeError("Unsupported barcode descriptor kind.");
    }
    abstract readonly payloadKind: IFXBarcodePayloadKind;
    abstract toData(): IFXBarcodeDescriptorData;
}

export class IFXQRCodeDescriptor extends IFXBarcodeDescriptor {
    readonly payloadKind = "data-codewords" as const;
    readonly #payload: Uint8Array;
    readonly symbolVersion: number;
    readonly maskPattern: number;
    readonly errorCorrectionLevel: IFXQRCodeErrorCorrectionLevel;
    constructor(errorCorrectedPayload: Uint8Array | readonly number[], symbolVersion: number, maskPattern: number, errorCorrectionLevel: IFXQRCodeErrorCorrectionLevel) {
        super();
        const payload = ownBytes(errorCorrectedPayload);
        this.symbolVersion = integer(symbolVersion, 1, 40, "QR symbol version");
        this.maskPattern = integer(maskPattern, 0, 7, "QR mask pattern");
        if (!(["L", "M", "Q", "H"] as const).includes(errorCorrectionLevel))
            throw new TypeError("Unknown QR error-correction level.");
        this.errorCorrectionLevel = errorCorrectionLevel;
        this.#payload = payload;
        matrices.set(this, encodeQRDescriptor(Array.from(payload), this.symbolVersion, this.maskPattern, this.errorCorrectionLevel));
        Object.freeze(this);
    }
    get errorCorrectedPayload(): Uint8Array {
        return new Uint8Array(this.#payload);
    }
    toData(): IFXQRCodeDescriptorData {
        return Object.freeze({ kind: "qr", errorCorrectedPayload: Object.freeze(Array.from(this.#payload)), symbolVersion: this.symbolVersion, maskPattern: this.maskPattern, errorCorrectionLevel: this.errorCorrectionLevel });
    }
}

abstract class IFXMessageBarcodeDescriptor extends IFXBarcodeDescriptor {
    readonly payloadKind = "message" as const;
    readonly schemaVersion = 1 as const;
    readonly encoding = "binary-bytes" as const;
    readonly #message: Uint8Array;
    protected constructor(message: Uint8Array | readonly number[]) {
        super();
        this.#message = ownBytes(message, maximumDescriptorBytes);
    }
    get message(): Uint8Array {
        return new Uint8Array(this.#message);
    }
    protected dataMessage(): readonly number[] {
        return Object.freeze(Array.from(this.#message));
    }
}

export class IFXAztecCodeDescriptor extends IFXMessageBarcodeDescriptor {
    readonly correctionLevel: number;
    readonly layers: number;
    readonly compactStyle: boolean;
    readonly quietSpace: number;
    constructor(message: Uint8Array | readonly number[], options: IFXAztecCodeDescriptorOptions) {
        super(message);
        if (!options || typeof options !== "object")
            throw new TypeError("Aztec descriptor options are required.");
        this.correctionLevel = integer(options.correctionLevel, 5, 95, "Aztec correction level");
        this.compactStyle = boolean(options.compactStyle, "Aztec compact style");
        this.layers = integer(options.layers, 1, this.compactStyle ? 4 : 32, "Aztec layers");
        this.quietSpace = integer(options.quietSpace, 0, 64, "Aztec quiet space");
        matrices.set(this, encodeAztecMessage(Array.from(this.message), this.correctionLevel, this.layers, this.compactStyle, this.quietSpace));
        Object.freeze(this);
    }
    toData(): IFXAztecCodeDescriptorData {
        return Object.freeze({
            kind: "aztec", schemaVersion: 1, encoding: "binary-bytes", message: this.dataMessage(),
            correctionLevel: this.correctionLevel, layers: this.layers, compactStyle: this.compactStyle, quietSpace: this.quietSpace,
        });
    }
}

export class IFXPDF417CodeDescriptor extends IFXMessageBarcodeDescriptor {
    readonly correctionLevel: number;
    readonly dataColumns: number;
    readonly rows: number;
    readonly compactStyle: boolean;
    readonly quietSpace: number;
    constructor(message: Uint8Array | readonly number[], options: IFXPDF417CodeDescriptorOptions) {
        super(message);
        if (!options || typeof options !== "object")
            throw new TypeError("PDF417 descriptor options are required.");
        this.correctionLevel = integer(options.correctionLevel, 0, 8, "PDF417 correction level");
        this.dataColumns = integer(options.dataColumns, 1, 30, "PDF417 data columns");
        this.rows = integer(options.rows, 3, 90, "PDF417 rows");
        this.compactStyle = boolean(options.compactStyle, "PDF417 compact style");
        this.quietSpace = integer(options.quietSpace, 0, 64, "PDF417 quiet space");
        matrices.set(this, encodePDF417Message(Array.from(this.message), this.correctionLevel, this.dataColumns, this.rows, this.compactStyle, this.quietSpace));
        Object.freeze(this);
    }
    toData(): IFXPDF417CodeDescriptorData {
        return Object.freeze({
            kind: "pdf417", schemaVersion: 1, encoding: "binary-bytes", message: this.dataMessage(),
            correctionLevel: this.correctionLevel, dataColumns: this.dataColumns, rows: this.rows,
            compactStyle: this.compactStyle, quietSpace: this.quietSpace,
        });
    }
}

export class IFXDataMatrixCodeDescriptor extends IFXMessageBarcodeDescriptor {
    readonly rows: number;
    readonly columns: number;
    readonly quietSpace: number;
    constructor(message: Uint8Array | readonly number[], options: IFXDataMatrixCodeDescriptorOptions) {
        super(message);
        if (!options || typeof options !== "object")
            throw new TypeError("Data Matrix descriptor options are required.");
        this.rows = integer(options.rows, 8, 144, "Data Matrix rows");
        this.columns = integer(options.columns, 8, 144, "Data Matrix columns");
        if (!isSupportedDataMatrixSize(this.rows, this.columns))
            throw new RangeError("Data Matrix dimensions are not a supported ECC200 symbol size.");
        this.quietSpace = integer(options.quietSpace, 0, 64, "Data Matrix quiet space");
        matrices.set(this, encodeDataMatrixMessage(Array.from(this.message), this.rows, this.columns, this.quietSpace));
        Object.freeze(this);
    }
    toData(): IFXDataMatrixCodeDescriptorData {
        return Object.freeze({
            kind: "dataMatrix", schemaVersion: 1, encoding: "binary-bytes", message: this.dataMessage(),
            rows: this.rows, columns: this.columns, quietSpace: this.quietSpace,
        });
    }
}

export function barcodeMatrixForDescriptor(descriptor: IFXBarcodeDescriptor): BarcodeMatrix {
    const matrix = matrices.get(descriptor);
    if (!matrix)
        throw new TypeError("Authentic barcode descriptor required.");
    return matrix;
}

export function normaliseBarcodeBytes(value: unknown, maximum: number): readonly number[] {
    return Object.freeze(Array.from(ownBytes(value, maximum)));
}
