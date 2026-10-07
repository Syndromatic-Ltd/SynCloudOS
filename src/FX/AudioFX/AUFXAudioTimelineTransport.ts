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

import type { AUFXClockObservation } from "./AUFXClockObservation";

/** A transport changes content positions; an output clock alone cannot do so. */
export type AUFXAudioTimelineCommand =
  | Readonly<{ kind: "pause" }>
  | Readonly<{ kind: "play"; rate: number }>
  | Readonly<{ kind: "seek"; positionSeconds: number }>
  | Readonly<{ kind: "rate"; rate: number }>;

export interface AUFXAudioTimelineReceipt {
  readonly version: number;
  readonly backend: "offline" | "audio-worklet";
  readonly positionSeconds: number;
  readonly audioAnchor: AUFXClockObservation | null;
}

export interface AUFXAudioTimelineTransport {
  readonly signal: AbortSignal;
  apply(command: AUFXAudioTimelineCommand): AUFXAudioTimelineReceipt | Promise<AUFXAudioTimelineReceipt>;
  dispose(): void;
}

/** Acknowledgement from the canonical processor, expressed in context frames. */
export interface AUFXAudioPlanAcknowledgement {
  readonly version: number;
  readonly contextFrame: number;
  readonly players: readonly Readonly<{ id: number; position: number }>[];
}
