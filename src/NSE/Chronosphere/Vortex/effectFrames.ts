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

/** A view subscribes to its owner's frame source; it never creates a clock. */
export interface EffectFrameSource {
  now(): number;
  requestFrame(callback: (timestamp: number) => void): () => void;
  readonly reducedMotion: boolean;
  readonly suspended: boolean;
  subscribeState?(callback: () => void): () => void;
}

export function observeEffectFrames(
  frames: EffectFrameSource,
  draw: (time: number, deltaMs: number, staticFrame: boolean) => boolean,
) {
  let disposed = false;
  let cancel: (() => void) | null = null;
  const cancelPending = () => { cancel?.(); cancel = null; };
  let previous = frames.suspended ? 0 : frames.now();
  const tick = (time: number) => {
    cancel = null;
    if (disposed || frames.suspended) return;
    const delta = Math.max(0, Math.min(100, time - previous));
    previous = time;
    const keepPlaying = draw(time, delta, frames.reducedMotion);
    if (!disposed && keepPlaying && !frames.reducedMotion && !frames.suspended)
      cancel = frames.requestFrame(tick);
  };
  const wake = () => {
    if (disposed) return;
    cancelPending();
    if (frames.suspended) return;
    previous = frames.now();
    if (frames.reducedMotion) tick(previous);
    else cancel = frames.requestFrame(tick);
  };
  const unsubscribe = frames.subscribeState?.(wake);
  try { wake(); }
  catch (error) { disposed = true; cancelPending(); unsubscribe?.(); throw error; }
  return {
    wake,
    dispose() { disposed = true; cancelPending(); unsubscribe?.(); },
  };
}
