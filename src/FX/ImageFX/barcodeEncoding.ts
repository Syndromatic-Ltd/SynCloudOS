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

import { renderCode128, type Code128DrawingContext, type Code128RenderOptions } from "./barcodeCode128Adapter.mjs";
import { renderAztecCode, renderDataMatrix, renderPDF417 } from "./barcode2DAdapter.mjs";
import { qrcodegen } from "./vendor/qrcodegen";
import type { IFXQRCodeErrorCorrectionLevel } from "./IFXBarcodeDescriptor";

export interface BarcodeMatrix {
    readonly width: number;
    readonly height: number;
    readonly modules: Uint8Array;
}

const maximumCells = 1_048_576, maximumDimension = 4096;
const qrLevels = Object.freeze({ L: qrcodegen.QrCode.Ecc.LOW, M: qrcodegen.QrCode.Ecc.MEDIUM, Q: qrcodegen.QrCode.Ecc.QUARTILE, H: qrcodegen.QrCode.Ecc.HIGH });

function qrMatrix(qr: qrcodegen.QrCode): BarcodeMatrix {
    const size = qr.size;
    if (!Number.isSafeInteger(size) || size < 21 || size > 177 || size * size > maximumCells)
        throw new RangeError("QR output exceeds the portable matrix limit.");
    const modules = new Uint8Array(size * size);
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
            modules[y * size + x] = qr.getModule(x, y) ? 1 : 0;
    return Object.freeze({ width: size, height: size, modules });
}

export function encodeQRDescriptor(payload: readonly number[], version: number, mask: number, level: IFXQRCodeErrorCorrectionLevel): BarcodeMatrix {
    return qrMatrix(new qrcodegen.QrCode(version, qrLevels[level], Array.from(payload), mask));
}

export function encodeQRMessage(message: readonly number[], level: IFXQRCodeErrorCorrectionLevel): BarcodeMatrix {
    return qrMatrix(qrcodegen.QrCode.encodeSegments([qrcodegen.QrSegment.makeBytes(message)], qrLevels[level], 1, 40, -1, false));
}

type Code128Capture = { width: number; bars: Array<Readonly<{ x: number; width: number }>>; };

function code128Capture(): Code128DrawingContext<Code128Capture> {
    let width = 0;
    const bars: Array<Readonly<{ x: number; width: number }>> = [];
    return {
        scale: (x, y) => [x, y],
        measure: () => ({ width: 0, ascent: 0, descent: 0 }),
        init: (w) => { width = w; },
        line: (x0, _y0, x1, _y1, lineWidth, rgb) => {
            if (x0 !== x1 || rgb !== "000000" || !Number.isInteger(x0) || !Number.isInteger(lineWidth) || lineWidth < 1)
                throw new TypeError("Code 128 backend returned unsupported drawing data.");
            bars.push(Object.freeze({ x: Math.floor(x0 - lineWidth / 2), width: lineWidth }));
        },
        polygon: () => { throw new TypeError("Code 128 backend returned a polygon."); },
        hexagon: () => { throw new TypeError("Code 128 backend returned a hexagon."); },
        ellipse: () => { throw new TypeError("Code 128 backend returned an ellipse."); },
        fill: () => undefined,
        text: () => { throw new TypeError("Code 128 backend returned text."); },
        end: () => ({ width, bars }),
    };
}

