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

/** Type-only runtime contracts shared with platform adapters and host seams. */
export type {
  LFXLocationAdapter,
  LFXLocationAdapterRequest,
  LocationService,
} from "../LocationFX/LocationService";
export type {
  MIDIAdapter,
  MIDIAdapterAuthorizationRequest,
  MIDIAdapterAuthorizationState,
  MIDIService,
} from "../MIDIFX/MIDIService";
export type { RuntimeImageSourceOrientation } from "../Images/imageTypes";
export type { HeavyJobAdmissionPort, HeavyJobLease } from "../Operations/HeavyJobAdmission";
export type { LuminaIndexBackendFactory } from "../LuminaFX/LuminaIndexService";
export type {
  LuminaIndexMaintenanceBackend,
  LuminaIndexMaintenanceDiagnostics,
  LuminaIndexReplacementMetadata,
} from "../LuminaFX/LuminaIndexMaintenance";
export type {
  LuminaWorkerQueryResultPage,
  LuminaWorkerRequest,
  LuminaWorkerResponse,
  LuminaWorkerValue,
} from "../LuminaFX/luminaWorkerProtocol";
export type {
  VFXVideoWorkerRequest,
  VFXVideoWorkerResponse,
} from "../VideoFX/VideoWorkerTransport";
