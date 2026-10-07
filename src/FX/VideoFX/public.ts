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

export { VFXVideoFormat } from "./VFXVideoFormat";
export type {
  VFXPixelFormat,
  VFXYUVMatrix,
  VFXPlaneLayout,
  VFXPixelAspectRatio,
  VFXVideoFormatInit,
} from "./VFXVideoFormat";
export { VFXPixelBuffer, VFXPixelBufferPool } from "./VFXPixelBuffer";
export type { VFXPixelBufferPoolOptions, VFXPixelBufferPoolDiagnostics } from "./VFXPixelBuffer";
export { VFXFrame } from "./VFXFrame";
export type { VFXFrameInit } from "./VFXFrame";
export { VFXFrameProcessor, VFXFrameProcessingGraph } from "./VFXFrameProcessor";
export type {
  VFXFrameOwnershipMode,
  VFXFrameProcessDiagnostics,
  VFXFrameProcessOptions,
  VFXFrameProcessResult,
  VFXFrameProcessorOptions,
  VFXFrameTiledProcessOptions,
} from "./VFXFrameProcessor";
export { VFXEncodedChunk } from "./VFXEncodedChunk";
export type { VFXEncodedChunkInit, VFXEncodedChunkType, VFXWebCodecsTiming } from "./VFXEncodedChunk";
export { VFXEncoder, VFXEncoderCapabilities, normalizeVFXEncoderConfig } from "./VFXEncoder";
export type {
  VFXEncoderAlphaMode,
  VFXEncoderBackend,
  VFXEncoderBackendCallbacks,
  VFXEncoderCapability,
  VFXEncoderCapabilityProbe,
  VFXEncoderConfig,
  VFXEncoderConfigInput,
  VFXEncoderDecoderConfig,
  VFXEncoderFrameOptions,
  VFXEncoderHardwareAcceleration,
  VFXEncoderLatencyMode,
  VFXEncoderOptions,
  VFXEncoderOutputMetadata,
  VFXEncoderState,
} from "./VFXEncoder";
export type {
  VFXEncoderSession,
  VFXFrameProcessorSession,
  VFXMountedFrameProcessorOptions,
  VFXMountedEncoderOptions,
} from "./VFXCaptureSession";
export { VFXContainerWriter } from "./VFXContainerWriter";
export type {
  VFXContainerBackend,
  VFXContainerBackendWriter,
  VFXContainerByteSink,
  VFXContainerCapability,
  VFXAudioContainerTrack,
  VFXContainerTrack,
  VFXVideoContainerTrack,
  VFXContainerWriterDiagnostics,
  VFXContainerWriterOptions,
  VFXContainerWriterState,
} from "./VFXContainerWriter";
export { VFXContainerReader } from "./VFXContainerReader";
export type {
  VFXContainerBackendReadSession,
  VFXContainerReadLimits,
  VFXContainerReadResult,
  VFXContainerReadableBackend,
  VFXContainerReaderOptions,
  VFXContainerSeekPoint,
} from "./VFXContainerReader";
export { VFXCodecCapabilities } from "./VFXCodecCapabilities";
export type {
  VFXCodecCapabilityProbe,
  VFXDecoderCapability,
  VFXDecoderConfig,
  VFXDecoderConfigInput,
  VFXHardwareAcceleration,
} from "./VFXCodecCapabilities";
export { VFXDecoder } from "./VFXDecoder";
export type {
  VFXDecoderBackend,
  VFXDecoderBackendCallbacks,
  VFXDecoderOptions,
  VFXDecoderState,
} from "./VFXDecoder";
export type {
  VFXCameraCaptureRequest,
  VFXCaptureCapabilities,
  VFXCaptureDevice,
  VFXCaptureKind,
  VFXCaptureSession,
  VFXCaptureSettings,
  VFXCaptureState,
  VFXDecoderSession,
  VFXDisplayCaptureRequest,
  VFXMountedDecoderOptions,
  VFXVideoClient,
} from "./VFXCaptureSession";
export type {
  VFXPresentationAction,
  VFXPresentationContext,
  VFXPresentationCoordinator,
  VFXPresentationCoordinatorOptions,
  VFXPresentationDiagnostics,
  VFXPresentationEnqueueResult,
  VFXPresentationTickResult,
} from "./VFXPresentation";
