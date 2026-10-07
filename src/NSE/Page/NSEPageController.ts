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

import {
  clampNSEPageProgress,
  createNSEPageSnapshot
} from "./nsePageGeometry";
import type {
  NSEPageCompletionReason,
  NSEPageControllerOptions,
  NSEPageControllerSnapshot,
  NSEPageTurnOptions
} from "./nsePageTypes";

type NSEPageControllerListener = (snapshot: NSEPageControllerSnapshot) => void;

export class NSEPageController {
  private snapshot: NSEPageControllerSnapshot;
  private listeners = new Set<NSEPageControllerListener>();
  private nextTurnId = 1;

  constructor(options: NSEPageControllerOptions = {}) {
    this.snapshot = createNSEPageSnapshot({
      progress: options.progress,
      phase: options.phase,
      mode: options.mode ?? "turn",
      edge: options.edge ?? "right",
      direction: options.direction ?? "forward",
      torn: options.torn
    });
  }

  subscribe(listener: NSEPageControllerListener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  setProgress(progress: number, reason: NSEPageCompletionReason = "programmatic") {
    return this.commit({
      progress: clampNSEPageProgress(progress),
      reason
    });
  }

  startTurn(options: NSEPageTurnOptions = {}) {
    return this.commit({
      progress: options.progress,
      targetProgress: options.targetProgress ?? 1,
      phase: "turning",
      mode: options.mode,
      edge: options.edge,
      direction: options.direction,
      reason: options.reason ?? "programmatic",
      turnId: options.turnId ?? this.nextTurnId++
    });
  }

  startDrag(options: NSEPageTurnOptions = {}) {
    return this.commit({
      progress: options.progress,
      targetProgress: options.targetProgress,
      phase: "dragging",
      mode: options.mode,
      edge: options.edge,
      direction: options.direction,
      reason: "gesture",
      turnId: options.turnId ?? this.nextTurnId++
    });
  }

  settle(options: NSEPageTurnOptions = {}) {
    return this.commit({
      progress: options.progress,
      targetProgress: options.targetProgress ?? options.progress,
      phase: "settling",
      reason: options.reason ?? "programmatic"
    });
  }

  complete(progress = this.snapshot.targetProgress, reason: NSEPageCompletionReason = "programmatic") {
    return this.commit({
      progress,
      targetProgress: progress,
      phase: "idle",
      reason
    });
  }

  cancel(reason: Extract<NSEPageCompletionReason, "cancel" | "superseded"> = "cancel") {
    return this.commit({
      targetProgress: 0,
      phase: "canceling",
      reason
    });
  }

  tear(options: NSEPageTurnOptions = {}) {
    return this.commit({
      progress: options.progress ?? 1,
      targetProgress: 1,
      phase: "torn",
      mode: "tear",
      edge: options.edge,
      direction: options.direction,
      torn: true,
      reason: "tear",
      turnId: options.turnId ?? this.nextTurnId++
    });
  }

  reset(options: NSEPageTurnOptions = {}) {
    return this.commit({
      progress: options.progress ?? 0,
      targetProgress: options.targetProgress ?? 0,
      phase: "idle",
      mode: options.mode,
      edge: options.edge,
      direction: options.direction,
      torn: false,
      reason: options.reason ?? "reset",
      turnId: options.turnId ?? this.snapshot.turnId
    });
  }

  private commit(partial: Partial<NSEPageControllerSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      progress: clampNSEPageProgress(partial.progress ?? this.snapshot.progress),
      targetProgress: clampNSEPageProgress(partial.targetProgress ?? this.snapshot.targetProgress),
      updatedAt: Date.now()
    };

    for (const listener of this.listeners) listener(this.snapshot);
    return this.snapshot;
  }
}
