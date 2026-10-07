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

import type { AUFXAudioNode } from "./AUFXAudioNode";

export type AUFXAutomationPlan = Readonly<{ initial: number; events: readonly Readonly<{ sampleTime: number; value: number; ramp: boolean }>[] }>;
export type AUFXScheduledBufferPlan = Readonly<{ id: number; time: number; loop: boolean; channels: readonly Float32Array[] | null }>;
type AUFXNodePlanFormat = Readonly<{ sampleRate: number; channelCount: number }>;
export type AUFXNodePlan =
  | (AUFXNodePlanFormat & Readonly<{ id: number; kind: "player"; inputs: readonly number[]; positionRevision: number; playing: boolean; position: number; rate: number; retainForTimeline?: boolean; schedules: readonly AUFXScheduledBufferPlan[] }>)
  | (AUFXNodePlanFormat & Readonly<{ id: number; kind: "mixer"; inputs: readonly number[]; muted: boolean; volume: AUFXAutomationPlan }>)
  | (AUFXNodePlanFormat & Readonly<{ id: number; kind: "effect"; inputs: readonly number[]; effect: Readonly<Record<string, unknown>> }>)
  | (AUFXNodePlanFormat & Readonly<{ id: number; kind: "fir"; inputs: readonly number[]; coefficients: readonly number[] }>)
  | (AUFXNodePlanFormat & Readonly<{ id: number; kind: "timePitch"; inputs: readonly number[]; pitchRatio: number; timeScale: number; windowFrames: number }>)
  | (AUFXNodePlanFormat & Readonly<{ id: number; kind: "input"; inputs: readonly number[]; inputIndex: number }>)
  | (AUFXNodePlanFormat & Readonly<{ id: number; kind: "external"; inputs: readonly number[] }>)
  | (AUFXNodePlanFormat & Readonly<{ id: number; kind: "connection"; inputs: readonly [number]; sourceSampleRate: number; sourceChannelCount: number; sourceBus: number; destinationBus: number; channelMap: readonly (readonly number[])[] }>);
export type AUFXRenderPlan = Readonly<{ version: number; sampleRate: number; channelCount: number; outputId: number; nodes: readonly AUFXNodePlan[]; tapIds: readonly number[] }>;
export type AUFXRenderEvent =
  | Readonly<{ type: "state"; sampleTime: number; players: readonly Readonly<{ id: number; position: number }>[] }>
  | Readonly<{ type: "complete"; nodeId: number; scheduleId: number; endSampleTime: number }>
  | Readonly<{ type: "tap"; nodeId: number; channels: readonly Float32Array[]; dropped: number }>;

type AUFXRealtimeNodePlan = Exclude<AUFXNodePlan, Readonly<{ kind: "connection" }>>;
type AUFXRealtimeNodeSnapshot<T = AUFXRealtimeNodePlan> = T extends AUFXRealtimeNodePlan ? Omit<T, "id" | "inputs" | "sampleRate" | "channelCount"> : never;
type Binding = {
  snapshot(): AUFXRealtimeNodeSnapshot;
  subscribe(listener: () => void): () => void;
  receive?(event: AUFXRenderEvent): void;
  input?: Readonly<{ token: object; capability: object }>;
};
const bindings = new WeakMap<AUFXAudioNode, Binding>();

export function registerAUFXRealtimeNode(node: AUFXAudioNode, binding: Binding) { bindings.set(node, binding); }
export function getAUFXRealtimeNode(node: AUFXAudioNode) { return bindings.get(node) ?? null; }

export function createAUFXRealtimeNotifier() {
  const listeners = new Set<() => void>();
  return {
    changed() { for (const listener of [...listeners]) listener(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
