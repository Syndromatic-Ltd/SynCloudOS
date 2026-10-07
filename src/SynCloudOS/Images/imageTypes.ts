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
import type { GFXIdentifierIssuer } from "../../FX/GraphicsFX/identifierAuthority";
import type { DocumentResourceDescriptor } from "../Documents";
import type { GFXSize } from "../../FX/GraphicsFX/GFXGeometry";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export type RuntimeImageCapability = "image.decode" | "image.export";
export interface RuntimeImagePolicySubject {
  readonly appId: string;
  readonly capability: RuntimeImageCapability;
  readonly windowControllerId?: string;
  readonly documentId?: string;
}

export type RuntimeImageBinaryMimeType = "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/svg+xml";
export type RuntimeImageRenderingMode = "original" | "template";
export type RuntimeImageResizingMode = "stretch" | "tile" | "cap-insets";
export type RuntimeImageSourceOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface RuntimeImageCapInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type RuntimeImageSource =
  | Readonly<{ kind: "url"; url: string; cors: "none" | "anonymous" | "use-credentials" }>
  | Readonly<{ kind: "app-asset"; path: string }>
  | Readonly<{ kind: "bytes"; mimeType: RuntimeImageBinaryMimeType; bytes: Uint8Array }>
  | Readonly<{ kind: "generated-svg"; svg: string; intrinsicSize?: GFXSize; density?: number }>
  | Readonly<{ kind: "document-resource"; documentId: string; descriptor: DocumentResourceDescriptor }>;

export type RuntimeImageAdapterSource =
  | Readonly<{ kind: "url"; url: string; cors: "none" | "anonymous" | "use-credentials" }>
  | Readonly<{ kind: "bytes"; mimeType: RuntimeImageBinaryMimeType; bytes: Uint8Array }>;

export interface RuntimeImageDecodeRequest {
  readonly cacheKey: string;
  readonly source: RuntimeImageAdapterSource;
  readonly signal: AbortSignal;
}

export interface RuntimeDecodedImageLease {
  readonly src: string;
  readonly intrinsicSize: GFXSize;
  readonly density: number;
  /** Encoded-source EXIF value; pixels may already be display-oriented by the decoder. */
  readonly sourceOrientation?: RuntimeImageSourceOrientation;
  readonly sourceICCProfile?: Uint8Array;
  readonly byteLength: number;
  readonly corsClean: boolean;
  release(): void;
}

export interface RuntimeImageAdapter {
  decode(request: RuntimeImageDecodeRequest): Promise<RuntimeDecodedImageLease>;
  readPixels?(lease: RuntimeDecodedImageLease, signal: AbortSignal): Promise<GFXImage>;
  export(lease: RuntimeDecodedImageLease, format: "image/png" | "image/webp", signal: AbortSignal): Promise<Uint8Array>;
  dispose(): void;
}

export interface RuntimeImageAdapterLease { readonly adapter: RuntimeImageAdapter; release(): void }
export interface RuntimeImageAdapterFactory {
  acquire(runtimeId: SynCloudOSRuntimeId, signal: AbortSignal): RuntimeImageAdapterLease;
}

export interface RuntimeImageLoadRequest {
  readonly subject: RuntimeImagePolicySubject;
  readonly source: RuntimeImageSource;
  readonly accessibleLabel?: string;
  readonly renderingMode?: RuntimeImageRenderingMode;
  readonly tintColour?: string;
  readonly capInsets?: RuntimeImageCapInsets;
  readonly resizingMode?: RuntimeImageResizingMode;
}
export interface RuntimeImagePolicyRequest {
  readonly subject: RuntimeImagePolicySubject;
  readonly source: RuntimeImageSource;
  readonly operation: "decode" | "export";
}
export interface RuntimeImageAuthorisationPort {
  authorise(request: RuntimeImagePolicyRequest, signal: AbortSignal): boolean | Promise<boolean>;
}

export type RuntimeImageResourceState = "loading" | "ready" | "failed" | "released";
export interface RuntimeImageResource {
  readonly state: RuntimeImageResourceState;
  readonly revision: number;
  readonly src: string;
  readonly intrinsicSize: GFXSize | null;
  readonly density: number | null;
  readonly sourceOrientation: RuntimeImageSourceOrientation | null;
  /** Owned copy of the encoded source profile, if present; decoded pixels are sRGB. */
  readonly sourceICCProfile: Uint8Array | null;
  readonly accessibleLabel: string;
  readonly renderingMode: RuntimeImageRenderingMode;
  readonly tintColour: string | null;
  readonly capInsets: RuntimeImageCapInsets | null;
  readonly resizingMode: RuntimeImageResizingMode;
  readonly ready: Promise<void>;
  subscribe(listener: () => void): () => void;
  release(): void;
}

export interface RuntimeImageDiagnostics {
  readonly activeOperationCount: number;
  readonly activeReferenceCount: number;
  readonly decodedEntryCount: number;
  readonly decodedByteCount: number;
}

export interface RuntimeImageService {
  readonly runtimeId: SynCloudOSRuntimeId;
  createGraphicsIdentifierIssuer(): GFXIdentifierIssuer;
  load(request: RuntimeImageLoadRequest): RuntimeImageResource;
  /** Runtime-internal lifecycle seam. Resolves only after the activation's
   * adapter work has settled, including after the public resource is released. */
  whenActivationSettled(resource: RuntimeImageResource): Promise<void>;
  readPixels(resource: RuntimeImageResource, signal?: AbortSignal): Promise<GFXImage>;
  export(resource: RuntimeImageResource, format: "image/png" | "image/webp", signal?: AbortSignal): Promise<Uint8Array>;
  diagnostics(): RuntimeImageDiagnostics;
  dispose(): void;
}
