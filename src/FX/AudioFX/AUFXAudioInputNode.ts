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

import { AUFXAudioNode } from "./AUFXAudioNode";
import type { AUFXAudioFormat } from "./AUFXAudioFormat";
import type { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
import { createAUFXRealtimeNotifier, registerAUFXRealtimeNode } from "./AUFXAudioRenderPlan";

export type AUFXAudioInputNodeState = "active" | "muted" | "interrupted" | "disposed";
export interface AUFXAudioInputSourceFormat { readonly sampleRate: number | null; readonly channelCount: number | null; }
export interface AUFXAudioInputNodePort {
  readonly state: AUFXAudioInputNodeState;
  readonly sourceFormat: AUFXAudioInputSourceFormat;
  readonly token: object;
  readonly capability: object;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

/** Session-authorized live input. Native capture handles remain in the host adapter. */
export class AUFXAudioInputNode extends AUFXAudioNode {
  readonly #port: AUFXAudioInputNodePort;
  readonly #realtime = createAUFXRealtimeNotifier();
  #removePortListener: (() => void) | null;
  constructor(format: AUFXAudioFormat, port: AUFXAudioInputNodePort) {
    super(format); this.#port = port;
    this.#removePortListener = port.subscribe(() => this.#realtime.changed());
    registerAUFXRealtimeNode(this, {
      snapshot: () => ({ kind: "input", inputIndex: -1 }),
      subscribe: listener => this.#realtime.subscribe(listener),
      input: Object.freeze({ token: port.token, capability: port.capability }),
    });
  }
  get state() { return this.#port.state; }
  get sourceFormat() { return this.#port.sourceFormat; }
  subscribe(listener: () => void) { return this.#port.subscribe(listener); }
  render(_inputs: readonly AUFXAudioPCMBuffer[], _frames: number): AUFXAudioPCMBuffer { const error = new Error("Live audio input cannot be rendered offline."); error.name = "AUFXUnsupportedOfflineInputError"; throw error; }
  dispose() { const remove = this.#removePortListener; this.#removePortListener = null; try { remove?.(); } finally { this.#port.dispose(); } }
}
