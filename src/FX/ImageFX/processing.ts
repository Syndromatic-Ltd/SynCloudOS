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
import type { GFXInterpolation } from "../GraphicsFX/GFXImage";
import type { IFXExtent } from "./extent";
import type { IFXPremultipliedSample } from "./IFXSampler";
export interface ProcessingAccess {
    sample(input: number, position: GFXPoint, interpolation?: GFXInterpolation): IFXPremultipliedSample;
    /** Samples an input with transparent-black pixels outside a normalized selected source rectangle. */
    sampleWithin(input: number, position: GFXPoint, bounds: GFXRect, interpolation?: GFXInterpolation): IFXPremultipliedSample;
    /** Render-local processor state. Tokens are private to the processor that owns them. */
    getState<T>(token: object): T | undefined;
    setState<T>(token: object, value: T): T;
}
export interface ProcessingPreparationAccess extends ProcessingAccess {
    /** Checks cancellation, yields to the event loop, then checks again. */
    checkpoint(): Promise<void>;
}
export interface ImageProcessor {
    readonly name: string;
    readonly parameters: Readonly<Record<string, unknown>>;
    /** Canonical plain-data worker program for custom processors that opt into portable execution. */
    readonly portableProgram?: Readonly<Record<string, unknown>>;
    readonly extent: IFXExtent;
    readonly preparation?: Readonly<{
        readonly scope: "regional" | "global";
        readonly scratchBytes: number;
        readonly work: number;
    }>;
    evaluate(position: GFXPoint, access: ProcessingAccess): IFXPremultipliedSample;
    regions(bounds: GFXRect): readonly GFXRect[];
    prepare?(access: ProcessingPreparationAccess): Promise<void>;
}