export function encodeCode128(message: readonly number[], barcodeHeight: number, quietSpace: number): BarcodeMatrix {
    const codeAOnly = message.reduce((count, byte) => count + (byte < 32 ? 1 : 0), 0);
    const codeBOnly = message.reduce((count, byte) => count + (byte > 95 ? 1 : 0), 0);
    // Starting in A or B and SHIFTing every byte exclusive to the other set is
    // always a valid upper bound. Start/check are 11 modules and stop is 13.
    const worstWidth = (message.length + Math.min(codeAOnly, codeBOnly)) * 11 + 35 + quietSpace * 2;
    if (worstWidth > maximumDimension || worstWidth * barcodeHeight > maximumCells)
        throw new RangeError("Code 128 output exceeds the portable matrix limit.");
    const text = String.fromCharCode(...message);
    const options: Code128RenderOptions = { bcid: "code128", text, binarytext: true, includetext: false, scale: 1, height: 1 };
    const capture = renderCode128(options, code128Capture());
    if (!capture || !Number.isSafeInteger(capture.width) || capture.width < 1 || capture.width + quietSpace * 2 > maximumDimension || capture.bars.length < 1)
        throw new TypeError("Code 128 backend returned invalid dimensions.");
    const width = capture.width + quietSpace * 2;
    if (width * barcodeHeight > maximumCells)
        throw new RangeError("Code 128 output exceeds the portable matrix limit.");
    const modules = new Uint8Array(width * barcodeHeight);
    for (const bar of capture.bars) {
        if (bar.x < 0 || bar.x + bar.width > capture.width)
            throw new TypeError("Code 128 backend returned an out-of-bounds bar.");
        for (let y = 0; y < barcodeHeight; y++)
            modules.fill(1, y * width + quietSpace + bar.x, y * width + quietSpace + bar.x + bar.width);
    }
    return Object.freeze({ width, height: barcodeHeight, modules });
}

type BarcodePoint = readonly [number, number];
type MatrixCapture = {
    width: number;
    height: number;
    polygons: BarcodePoint[][];
};

interface MatrixDrawingContext {
    scale(x: number, y: number): [number, number] | null;
    measure(): { width: number; ascent: number; descent: number; };
    init(width: number, height: number): void;
    line(x0: number, y0: number, x1: number, y1: number, lineWidth: number, rgb: string): void;
    polygon(points: Array<[number, number]>): void;
    hexagon(points: Array<[number, number]>): void;
    ellipse(x: number, y: number, rx: number, ry: number, ccw: boolean): void;
    fill(rgb: string): void;
    text(): void;
    end(): BarcodeMatrix;
}

function validateMatrixDimension(value: number, label: string): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximumDimension)
        throw new RangeError(`${label} exceeds the portable barcode matrix limit.`);
    return value;
}

function copyPolygon(points: Array<[number, number]>, capture: MatrixCapture): void {
    if (!Array.isArray(points) || points.length < 3)
        throw new TypeError("Barcode backend returned an invalid polygon.");
    const owned = points.map(point => {
        if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))
            throw new TypeError("Barcode backend returned invalid polygon coordinates.");
        if (point[0] < 0 || point[1] < 0 || point[0] > capture.width || point[1] > capture.height)
            throw new TypeError("Barcode backend returned an out-of-bounds polygon.");
        return Object.freeze([point[0], point[1]]) as BarcodePoint;
    });
    capture.polygons.push(owned);
}

function rasterizePolygons(capture: MatrixCapture): Uint8Array {
    const { width, height, polygons } = capture;
    const modules = new Uint8Array(width * height);
    for (let sourceY = 0; sourceY < height; sourceY++) {
        const scanY = sourceY + .5;
        const events: Array<{ x: number; delta: number; }> = [];
        for (const polygon of polygons) {
            for (let index = 0; index < polygon.length; index++) {
                const first = polygon[index]!, second = polygon[(index + 1) % polygon.length]!;
                if (first[1] <= scanY && second[1] > scanY) {
                    const x = first[0] + (scanY - first[1]) * (second[0] - first[0]) / (second[1] - first[1]);
                    events.push({ x, delta: 1 });
                } else if (second[1] <= scanY && first[1] > scanY) {
                    const x = first[0] + (scanY - first[1]) * (second[0] - first[0]) / (second[1] - first[1]);
                    events.push({ x, delta: -1 });
                }
            }
        }
        events.sort((left, right) => left.x - right.x || left.delta - right.delta);
        let winding = 0, start = 0;
        for (let index = 0; index < events.length;) {
            const x = events[index]!.x, before = winding;
            while (index < events.length && Math.abs(events[index]!.x - x) < 1e-9)
                winding += events[index++]!.delta;
            if (before === 0 && winding !== 0)
                start = x;
            else if (before !== 0 && winding === 0) {
                const firstX = Math.max(0, Math.ceil(start - .5)), lastX = Math.min(width, Math.ceil(x - .5));
                const targetY = sourceY;
                if (lastX > firstX)
                    modules.fill(1, targetY * width + firstX, targetY * width + lastX);
            }
        }
        if (winding !== 0)
            throw new TypeError("Barcode backend returned an unclosed polygon fill.");
    }
    return modules;
}

