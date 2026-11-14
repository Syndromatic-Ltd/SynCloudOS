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

import { NSEControllerLifetime } from "../Controllers/controllerLifetime";
import {
  clampPageProgress,
  createPageSnapshot
} from "./pageGeometry";
import type {
  PageCompletionReason,
  PageTurnControllerOptions,
  PageTurnSnapshot,
  PageTurnOptions
} from "./pageTypes";

import { pageTurnPhaseAfter } from "./pageTurnPhaseMachine";

type PageTurnListener = (snapshot: PageTurnSnapshot) => void;

export class PageTurnController {
  private snapshot: PageTurnSnapshot;
  private listeners = new Set<PageTurnListener>();
  private nextTurnId = 1;
  readonly #lifetime: NSEControllerLifetime;

  constructor(options: PageTurnControllerOptions = {}) {
    this.#lifetime = new NSEControllerLifetime(options, { kind: "NSEPage", id: "page" });
    this.snapshot = createPageSnapshot({
      progress: options.progress,
      phase: options.phase,
      mode: options.mode ?? "turn",
      edge: options.edge ?? "right",
      direction: options.direction ?? "forward",
      torn: options.torn
    });
    this.#lifetime.bind(() => this.dispose());
  }

  get isDisposed(): boolean { return this.#lifetime.isDisposed; }
  dispose(): void {
    if (!this.#lifetime.dispose()) return;
    this.listeners.clear();
  }
  subscribe(listener: PageTurnListener) {
    this.#lifetime.assertLive("subscribe");
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  setProgress(progress: number, reason: PageCompletionReason = "programmatic") {
    return this.commit({
      progress: clampPageProgress(progress),
      reason
    });
  }

  startTurn(options: PageTurnOptions = {}) {
    return this.commit({
      progress: options.progress,
      targetProgress: options.targetProgress ?? 1,
      phase: pageTurnPhaseAfter(this.snapshot.phase, "startTurn"),
      mode: options.mode,
      edge: options.edge,
      direction: options.direction,
      reason: options.reason ?? "programmatic",
      turnId: options.turnId ?? this.nextTurnId++
    });
  }

  startDrag(options: PageTurnOptions = {}) {
    return this.commit({
      progress: options.progress,
      targetProgress: options.targetProgress,
      phase: pageTurnPhaseAfter(this.snapshot.phase, "startDrag"),
      mode: options.mode,
      edge: options.edge,
      direction: options.direction,
      reason: "gesture",
      turnId: options.turnId ?? this.nextTurnId++
    });
  }

  settle(options: PageTurnOptions = {}) {
    return this.commit({
      progress: options.progress,
      targetProgress: options.targetProgress ?? options.progress,
      phase: pageTurnPhaseAfter(this.snapshot.phase, "settle"),
      reason: options.reason ?? "programmatic"
    });
  }

  complete(progress = this.snapshot.targetProgress, reason: PageCompletionReason = "programmatic") {
    return this.commit({
      progress,
      targetProgress: progress,
      phase: pageTurnPhaseAfter(this.snapshot.phase, "complete"),
      reason
    });
  }

  cancel(reason: Extract<PageCompletionReason, "cancel" | "superseded"> = "cancel") {
    return this.commit({
      targetProgress: 0,
      phase: pageTurnPhaseAfter(this.snapshot.phase, "cancel"),
      reason
    });
  }

  tear(options: PageTurnOptions = {}) {
    return this.commit({
      progress: options.progress ?? 1,
      targetProgress: 1,
      phase: pageTurnPhaseAfter(this.snapshot.phase, "tear"),
      mode: "tear",
      edge: options.edge,
      direction: options.direction,
      torn: true,
      reason: "tear",
      turnId: options.turnId ?? this.nextTurnId++
    });
  }

  reset(options: PageTurnOptions = {}) {
    return this.commit({
      progress: options.progress ?? 0,
      targetProgress: options.targetProgress ?? 0,
      phase: pageTurnPhaseAfter(this.snapshot.phase, "reset"),
      mode: options.mode,
      edge: options.edge,
      direction: options.direction,
      torn: false,
      reason: options.reason ?? "reset",
      turnId: options.turnId ?? this.snapshot.turnId
    });
  }

  private commit(partial: Partial<PageTurnSnapshot>) {
    this.#lifetime.assertLive("commit");
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      progress: clampPageProgress(partial.progress ?? this.snapshot.progress),
      targetProgress: clampPageProgress(partial.targetProgress ?? this.snapshot.targetProgress),
      updatedAt: Date.now()
    };

    for (const listener of this.listeners) listener(this.snapshot);
    return this.snapshot;
  }
}
