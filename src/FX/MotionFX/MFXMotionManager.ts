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

import type { MFXAttitudeReferenceFrame } from "./MFXAttitude";
import type {
  MFXAvailability,
  MFXMotionCapabilities,
  MFXMotionAuthorization,
} from "./MFXMotionCapabilities";
import type {
  MFXAccelerometerData,
  MFXDeviceMotion,
  MFXGyroData,
  MFXMotionSubscription,
} from "./MFXDeviceMotion";
import type { MFXMotionRecorder } from "./MFXMotionRecorder";

export interface MFXMotionManager extends MFXMotionAuthorization {
  readonly capabilities: MFXMotionCapabilities;
  readonly deviceMotion: MFXDeviceMotion | null;
  readonly accelerometerData: MFXAccelerometerData | null;
  readonly gyroData: MFXGyroData | null;
  readonly accelerometerUpdateInterval: number;
  readonly gyroUpdateInterval: number;
  setAccelerometerUpdateInterval(seconds: number): void;
  setGyroUpdateInterval(seconds: number): void;
  readonly deviceMotionUpdateInterval: number;
  readonly observedUpdateInterval: number | null;
  setDeviceMotionUpdateInterval(seconds: number): void;
  startDeviceMotionUpdates(
    options: Readonly<{
      referenceFrame: MFXAttitudeReferenceFrame;
      signal?: AbortSignal;
    }>,
    handler: (sample: MFXDeviceMotion) => void,
  ): MFXMotionSubscription;
  startAccelerometerUpdates(
    handler: (sample: MFXAccelerometerData) => void,
    signal?: AbortSignal,
  ): MFXMotionSubscription;
  startGyroUpdates(
    handler: (sample: MFXGyroData) => void,
    signal?: AbortSignal,
  ): MFXMotionSubscription;
  stopDeviceMotionUpdates(): void;
  stopAccelerometerUpdates(): void;
  stopGyroUpdates(): void;
  resetReferenceFrame(): void;
  createRecorder(
    options?: Readonly<{
      maximumSamples?: number;
      maximumAge?: number;
      signal?: AbortSignal;
    }>,
  ): MFXMotionRecorder;
  requestAuthorization(): Promise<MFXAvailability>;
  dispose(): void;
}
export interface MFXMotionClient {
  createManager(signal?: AbortSignal): MFXMotionManager;
}
