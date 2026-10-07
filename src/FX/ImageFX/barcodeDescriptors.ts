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

export interface IFXAztecCodeDescriptorOptions {
    readonly correctionLevel: number;
    readonly layers: number;
    readonly compactStyle: boolean;
    readonly quietSpace: number;
}

export interface IFXPDF417CodeDescriptorOptions {
    readonly correctionLevel: number;
    readonly dataColumns: number;
    readonly rows: number;
    readonly compactStyle: boolean;
    readonly quietSpace: number;
}

export interface IFXDataMatrixCodeDescriptorOptions {
    readonly rows: number;
    readonly columns: number;
    readonly quietSpace: number;
}

const squareSizes = Object.freeze([10, 12, 14, 16, 18, 20, 22, 24, 26, 32, 36, 40, 44, 48, 52, 64, 72, 80, 88, 96, 104, 120, 132, 144]);
const rectangularSizes = Object.freeze([
    Object.freeze([8, 18]), Object.freeze([8, 32]), Object.freeze([12, 26]),
    Object.freeze([12, 36]), Object.freeze([16, 36]), Object.freeze([16, 48]),
]);

export function isSupportedDataMatrixSize(rows: number, columns: number): boolean {
    return rows === columns && squareSizes.includes(rows)
        || rectangularSizes.some(size => size[0] === rows && size[1] === columns);
}
