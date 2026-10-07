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

import type {
  MFXAttitude,
  MFXAttitudeReferenceFrame,
  MFXVector3,
} from "./MFXAttitude";
export interface MFXLogItem {
  readonly timestamp: number;
}
export interface MFXDeviceMotion extends MFXLogItem {
  readonly attitude: MFXAttitude | null;
  readonly rotationRate: MFXVector3 | null;
  readonly gravity: MFXVector3 | null;
  readonly userAcceleration: MFXVector3 | null;
  readonly referenceFrame: MFXAttitudeReferenceFrame;
}
export interface MFXAccelerometerData extends MFXLogItem {
  readonly acceleration: MFXVector3;
  readonly includesGravity: boolean;
}
export interface MFXGyroData extends MFXLogItem {
  readonly rotationRate: MFXVector3;
}
export interface MFXMotionSubscription {
  dispose(): void;
}
