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

export type MFXAvailability =
  | "available"
  | "permission-required"
  | "denied"
  | "unavailable"
  | "suspended"
  | "disposed";
export type MFXSampleState = "no-samples" | "active" | "stale";
export interface MFXCapability {
  readonly state: MFXAvailability;
  readonly reason: string | null;
  readonly apiPresent: boolean;
  readonly samples: MFXSampleState;
}
export type MFXSensor =
  | "deviceMotion"
  | "accelerometer"
  | "gyroscope"
  | "magnetometer"
  | "headphone"
  | "altimeter"
  | "pressure"
  | "submersion"
  | "pedometer"
  | "activity"
  | "fall"
  | "clinical"
  | "historical";
export type MFXMotionCapabilities = Readonly<Record<MFXSensor, MFXCapability>>;
export interface MFXMotionAuthorization {
  requestAuthorization(): Promise<MFXAvailability>;
}
export const MFXSensors: readonly MFXSensor[] = Object.freeze([
  "deviceMotion",
  "accelerometer",
  "gyroscope",
  "magnetometer",
  "headphone",
  "altimeter",
  "pressure",
  "submersion",
  "pedometer",
  "activity",
  "fall",
  "clinical",
  "historical",
]);
