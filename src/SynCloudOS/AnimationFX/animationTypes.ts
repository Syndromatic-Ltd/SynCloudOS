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
  AFXAnimationDefinition,
  AFXAnimationHandle,
} from "../../FX/AnimationFX/animationTypes";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export interface RuntimeAnimationRequest extends Required<
  Omit<AFXAnimationDefinition, "reducedMotion">
> {
  readonly target: object;
}

export interface RuntimeAnimationPlayback {
  readonly finished: Promise<"completed" | "cancelled">;
  progress(): number;
  pause(): boolean | void;
  play(): boolean | void;
  cancel(): void;
  dispose(): void;
  seek(seconds: number): void;
}

export interface RuntimeAnimationAdapterDiagnostics {
  readonly activeCount: number;
  readonly listenerCount: number;
  readonly timerCount: number;
}

export interface RuntimeAnimationAdapter {
  animate(request: RuntimeAnimationRequest): RuntimeAnimationPlayback;
  applyFinal?(request: RuntimeAnimationRequest): void;
  diagnostics(): RuntimeAnimationAdapterDiagnostics;
  dispose(): void;
}

export interface RuntimeAnimationAdapterLease {
  readonly adapter: RuntimeAnimationAdapter;
  release(): void;
}

export interface RuntimeAnimationAdapterFactory {
  acquire(
    runtimeId: SynCloudOSRuntimeId | string,
    signal: AbortSignal,
  ): RuntimeAnimationAdapterLease;
}

export interface RuntimeAnimationOwner {
  readonly appId: string;
  readonly windowControllerId?: string;
  readonly viewId: string;
}

declare const runtimeAnimationOwnerLeaseBrand: unique symbol;
export interface RuntimeAnimationOwnerLease extends RuntimeAnimationOwner {
  readonly epoch: number;
  readonly [runtimeAnimationOwnerLeaseBrand]: true;
  release(reason?: string): void;
}

export interface RuntimeAnimationDiagnostics {
  readonly activeCount: number;
  readonly pausedCount: number;
  readonly groupCount: number;
  readonly settlementCount: number;
  readonly listenerCount: number;
  readonly timerCount: number;
}

export interface RuntimeAnimationService {
  readonly runtimeId: SynCloudOSRuntimeId;
  acquireOwner(owner: RuntimeAnimationOwner): RuntimeAnimationOwnerLease;
  animate(
    target: object,
    definition: AFXAnimationDefinition,
    owner: RuntimeAnimationOwnerLease,
    generation?: number,
  ): AFXAnimationHandle;
  runGroup(
    target: object,
    definition: AFXAnimationDefinition,
    owner: RuntimeAnimationOwnerLease,
    generation?: number,
  ): AFXAnimationHandle;
  suspendOwner(appId: string): void;
  resumeOwner(appId: string): void;
  closeOwner(appId: string, reason?: string): void;
  closeWindowController(windowControllerId: string, reason?: string): void;
  cancelView(appId: string, viewId: string, reason?: string): void;
  diagnostics(): RuntimeAnimationDiagnostics;
  dispose(): void;
}
