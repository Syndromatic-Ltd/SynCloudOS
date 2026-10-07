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

import type { GFXImage } from "../../FX/GraphicsFX/GFXImage";
import type { GFXSize } from "../../FX/GraphicsFX/GFXGeometry";
import type { RuntimeImageAdapterSource } from "../SynCloudOS";
import type { RuntimeImageSourceOrientation } from "../HostServices/PlatformAdapterRuntimePorts";

export interface BrowserDecodedImage {
  readonly src: string;
  readonly intrinsicSize: GFXSize;
  readonly density: number;
  readonly sourceOrientation?: RuntimeImageSourceOrientation;
  readonly sourceICCProfile?: Uint8Array;
  readonly byteLength: number;
  readonly corsClean: boolean;
  readonly revoke: boolean;
}

export interface BrowserImagePlatform {
  decode(source: RuntimeImageAdapterSource, signal: AbortSignal): Promise<BrowserDecodedImage>;
  readPixels?(src: string, size: GFXSize, signal: AbortSignal): Promise<GFXImage>;
  export(src: string, size: GFXSize, format: "image/png" | "image/webp", signal: AbortSignal): Promise<Uint8Array>;
  revokeObjectURL(url: string): void;
}
