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

import type { AUFXAudioEngine } from "../AudioFX/AUFXAudioEngine";
import type { AUFXAudioPlayerNode } from "../AudioFX/AUFXAudioPlayerNode";
import type { MEFXTime } from "../MediaFX/MEFXTime";
import type { MEFXTimebase } from "../MediaFX/MEFXTimebase";
import type { VFXFrame } from "./VFXFrame";

export type VFXPresentationEnqueueResult = "queued" | "queue-full";
export type VFXPresentationAction = "idle" | "wait" | "present" | "drop" | "end-of-stream";

export interface VFXPresentationTickResult {
  readonly action: VFXPresentationAction;
  readonly reason?: "audio-unanchored" | "audio-discontinuity" | "frame-early" | "renderer-busy" | "paused" | "presentation-invalidated" | "loop-boundary" | "audio-transport-pending";
  /** Skew measured at dispatch, not a measurement of display/audio hardware onset. */
  readonly skewSeconds?: number;
}

export interface VFXPresentationContext {
  readonly generation: number;
  /** Check immediately before committing asynchronous renderer output. */
  readonly signal: AbortSignal;
}

export interface VFXPresentationDiagnostics {
  readonly generation: number;
  readonly queuedFrames: number;
  readonly inFlightFrames: number;
  readonly audioTransportPending: boolean;
  readonly droppedFrames: number;
  readonly maximumAbsoluteSkewSeconds: number;
}

export interface VFXPresentationCommonOptions {
  /** Direct clock source required; control playback through this coordinator while owned. */
  readonly timebase: MEFXTimebase;
  readonly toleranceSeconds?: number;
  /** Waiting frame bound; at most one additional frame is borrowed by present. */
  readonly maximumQueuedFrames?: number;
  /**
   * The frame remains borrowed until the returned promise settles. Honour the
   * context signal before publishing; cancellation cannot undo a committed draw.
   */
  readonly present: (frame: VFXFrame, context: VFXPresentationContext) => void | Promise<void>;
}

/** The legacy A/V form remains valid; media mode never acquires an audio graph. */
export type VFXPresentationCoordinatorOptions = VFXPresentationCommonOptions & (
  | {
    readonly mode?: "audio";
    readonly audioEngine: AUFXAudioEngine;
    /** Defaults to the sole connected player. Multiple players require explicit selection. */
    readonly audioPlayers?: readonly AUFXAudioPlayerNode[];
  }
  | {
    readonly mode: "media";
    readonly audioEngine?: never;
    readonly audioPlayers?: never;
  }
);

export interface VFXPresentationCoordinator {
  readonly diagnostics: VFXPresentationDiagnostics;
  reanchorAudio(): number;
  enqueue(frame: VFXFrame): VFXPresentationEnqueueResult;
  /**
   * Live transitions settle after the audio worklet applies the revision.
   * Only forward player/mixer graphs are supported; stateful effects and
   * resampling graphs cannot yet flush their pre-seek history selectively.
   */
  pause(): Promise<void>;
  play(): Promise<void>;
  setRate(numerator: bigint, denominator?: bigint): Promise<void>;
  setLoop(loop: Readonly<{ start: MEFXTime; end: MEFXTime }> | null): void;
  seek(position: MEFXTime): Promise<void>;
  tick(): Promise<VFXPresentationTickResult>;
  end(): void;
  dispose(): void;
}
