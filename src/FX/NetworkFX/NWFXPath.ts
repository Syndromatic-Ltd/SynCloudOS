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

/** Browser path hints do not guarantee Internet or endpoint reachability. */
export type NWFXPathStatus = "satisfied" | "unsatisfied" | "requiresConnection";
/** Mirrors NWInterface.InterfaceType; unknown browser transport remains null. */
export type NWFXInterfaceType = "other" | "wifi" | "cellular" | "wiredEthernet" | "loopback";
export interface NWFXPath {
  readonly status: NWFXPathStatus;
  readonly interfaceType: NWFXInterfaceType | null;
  readonly isExpensive: boolean | null;
  readonly isConstrained: boolean | null;
  /** Browser Save-Data preference, not OS Low Data Mode. */
  readonly saveData: boolean | null;
  readonly effectiveType: string | null;
  readonly downlinkMegabitsPerSecond: number | null;
  readonly roundTripTimeMilliseconds: number | null;
  readonly source: "browserHint";
}
export interface NWFXCapabilities {
  readonly pathMonitoring: boolean;
  readonly networkInformation: boolean;
  readonly interfaceType: boolean;
  readonly expensive: false;
  readonly constrained: false;
  readonly authorizationPrompt: false;
}
export type NWFXAuthorizationStatus = "granted" | "denied" | "unavailable";
