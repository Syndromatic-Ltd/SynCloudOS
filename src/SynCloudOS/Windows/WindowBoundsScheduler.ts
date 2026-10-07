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

import type { SynCloudOSRuntimeEnvironment } from "../Runtime/runtimeInstanceTypes";
import type {
  WindowBounds,
  WindowBoundsChangeReason,
  WindowScheduledBoundsChange,
} from "./windowTypes";

export interface WindowBoundsSchedulerDependencies {
  readonly requestFrame: SynCloudOSRuntimeEnvironment["requestAnimationFrame"];
  readonly cancelFrame: SynCloudOSRuntimeEnvironment["cancelAnimationFrame"];
  readonly readBounds: (windowControllerId: string) => WindowBounds;
  readonly commit: (
    windowControllerId: string,
    bounds: WindowBounds,
    reason: WindowBoundsChangeReason,
  ) => void;
  readonly publish?: () => void;
  readonly observeError?: (error: unknown) => void;
}

interface PendingBoundsChange {
  readonly bounds: WindowBounds;
  readonly reason: WindowBoundsChangeReason;
}

interface ScheduledFrame {
  handle: unknown;
  active: boolean;
}

export interface WindowBoundsSchedulerSnapshot {
  readonly pending: readonly (readonly [string, PendingBoundsChange])[];
}

function addBounds(left: WindowBounds, right: WindowBounds): WindowBounds {
  return Object.freeze({
    x: left.x + right.x,
    y: left.y + right.y,
    width: left.width + right.width,
    height: left.height + right.height,
  });
}

export class WindowBoundsScheduler {
  readonly #pending = new Map<string, PendingBoundsChange>();
  #frame: ScheduledFrame | null = null;
  #disposed = false;

  constructor(private readonly dependencies: WindowBoundsSchedulerDependencies) {}

  schedule(windowControllerId: string, change: WindowScheduledBoundsChange): void {
    if (this.#disposed) throw new Error("WindowBoundsScheduler is disposed.");
    const pending = this.#pending.get(windowControllerId);
    const bounds = change.kind === "replace"
      ? Object.freeze({ ...change.bounds })
      : addBounds(pending?.bounds ?? this.dependencies.readBounds(windowControllerId), change.delta);
    this.#pending.set(windowControllerId, Object.freeze({ bounds, reason: change.reason }));
    if (this.#frame !== null) return;
    this.#requestFrame();
  }

  cancel(windowControllerId: string): void {
    if (this.#disposed) return;
    this.#pending.delete(windowControllerId);
    this.#cancelEmptyFrame();
  }

  flush(windowControllerId: string): void {
    if (this.#disposed) return;
    const pending = this.#pending.get(windowControllerId);
    if (!pending) return;
    this.#pending.delete(windowControllerId);
    this.#cancelEmptyFrame();
    this.dependencies.commit(windowControllerId, pending.bounds, pending.reason);
    this.dependencies.publish?.();
  }

  hasPending(windowControllerId: string): boolean {
    return this.#pending.has(windowControllerId);
  }

  freeze(): WindowBoundsSchedulerSnapshot {
    if (this.#disposed) throw new Error("WindowBoundsScheduler is disposed.");
    const frame = this.#frame;
    this.#frame = null;
    if (frame) frame.active = false;
    const pending = Object.freeze([...this.#pending.entries()].map(([id, change]) => (
      Object.freeze([id, change] as const)
    )));
    this.#pending.clear();
    if (frame !== null) this.#cancelFrame(frame.handle);
    return Object.freeze({ pending });
  }

  restore(snapshot: WindowBoundsSchedulerSnapshot): void {
    if (this.#disposed || snapshot.pending.length === 0) return;
    for (const [id, change] of snapshot.pending) this.#pending.set(id, change);
    if (this.#frame === null) this.#requestFrame();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const frame = this.#frame;
    this.#frame = null;
    if (frame) frame.active = false;
    this.#pending.clear();
    if (frame !== null) this.#cancelFrame(frame.handle);
  }

  #requestFrame(): void {
    const frame: ScheduledFrame = { handle: null, active: true };
    this.#frame = frame;
    try {
      frame.handle = this.dependencies.requestFrame(() => this.#flushAll(frame));
    } catch (error) {
      frame.active = false;
      if (this.#frame === frame) this.#frame = null;
      throw error;
    }
  }

  #flushAll(frame: ScheduledFrame): void {
    if (!frame.active || this.#frame !== frame) return;
    frame.active = false;
    this.#frame = null;
    if (this.#disposed || this.#pending.size === 0) return;
    const pending = [...this.#pending.entries()];
    this.#pending.clear();
    for (const [windowControllerId, change] of pending) {
      this.dependencies.commit(windowControllerId, change.bounds, change.reason);
    }
    this.dependencies.publish?.();
  }

  #cancelEmptyFrame(): void {
    if (this.#pending.size > 0 || this.#frame === null) return;
    const frame = this.#frame;
    this.#frame = null;
    frame.active = false;
    this.#cancelFrame(frame.handle);
  }

  #cancelFrame(frame: unknown): void {
    try { this.dependencies.cancelFrame(frame); }
    catch (error) {
      try { this.dependencies.observeError?.(error); } catch { /* diagnostics never own scheduler authority */ }
    }
  }
}
