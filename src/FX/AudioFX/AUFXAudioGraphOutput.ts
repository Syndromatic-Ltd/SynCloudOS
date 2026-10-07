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

import type { AUFXAudioFormat } from "./AUFXAudioFormat";
import type { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
import type { AUFXClockObservation } from "./AUFXClockObservation";
import type { AUFXRenderEvent, AUFXRenderPlan } from "./AUFXAudioRenderPlan";
import type { AUFXAudioPlanAcknowledgement } from "./AUFXAudioTimelineTransport";
export interface AUFXAudioRealtimeInput { readonly nodeId: number; readonly inputIndex: number; readonly token: object; readonly capability: object; }
export interface AUFXAudioRealtimeSource {
  snapshot(): AUFXRenderPlan;
  subscribe(listener: (plan: AUFXRenderPlan) => void): () => void;
  receive(event: AUFXRenderEvent): void;
  renderFallback(frames: number): AUFXAudioPCMBuffer;
  inputs?(plan: AUFXRenderPlan): readonly AUFXAudioRealtimeInput[];
}
/** Host-only output contract. Engines keep this authority in a private field. */
export interface AUFXAudioGraphOutput {
  start(format: AUFXAudioFormat, source: AUFXAudioRealtimeSource, stopped: (error?: unknown) => void, signal: AbortSignal): Promise<void>;
  observeClock?(): AUFXClockObservation | null;
  supportsTimelineTransport?(): boolean;
  applyTimelinePlan?(plan: AUFXRenderPlan, signal: AbortSignal): Promise<AUFXAudioPlanAcknowledgement>;
  stop(): void;
  dispose(): void;
}
