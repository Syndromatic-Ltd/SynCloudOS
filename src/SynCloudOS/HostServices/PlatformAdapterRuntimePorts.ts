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

/** Runtime port contracts implemented by platform adapters. */
export type {
  RuntimeResourceBacking,
  RuntimeResourceParticipant,
} from "../Resources/RuntimeResourceLedger";
export type {
  RuntimeAnimationAdapter,
  RuntimeAnimationAdapterDiagnostics,
  RuntimeAnimationAdapterFactory,
  RuntimeAnimationAdapterLease,
  RuntimeAnimationPlayback,
  RuntimeAnimationRequest,
} from "../AnimationFX/animationTypes";
export type {
  AnimationLayerHost,
  AnimationLayerKinds,
} from "../AnimationFX/AnimationLayerHost";
export type { RuntimeAudioFilePort } from "../AudioFX/AudioFileService";
export type {
  RuntimeAudioAdapter,
  RuntimeAudioAdapterActivationClaim,
  RuntimeAudioAdapterDiagnostics,
  RuntimeAudioAdapterFactory,
  RuntimeAudioAdapterLease,
  RuntimeAudioPlayback,
  RuntimeAudioPlaybackCallbacks,
  RuntimeAudioResource,
} from "../AudioFX/audioTypes";
export type {
  HFXFeedbackAudioMode,
  HFXFeedbackInput,
  HFXFeedbackNavigatorLike,
  HFXFeedbackOptions,
  HFXFeedbackPreset,
  HFXFeedbackRequest,
  HFXFeedbackSupportSnapshot,
  HFXFeedbackTriggerOptions,
  HFXFeedbackVibration,
} from "../HapticsFX/feedbackTypes";
export type {
  MFXMotionAdapter,
  MFXRawMotionSample,
} from "../MotionFX/motionAdapterTypes";
export type {
  LFXLocationAdapter,
  LFXLocationAdapterRequest,
  MIDIAdapter,
  MIDIAdapterAuthorizationRequest,
  MIDIAdapterAuthorizationState,
  RuntimeImageSourceOrientation,
  HeavyJobAdmissionPort,
  HeavyJobLease,
  LuminaIndexBackendFactory,
  LuminaIndexMaintenanceBackend,
  LuminaIndexMaintenanceDiagnostics,
  LuminaIndexReplacementMetadata,
  LuminaWorkerQueryResultPage,
  LuminaWorkerRequest,
  LuminaWorkerResponse,
  LuminaWorkerValue,
  VFXVideoWorkerRequest,
  VFXVideoWorkerResponse,
} from "../Runtime/platformAdapterContracts";
