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

export type VFXCaptureKind = "camera" | "display";
export type VFXCaptureState =
  | "idle"
  | "requesting"
  | "active"
  | "suspended"
  | "interrupted"
  | "denied"
  | "failed"
  | "unavailable"
  | "disposed";

export interface VFXCaptureCapabilities {
  readonly camera: boolean;
  readonly display: boolean;
  readonly deviceEnumeration: boolean;
}

export interface VFXCaptureDevice {
  readonly id: string;
  readonly groupId: string | null;
  readonly kind: "camera";
  readonly label: string | null;
}

export interface VFXCaptureSettings {
  readonly kind: VFXCaptureKind;
  readonly deviceId: string | null;
  readonly groupId: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly frameRate: number | null;
  readonly aspectRatio: number | null;
  readonly facingMode: string | null;
  readonly displaySurface: string | null;
}

export interface VFXCameraCaptureRequest {
  readonly deviceId?: string;
  readonly width?: number;
  readonly height?: number;
  readonly frameRate?: number;
  readonly signal?: AbortSignal;
}

export interface VFXDisplayCaptureRequest {
  readonly width?: number;
  readonly height?: number;
  readonly frameRate?: number;
  readonly signal?: AbortSignal;
}

export interface VFXCaptureSession {
  readonly state: VFXCaptureState;
  readonly kind: VFXCaptureKind | null;
  readonly settings: VFXCaptureSettings | null;
  readonly capabilities: VFXCaptureCapabilities;
  enumerateDevices(): Promise<readonly VFXCaptureDevice[]>;
  requestCamera(request?: VFXCameraCaptureRequest): Promise<VFXCaptureSettings>;
  requestDisplay(request?: VFXDisplayCaptureRequest): Promise<VFXCaptureSettings>;
  suspend(): void;
  resume(): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

import type { VFXDecoderCapability, VFXDecoderConfigInput } from "./VFXCodecCapabilities";
import type { VFXDecoderState } from "./VFXDecoder";
import type { VFXEncodedChunk } from "./VFXEncodedChunk";
import type {
  VFXEncoderCapability,
  VFXEncoderConfigInput,
  VFXEncoderOutputMetadata,
  VFXEncoderState,
} from "./VFXEncoder";
import type { VFXFrame } from "./VFXFrame";
import type { VFXFrameProcessor, VFXFrameProcessorOptions } from "./VFXFrameProcessor";
import type { VFXPresentationCoordinator, VFXPresentationCoordinatorOptions } from "./VFXPresentation";

export interface VFXMountedDecoderOptions {
  readonly output: (frame: VFXFrame) => void | Promise<void>;
  /** Browser WebCodecs only: preserve the decoded surface for a GPU consumer. */
  readonly outputStorage?: "pixels" | "video-surface";
  readonly error?: (error: unknown) => void;
  readonly maximumPendingOutputs?: number;
  readonly maximumDecodeQueueSize?: number;
}

export interface VFXDecoderSession {
  readonly state: VFXDecoderState;
  readonly generation: number;
  readonly pendingOutputCount: number;
  configure(input: VFXDecoderConfigInput): void;
  decode(chunk: VFXEncodedChunk): void;
  flush(): Promise<void>;
  reset(): void;
  dispose(): void;
}

export interface VFXMountedEncoderOptions {
  readonly output: (chunk: VFXEncodedChunk, metadata: VFXEncoderOutputMetadata) => void | Promise<void>;
  readonly error?: (error: unknown) => void;
  readonly maximumPendingOutputs?: number;
  readonly maximumEncodeQueueSize?: number;
}

export interface VFXEncoderSession {
  readonly state: VFXEncoderState;
  readonly generation: number;
  readonly pendingOutputCount: number;
  configure(input: VFXEncoderConfigInput): Promise<void>;
  encode(frame: VFXFrame, options?: Readonly<{ keyFrame?: boolean }>): void;
  flush(): Promise<void>;
  reset(): void;
  dispose(): void;
}

export type VFXFrameProcessorSession = Pick<VFXFrameProcessor, "process" | "processTiled" | "draw" | "drawText" | "dispose">;
export type VFXMountedFrameProcessorOptions = Pick<VFXFrameProcessorOptions, "maximumRetainedBytes">;

export interface VFXVideoClient {
  createCaptureSession(signal?: AbortSignal): VFXCaptureSession;
  queryDecoder(input: VFXDecoderConfigInput, signal?: AbortSignal): Promise<VFXDecoderCapability>;
  createDecoder(options: VFXMountedDecoderOptions, signal?: AbortSignal): VFXDecoderSession;
  queryEncoder(input: VFXEncoderConfigInput, signal?: AbortSignal): Promise<VFXEncoderCapability>;
  createEncoder(options: VFXMountedEncoderOptions, signal?: AbortSignal): VFXEncoderSession;
  createFrameProcessor(options?: VFXMountedFrameProcessorOptions, signal?: AbortSignal): VFXFrameProcessorSession;
  createPresentationCoordinator(options: VFXPresentationCoordinatorOptions, signal?: AbortSignal): VFXPresentationCoordinator;
}
