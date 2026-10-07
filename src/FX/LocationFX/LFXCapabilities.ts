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

export type LFXAccuracy = "balanced" | "high";
export type LFXAuthorizationStatus = "unknown" | "prompt" | "granted" | "denied" | "unavailable";

export type LFXNativeOnlyCapability =
  | "precise-accuracy-authorization"
  | "background-updates"
  | "significant-change-monitoring"
  | "visits"
  | "beacons"
  | "floor-metadata"
  | "service-sessions"
  | "geofencing";

export type LFXNativeOnlyReason =
  | "native-precise-accuracy-authorization-unavailable"
  | "native-background-delivery-unavailable"
  | "native-significant-change-monitoring-unavailable"
  | "native-visit-monitoring-unavailable"
  | "native-beacon-monitoring-unavailable"
  | "native-floor-metadata-unavailable"
  | "native-service-session-unavailable"
  | "native-geofence-delivery-unavailable";

export interface LFXNativeOnlyCapabilityDisposition {
  readonly state: "unavailable-on-portable-host";
  readonly reason: LFXNativeOnlyReason;
}

function unavailable(reason: LFXNativeOnlyReason): LFXNativeOnlyCapabilityDisposition {
  return Object.freeze({ state: "unavailable-on-portable-host" as const, reason });
}

/**
 * Portable-host dispositions for Core Location facilities that browser foreground Geolocation does not provide.
 * `LFXAccuracy = "high"` remains only a request preference and does not alter these dispositions.
 */
export const LFXNativeOnlyCapabilities: Readonly<Record<LFXNativeOnlyCapability, LFXNativeOnlyCapabilityDisposition>> = Object.freeze({
  "precise-accuracy-authorization": unavailable("native-precise-accuracy-authorization-unavailable"),
  "background-updates": unavailable("native-background-delivery-unavailable"),
  "significant-change-monitoring": unavailable("native-significant-change-monitoring-unavailable"),
  visits: unavailable("native-visit-monitoring-unavailable"),
  beacons: unavailable("native-beacon-monitoring-unavailable"),
  "floor-metadata": unavailable("native-floor-metadata-unavailable"),
  "service-sessions": unavailable("native-service-session-unavailable"),
  geofencing: unavailable("native-geofence-delivery-unavailable"),
});
