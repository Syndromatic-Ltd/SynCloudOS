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

import { encodeCode128, encodeQRMessage, type BarcodeMatrix } from "../barcodeEncoding";
import {
    barcodeMatrixForDescriptor,
    IFXAztecCodeDescriptor,
    IFXBarcodeDescriptor,
    IFXDataMatrixCodeDescriptor,
    IFXPDF417CodeDescriptor,
    normaliseBarcodeBytes,
    type IFXQRCodeErrorCorrectionLevel,
} from "../IFXBarcodeDescriptor";
import { finiteExtent } from "../extent";
import { fields, integer, processor, type Definition } from "./common";

const white = Object.freeze({ r: 1, g: 1, b: 1, a: 1 }), black = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });
const matrices = new WeakMap<Readonly<Record<string, unknown>>, BarcodeMatrix>();

function level(value: unknown): IFXQRCodeErrorCorrectionLevel {
    if (value !== "L" && value !== "M" && value !== "Q" && value !== "H")
        throw new TypeError("Unknown QR error-correction level.");
    return value;
}

function flag(value: unknown, label: string): boolean {
    if (typeof value !== "boolean")
        throw new TypeError(`${label} must be boolean.`);
    return value;
}

function matrixProcessor(name: string, parameters: Readonly<Record<string, unknown>>, matrix: BarcodeMatrix) {
    const { width, height, modules } = matrix;
    return processor(name, parameters, finiteExtent({ x: 0, y: 0, width, height }), position => {
        const x = Math.floor(position.x), y = Math.floor(position.y);
        return x >= 0 && y >= 0 && x < width && y < height && modules[y * width + x] ? black : white;
    }, () => []);
}

function ownMatrix(parameters: Readonly<Record<string, unknown>>, matrix: BarcodeMatrix): Readonly<Record<string, unknown>> {
    matrices.set(parameters, matrix);
    return parameters;
}

function storedMatrix(parameters: Readonly<Record<string, unknown>>): BarcodeMatrix {
    const matrix = matrices.get(parameters);
    if (!matrix)
        throw new TypeError("Validated barcode parameters required.");
    return matrix;
}

export const barcodes: Record<string, Definition> = {
    barcodeGenerator: {
        category: "generator", inputs: 0,
        normalise: value => {
            const parameters = fields(value, ["barcodeDescriptor"]), descriptor = IFXBarcodeDescriptor.fromData(parameters.barcodeDescriptor);
            const normalized = Object.freeze({ barcodeDescriptor: descriptor.toData() });
            return ownMatrix(normalized, barcodeMatrixForDescriptor(descriptor));
        },
        build: (_inputs, parameters) => {
            return matrixProcessor("barcodeGenerator", parameters, storedMatrix(parameters));
        },
    },
    qrCodeGenerator: {
        category: "generator", inputs: 0,
        normalise: value => {
            const parameters = fields(value, ["message", "correctionLevel"]);
            const normalized = Object.freeze({ message: normaliseBarcodeBytes(parameters.message, 2048), correctionLevel: level(parameters.correctionLevel) });
            return ownMatrix(normalized, encodeQRMessage(normalized.message, normalized.correctionLevel));
        },
        build: (_inputs, parameters) => matrixProcessor("qrCodeGenerator", parameters, storedMatrix(parameters)),
    },
    code128BarcodeGenerator: {
        category: "generator", inputs: 0,
        normalise: value => {
            const parameters = fields(value, ["message", "barcodeHeight", "quietSpace"]), message = normaliseBarcodeBytes(parameters.message, 256);
            if (message.some(byte => byte > 0x7f))
                throw new RangeError("Portable Code 128 accepts 7-bit message bytes.");
            const normalized = Object.freeze({ message, barcodeHeight: integer(parameters.barcodeHeight, NaN, 1, 1024), quietSpace: integer(parameters.quietSpace, NaN, 0, 512) });
            return ownMatrix(normalized, encodeCode128(normalized.message, normalized.barcodeHeight, normalized.quietSpace));
        },
        build: (_inputs, parameters) => matrixProcessor("code128BarcodeGenerator", parameters, storedMatrix(parameters)),
    },
    aztecCodeGenerator: {
        category: "generator", inputs: 0,
        normalise: value => {
            const parameters = fields(value, ["message", "correctionLevel", "layers", "compactStyle", "quietSpace"]);
            const descriptor = new IFXAztecCodeDescriptor(normaliseBarcodeBytes(parameters.message, 4096), {
                correctionLevel: integer(parameters.correctionLevel, NaN, 5, 95),
                layers: integer(parameters.layers, NaN, 1, 32),
                compactStyle: flag(parameters.compactStyle, "Aztec compact style"),
                quietSpace: integer(parameters.quietSpace, NaN, 0, 64),
            });
            const normalized = Object.freeze({
                message: Object.freeze(Array.from(descriptor.message)),
                correctionLevel: descriptor.correctionLevel,
                layers: descriptor.layers,
                compactStyle: descriptor.compactStyle,
                quietSpace: descriptor.quietSpace,
            });
            return ownMatrix(normalized, barcodeMatrixForDescriptor(descriptor));
        },
        build: (_inputs, parameters) => matrixProcessor("aztecCodeGenerator", parameters, storedMatrix(parameters)),
    },
    pdf417BarcodeGenerator: {
        category: "generator", inputs: 0,
        normalise: value => {
            const parameters = fields(value, ["message", "correctionLevel", "dataColumns", "rows", "compactStyle", "quietSpace"]);
            const descriptor = new IFXPDF417CodeDescriptor(normaliseBarcodeBytes(parameters.message, 4096), {
                correctionLevel: integer(parameters.correctionLevel, NaN, 0, 8),
                dataColumns: integer(parameters.dataColumns, NaN, 1, 30),
                rows: integer(parameters.rows, NaN, 3, 90),
                compactStyle: flag(parameters.compactStyle, "PDF417 compact style"),
                quietSpace: integer(parameters.quietSpace, NaN, 0, 64),
            });
            const normalized = Object.freeze({
                message: Object.freeze(Array.from(descriptor.message)),
                correctionLevel: descriptor.correctionLevel,
                dataColumns: descriptor.dataColumns,
                rows: descriptor.rows,
                compactStyle: descriptor.compactStyle,
                quietSpace: descriptor.quietSpace,
            });
            return ownMatrix(normalized, barcodeMatrixForDescriptor(descriptor));
        },
        build: (_inputs, parameters) => matrixProcessor("pdf417BarcodeGenerator", parameters, storedMatrix(parameters)),
    },
    dataMatrixCodeGenerator: {
        category: "generator", inputs: 0,
        normalise: value => {
            const parameters = fields(value, ["message", "rows", "columns", "quietSpace"]);
            const descriptor = new IFXDataMatrixCodeDescriptor(normaliseBarcodeBytes(parameters.message, 4096), {
                rows: integer(parameters.rows, NaN, 8, 144),
                columns: integer(parameters.columns, NaN, 8, 144),
                quietSpace: integer(parameters.quietSpace, NaN, 0, 64),
            });
            const normalized = Object.freeze({
                message: Object.freeze(Array.from(descriptor.message)),
                rows: descriptor.rows,
                columns: descriptor.columns,
                quietSpace: descriptor.quietSpace,
            });
            return ownMatrix(normalized, barcodeMatrixForDescriptor(descriptor));
        },
        build: (_inputs, parameters) => matrixProcessor("dataMatrixCodeGenerator", parameters, storedMatrix(parameters)),
    },
};
