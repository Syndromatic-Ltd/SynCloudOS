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

import type { GFXAlphaFormat } from "../GraphicsFX/GFXImage";
import type { GFXColourSpace } from "../GraphicsFX/colourTypes";
import type { GFXPixelSampleFormat, GFXPixelStorageFormat } from "../GraphicsFX/GFXPixelDescriptor";
import type { IFXImage } from "./IFXImage";
import type { IFXRenderDestination } from "./IFXRenderDestination";
import type { IFXRenderResult } from "./IFXRenderTask";

export type IFXRenderBackendKind = "main-cpu" | "worker-cpu" | "accelerated";
export type IFXRenderDestinationKind = "pixels" | "tiles" | "offscreen-canvas" | "encoded-blob";

export interface IFXRenderBackendCapabilities {
    readonly id: string;
    readonly kind: IFXRenderBackendKind;
    readonly accelerated: boolean;
    readonly pixelFormats: readonly GFXPixelStorageFormat[];
    /** Omitted by existing byte-only backends; explicit when extended source samples are supported. */
    readonly sampleFormats?: readonly GFXPixelSampleFormat[];
    readonly colourSpaces: readonly GFXColourSpace[];
    readonly alphaFormats: readonly GFXAlphaFormat[];
    readonly destinations: readonly IFXRenderDestinationKind[];
    readonly encodedMimeTypes: readonly ("image/png" | "image/webp")[];
    readonly graphOperations: readonly ("builtin" | "portable-kernel" | "custom-processor")[];
    /** Exact built-in operation names when a backend advertises only a bounded built-in subset. */
    readonly builtinOperations?: readonly string[];
}

export interface IFXBackendRenderOptions {
    readonly signal?: AbortSignal;
    readonly interpolation?: "nearest" | "linear";
}

export interface IFXRenderBackend {
    readonly capabilities: IFXRenderBackendCapabilities;
    canRender(image: IFXImage, destination: IFXRenderDestination): boolean;
    render(image: IFXImage, destination: IFXRenderDestination, options?: IFXBackendRenderOptions): Promise<IFXRenderResult>;
    dispose(): void;
}
