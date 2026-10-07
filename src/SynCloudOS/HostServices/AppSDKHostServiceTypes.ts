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

/** Host-owned contracts consumed by mounted AppSDK projections. */
export type {
  AnimationLayerHost,
  AnimationLayerKinds,
} from "../AnimationFX/AnimationLayerHost";
export type { RuntimeAudioFileService } from "../AudioFX/AudioFileService";
export type { AudioGraphHostService } from "../AudioFX/AudioGraphHostService";
export type { HFXHostService } from "../HapticsFX/HapticsHostService";
export type { MotionService } from "../MotionFX/MotionService";
export type {
  LFXLocationAdapter,
  LocationService,
  MIDIAdapter,
  MIDIAdapterAuthorizationRequest,
  MIDIAdapterAuthorizationState,
  MIDIService,
} from "../Runtime/platformAdapterContracts";
export type { LuminaIndexService } from "../LuminaFX/LuminaIndexService";
export type { MediaClockService } from "../MediaFX/MediaClockService";
export type { VideoCaptureService, VideoCaptureSessionHost } from "../VideoFX/VideoCaptureService";
export type { RuntimeResourceParticipant } from "../Resources/RuntimeResourceLedger";
export type { DocumentEditAdmission } from "../Documents/documentEditAdmission";
export type { DocumentAssetPreparedEdit } from "../Documents/DocumentAssetDocumentBinding";
