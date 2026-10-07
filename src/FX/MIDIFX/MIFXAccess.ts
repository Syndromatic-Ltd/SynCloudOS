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

export type MIFXAuthorizationState =
  | "unknown"
  | "granted"
  | "denied"
  | "policy-denied"
  | "unavailable";

export interface MIFXCapabilities {
  readonly apiAvailable: boolean;
  readonly transportProtocol: "midi1";
  readonly authorization: MIFXAuthorizationState;
  readonly sysexAuthorization: MIFXAuthorizationState;
  readonly connectedEndpointCount: number;
}

export interface MIFXAuthorizationRequest {
  readonly sysex?: boolean;
  readonly signal?: AbortSignal;
}

export interface MIFXAuthorizationResult {
  readonly state: Exclude<MIFXAuthorizationState, "unknown">;
  readonly sysex: boolean;
}

export type MIFXEndpointDirection = "input" | "output";
export type MIFXEndpointState = "connected" | "disconnected";
export type MIFXEndpointConnection = "open" | "closed" | "pending";

export interface MIFXEndpointSnapshot {
  readonly id: string;
  readonly direction: MIFXEndpointDirection;
  readonly manufacturer: string | null;
  readonly name: string | null;
  readonly version: string | null;
  readonly state: MIFXEndpointState;
  readonly connection: MIFXEndpointConnection;
  readonly generation: number;
}

export interface MIFXInputPacket {
  readonly endpoint: MIFXEndpointSnapshot;
  readonly data: Uint8Array;
  readonly receivedAtMilliseconds: number | null;
}

export type MIFXEndpointListener = (endpoints: readonly MIFXEndpointSnapshot[]) => void;
export type MIFXInputListener = (packet: MIFXInputPacket) => void;

export interface MIFXSubscription {
  dispose(): void;
}

export interface MIFXInputSubscription extends MIFXSubscription {
  readonly endpoint: MIFXEndpointSnapshot;
}

export interface MIFXOutputLease extends MIFXSubscription {
  readonly endpoint: MIFXEndpointSnapshot;
  send(data: Uint8Array, timestampMilliseconds?: number): void;
}

export interface MIFXAccess extends MIFXSubscription {
  getCapabilities(): MIFXCapabilities;
  getEndpoints(): readonly MIFXEndpointSnapshot[];
  requestAuthorization(request?: MIFXAuthorizationRequest): Promise<MIFXAuthorizationResult>;
  subscribeEndpoints(listener: MIFXEndpointListener): MIFXSubscription;
  subscribeInput(endpoint: MIFXEndpointSnapshot, listener: MIFXInputListener): Promise<MIFXInputSubscription>;
  acquireOutput(endpoint: MIFXEndpointSnapshot): Promise<MIFXOutputLease>;
}

export interface MIFXClient {
  createAccess(signal?: AbortSignal): MIFXAccess;
}
