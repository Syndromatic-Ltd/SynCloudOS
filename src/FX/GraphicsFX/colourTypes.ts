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

export type GFXColourSpace = "srgb" | "display-p3" | "grayscale" | "linear-srgb";
export interface GFXRGBAComponents {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
}
export interface GFXHSLAComponents {
    readonly h: number;
    readonly s: number;
    readonly l: number;
    readonly a: number;
}
/**
 * Device CMYK: the uncalibrated model of NSColor's deviceCMYK space and CSS
 * Color 5's device-cmyk(). CoreGraphics' generic CMYK converts through an ICC
 * profile, which the browser has no way to apply.
 */
export interface GFXCMYKAComponents {
    readonly c: number;
    readonly m: number;
    readonly y: number;
    readonly k: number;
    readonly a: number;
}
export interface GFXHSVAComponents {
    readonly h: number;
    readonly s: number;
    readonly v: number;
    readonly a: number;
}
export class GFXColourParseError extends Error {
    constructor(readonly input: string, readonly reason: "syntax" | "unsupported-space") {
        super(`Cannot parse colour "${input}": ${reason}.`);
        this.name = "GFXColourParseError";
    }
}
