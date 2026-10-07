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

import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export type RuntimeAudioState = "ready" | "playing" | "paused" | "stopped" | "error" | "released";

export interface RuntimeAudioOwner {
  readonly appId: string;
  readonly ownerId: string;
  readonly windowControllerId?: string;
  readonly generation?: number;
}

export interface RuntimeAudioLoadRequest extends RuntimeAudioOwner {
  readonly source: string;
  readonly loop?: boolean;
  readonly volume?: number;
}

export interface RuntimeAudioHandle {
  readonly id: string;
  readonly appId: string;
  readonly ownerId: string;
  readonly windowControllerId?: string;
  readonly generation: number;
  readonly source: string;
  readonly state: RuntimeAudioState;
  readonly loop: boolean;
  readonly volume: number;
  readonly rate: number;
  readonly duration: number | null;
  readonly currentTime: number;
}

declare const runtimeAudioActivationBrand: unique symbol;
export interface RuntimeAudioActivationToken {
  readonly handleId: string;
  readonly sequence: number;
  readonly [runtimeAudioActivationBrand]: true;
}

declare const runtimeAudioAdapterActivationBrand: unique symbol;
export interface RuntimeAudioAdapterActivationClaim {
  readonly [runtimeAudioAdapterActivationBrand]: true;
}

export interface RuntimeAudioResource {
  readonly id: string;
  readonly source: string;
  readonly byteLength: number;
  readonly mimeType: string;
}

export interface RuntimeAudioPlaybackCallbacks {
  readonly onEnded: (playEpoch: number) => void;
  readonly onError: (playEpoch: number, error: Error) => void;
}

export interface RuntimeAudioPlayback {
  play(activation: RuntimeAudioAdapterActivationClaim | null, playEpoch: number): Promise<void>;
  pause(): void;
  stop(): void;
  setLoop(loop: boolean): void;
  setVolume(volume: number): void;
  setRate(rate: number): void;
  setCurrentTime(time: number): void;
  duration(): number | null;
  currentTime(): number;
  dispose(): void;
}

export interface RuntimeAudioAdapterDiagnostics {
  readonly resourceCount: number;
  readonly objectURLCount: number;
  readonly playbackCount: number;
  readonly listenerCount: number;
  readonly activationCount: number;
}

export interface RuntimeAudioAdapter {
  claimActivation(ownerKey: string): RuntimeAudioAdapterActivationClaim | null;
  loadResource(source: string, signal: AbortSignal): Promise<RuntimeAudioResource>;
  releaseResource(resource: RuntimeAudioResource): void;
  createPlayback(resource: RuntimeAudioResource, callbacks: RuntimeAudioPlaybackCallbacks): RuntimeAudioPlayback;
  diagnostics(): RuntimeAudioAdapterDiagnostics;
  dispose(): void;
}

export interface RuntimeAudioAdapterLease {
  readonly adapter: RuntimeAudioAdapter;
  release(): void;
}

export interface RuntimeAudioAdapterFactory {
  acquire(runtimeId: SynCloudOSRuntimeId | string, signal: AbortSignal): RuntimeAudioAdapterLease;
}

export interface RuntimeAudioDiagnostics extends RuntimeAudioAdapterDiagnostics {
  readonly handleCount: number;
  readonly playingCount: number;
  readonly pendingLoadCount: number;
  readonly cacheEntryCount: number;
  readonly activationCount: number;
}

export interface RuntimeAudioMixerSnapshot {
  readonly masterVolume: number;
  readonly enabled: boolean;
  readonly applications: readonly { readonly appId: string; readonly volume: number; readonly sessionCount: number }[];
}

export interface RuntimeAudioService {
  getOwnerPolicy(appId: string): Readonly<{ volume: number; muted: boolean; paused: boolean }>;
  getMixerSnapshot(): RuntimeAudioMixerSnapshot;
  subscribeMixer(listener: () => void): () => void;
  setMasterVolume(volume: number): void;
  setAppVolume(appId: string, volume: number): void;
  setMixerLevels(masterVolume: number, appVolumes: Readonly<Record<string, number>>): void;
  readonly runtimeId: SynCloudOSRuntimeId;
  load(request: RuntimeAudioLoadRequest, signal?: AbortSignal): Promise<RuntimeAudioHandle>;
  activation(handleId: string): RuntimeAudioActivationToken;
  play(handleId: string, activation: RuntimeAudioActivationToken): Promise<void>;
  resume(handleId: string, activation: RuntimeAudioActivationToken): Promise<void>;
  pause(handleId: string): boolean;
  stop(handleId: string): boolean;
  setLoop(handleId: string, loop: boolean): void;
  setVolume(handleId: string, volume: number): void;
  setRate(handleId: string, rate: number): void;
  setCurrentTime(handleId: string, time: number): void;
  release(handleId: string, reason?: string): boolean;
  suspendOwner(appId: string): void;
  resumeOwner(appId: string): void;
  closeOwner(appId: string, reason?: string): void;
  closeWindowController(windowControllerId: string, reason?: string): void;
  setEnabled(enabled: boolean): void;
  setReducedSensory(reduced: boolean): void;
  diagnostics(): RuntimeAudioDiagnostics;
  dispose(): void;
}

