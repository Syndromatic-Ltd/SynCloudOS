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

import type { AUFXRenderPlan } from "./AUFXAudioRenderPlan";
export const AUFX_RENDER_MAX_FRAMES: number;
export function validateAUFXRenderPlan(plan: AUFXRenderPlan, allowBufferReferences?: boolean, allowExternal?: boolean): void;
export function createAUFXEffectRenderState(format: { sampleRate: number; channelCount: number }, effect: Readonly<Record<string, unknown>>): any;
export function renderAUFXEffectBlock(format: { sampleRate: number; channelCount: number }, effect: Readonly<Record<string, unknown>>, state: any, channels: Float32Array[], frames: number): void;
export function createAUFXFIRRenderState(format: { channelCount: number }, coefficients: readonly number[]): any;
export function renderAUFXFIRBlock(coefficients: readonly number[], state: any, channels: Float32Array[], frames: number): void;
export function createAUFXTimePitchRenderState(format: { sampleRate: number; channelCount: number }, node: Readonly<{ pitchRatio: number; timeScale: number; windowFrames: number }>): any;
export function renderAUFXTimePitchBlock(node: Readonly<{ pitchRatio: number; timeScale: number; windowFrames: number }>, state: any, channels: Float32Array[], frames: number): void;
export function renderAUFXTimePitchBuffer(format: { sampleRate: number; channelCount: number }, options: Readonly<{ pitchRatio: number; timeScale: number }>, channels: Float32Array[]): Readonly<{ frameLength: number; channels: readonly Float32Array[] }>;
export class AUFXAudioRenderRuntime {
  constructor(plan: AUFXRenderPlan, externalRenderer?: ((nodeId: number, inputs: Float32Array[][], output: Float32Array[], frames: number, sampleTime: number) => void) | null);
  readonly plan: AUFXRenderPlan;
  readonly sampleTime: number;
  readonly scratch: Map<number, Float32Array[]>;
  readonly frameCounts: Map<number, number>;
  setPlan(plan: AUFXRenderPlan, preserve?: boolean): boolean;
  setExternalRenderer(renderer: ((nodeId: number, inputs: Float32Array[][], output: Float32Array[], frames: number, sampleTime: number) => void) | null): void;
  process(frames: number, target?: Float32Array[], inputBuses?: Float32Array[][]): { channels: Float32Array[]; completed: Array<{ nodeId: number; scheduleId: number; endSampleTime: number }>; sampleTime: number; players: Array<{ id: number; position: number }> };
}