function matrixCapture(): MatrixDrawingContext {
    const capture: MatrixCapture = { width: 0, height: 0, polygons: [] };
    let filled = false;
    return {
        scale: (x, y) => [x, y],
        measure: () => ({ width: 0, ascent: 0, descent: 0 }),
        init: (width, height) => {
            capture.width = validateMatrixDimension(width, "Barcode width");
            capture.height = validateMatrixDimension(height, "Barcode height");
            if (capture.width * capture.height > maximumCells)
                throw new RangeError("Barcode output exceeds the portable matrix limit.");
        },
        line: () => { throw new TypeError("Matrix barcode backend returned an unsupported line primitive."); },
        polygon: points => copyPolygon(points, capture),
        hexagon: () => { throw new TypeError("Matrix barcode backend returned an unsupported hexagon."); },
        ellipse: () => { throw new TypeError("Matrix barcode backend returned an unsupported ellipse."); },
        fill: rgb => {
            if (rgb !== "000000")
                throw new TypeError("Matrix barcode backend returned a non-black fill.");
            if (filled)
                throw new TypeError("Matrix barcode backend returned multiple fills.");
            filled = true;
        },
        text: () => { throw new TypeError("Matrix barcode backend returned text."); },
        end: () => {
            if (!capture.width || !capture.height || !filled || capture.polygons.length < 1)
                throw new TypeError("Matrix barcode backend returned incomplete drawing data.");
            return Object.freeze({ width: capture.width, height: capture.height, modules: rasterizePolygons(capture) });
        },
    };
}

function binaryText(message: readonly number[]): string {
    return String.fromCharCode(...message);
}

function padMatrix(matrix: BarcodeMatrix, quietSpace: number): BarcodeMatrix {
    if (!Number.isSafeInteger(quietSpace) || quietSpace < 0 || quietSpace > 64)
        throw new RangeError("Barcode quiet space is outside its supported range.");
    if (quietSpace === 0)
        return matrix;
    const width = matrix.width + quietSpace * 2, height = matrix.height + quietSpace * 2;
    if (width > maximumDimension || height > maximumDimension || width * height > maximumCells)
        throw new RangeError("Barcode output exceeds the portable matrix limit.");
    const modules = new Uint8Array(width * height);
    for (let y = 0; y < matrix.height; y++)
        modules.set(matrix.modules.subarray(y * matrix.width, (y + 1) * matrix.width), (y + quietSpace) * width + quietSpace);
    return Object.freeze({ width, height, modules });
}

export function encodeAztecMessage(message: readonly number[], correctionLevel: number, layers: number, compactStyle: boolean, quietSpace: number): BarcodeMatrix {
    const options = {
        bcid: compactStyle ? "azteccodecompact" : "azteccode",
        text: binaryText(message),
        binarytext: true as const,
        includetext: false as const,
        scale: 1 as const,
        eclevel: correctionLevel,
        layers,
    };
    return padMatrix(renderAztecCode(options, matrixCapture(), compactStyle), quietSpace);
}

export function encodePDF417Message(message: readonly number[], correctionLevel: number, dataColumns: number, rows: number, compactStyle: boolean, quietSpace: number): BarcodeMatrix {
    const options = {
        bcid: compactStyle ? "pdf417compact" : "pdf417",
        text: binaryText(message),
        binarytext: true as const,
        includetext: false as const,
        scale: 1 as const,
        eclevel: correctionLevel,
        columns: dataColumns,
        rows,
    };
    return padMatrix(renderPDF417(options, matrixCapture(), compactStyle), quietSpace);
}

export function encodeDataMatrixMessage(message: readonly number[], rows: number, columns: number, quietSpace: number): BarcodeMatrix {
    const options = {
        bcid: "datamatrix",
        text: binaryText(message),
        binarytext: true as const,
        includetext: false as const,
        scale: 1 as const,
        rows,
        columns,
    };
    return padMatrix(renderDataMatrix(options, matrixCapture()), quietSpace);
}
