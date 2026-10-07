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

import type { AUFXAudioRecorder, AUFXAudioRecorderOptions } from "./AUFXAudioRecorder";
import type { AUFXAudioFormat } from "./AUFXAudioFormat";
import type { AUFXAudioInputNode } from "./AUFXAudioInputNode";
export type AUFXAudioSessionState = "idle" | "requesting" | "authorized" | "recording" | "paused" | "interrupted" | "denied" | "unavailable" | "disposed";
export interface AUFXAudioDevice { readonly id: string; readonly kind: "input" | "output"; readonly label: string; readonly groupId: string; }
export interface AUFXAudioRoute { readonly desiredInput: string | null; readonly actualInput: string | null; readonly desiredOutput: string | null; readonly actualOutput: string | null; }
export type AUFXAudioInterruptionReason = "input-ended" | "input-device-removed" | "input-acquisition-failed" | "permission-denied" | "output-selection-failed" | "output-device-removed";
export interface AUFXAudioRouteRecoveryOptions { readonly input?: "none" | "if-authorized"; readonly output?: "none" | "retry-desired"; }
export type AUFXAudioRouteRecoveryStatus = "not-requested" | "authorization-required" | "recovered" | "unavailable";
export interface AUFXAudioRouteRecoveryResult {
  readonly reason: AUFXAudioInterruptionReason | null;
  readonly input: AUFXAudioRouteRecoveryStatus;
  readonly output: AUFXAudioRouteRecoveryStatus;
  readonly route: AUFXAudioRoute;
}
export interface AUFXAudioSessionPort {
  readonly state: AUFXAudioSessionState;
  readonly route: AUFXAudioRoute;
  readonly interruptionReason?: AUFXAudioInterruptionReason | null;
  readonly capabilities: Readonly<{ capture: boolean; inputSelection: boolean; outputSelection: boolean; mimeTypes: readonly string[] }>;
  requestRecordAuthorization(signal?: AbortSignal): Promise<void>;
  enumerateDevices(signal?: AbortSignal): Promise<readonly AUFXAudioDevice[]>;
  setPreferredInput(deviceId: string, signal?: AbortSignal): Promise<void>;
  setPreferredOutput(deviceId: string, signal?: AbortSignal): Promise<void>;
  recoverRoute?(options?: AUFXAudioRouteRecoveryOptions, signal?: AbortSignal): Promise<AUFXAudioRouteRecoveryResult>;
  createRecorder(options?: AUFXAudioRecorderOptions): AUFXAudioRecorder;
  createInputNode(format: AUFXAudioFormat): AUFXAudioInputNode;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
/** Session-scoped capture and route authority. Hosts issue this object; its port remains private. */
export class AUFXAudioSession {
  readonly #port: AUFXAudioSessionPort;
  #hasAuthorizedInput = false;
  constructor(port: AUFXAudioSessionPort) { this.#port = port; }
  get state() { return this.#port.state; }
  get route() { return this.#port.route; }
  get interruptionReason() { return this.#port.interruptionReason ?? null; }
  get capabilities() { return this.#port.capabilities; }
  async requestRecordAuthorization(signal?: AbortSignal) {
    try { await this.#port.requestRecordAuthorization(signal); this.#hasAuthorizedInput = true; }
    catch (error) { if (error instanceof DOMException && error.name === "NotAllowedError") this.#hasAuthorizedInput = false; throw error; }
  }
  enumerateDevices(signal?: AbortSignal) { return this.#port.enumerateDevices(signal); }
  async setPreferredInput(deviceId: string, signal?: AbortSignal) {
    try { await this.#port.setPreferredInput(deviceId, signal); this.#hasAuthorizedInput = true; }
    catch (error) { if (error instanceof DOMException && error.name === "NotAllowedError") this.#hasAuthorizedInput = false; throw error; }
  }
  setPreferredOutput(deviceId: string, signal?: AbortSignal) { return this.#port.setPreferredOutput(deviceId, signal); }
  async recoverRoute(options: AUFXAudioRouteRecoveryOptions = {}, signal?: AbortSignal): Promise<AUFXAudioRouteRecoveryResult> {
    if (this.#port.recoverRoute) return this.#port.recoverRoute(options, signal);
    signal?.throwIfAborted();
    const reason = this.interruptionReason;
    let input: AUFXAudioRouteRecoveryStatus = "not-requested", output: AUFXAudioRouteRecoveryStatus = "not-requested";
    if ((options.input ?? "none") === "if-authorized") {
      if (this.route.actualInput) input = "recovered";
      else if (!this.capabilities.capture) input = "unavailable";
      else if (!this.#hasAuthorizedInput) input = "authorization-required";
      else { await this.requestRecordAuthorization(signal); input = "recovered"; }
    }
    if ((options.output ?? "none") === "retry-desired") {
      const desired = this.route.desiredOutput;
      if (!desired) output = "not-requested";
      else if (!this.capabilities.outputSelection) output = "unavailable";
      else if (this.route.actualOutput === desired) output = "recovered";
      else { await this.#port.setPreferredOutput(desired, signal); output = "recovered"; }
    }
    return Object.freeze({ reason, input, output, route: this.route });
  }
  createRecorder(options?: AUFXAudioRecorderOptions) { return this.#port.createRecorder(options); }
  createInputNode(format: AUFXAudioFormat) { return this.#port.createInputNode(format); }
  subscribe(listener: () => void) { return this.#port.subscribe(listener); }
  dispose() { this.#port.dispose(); }
}
