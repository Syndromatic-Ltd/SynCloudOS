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

import { defineStateMachine } from "../../Foundation/internal/StateMachine";

export type MultiSwitchSettlementState = "awaitingFirstFrame" | "awaitingPresentationFrame" | "settling" | "finished";
export type MultiSwitchSettlementEvent = "framePainted" | "timedOut" | "cancel";

/** How a MultiSwitch waits to settle: a frame for the stage to mount, a frame for it to paint, then a bounded wait. */
export const multiSwitchSettlementMachine = defineStateMachine<MultiSwitchSettlementState, MultiSwitchSettlementEvent>({
  initial: "awaitingFirstFrame",
  states: {
    awaitingFirstFrame: { framePainted: "awaitingPresentationFrame", cancel: "finished" },
    awaitingPresentationFrame: { framePainted: "settling", cancel: "finished" },
    settling: { timedOut: "finished", cancel: "finished" },
    finished: {},
  },
});

export interface MultiSwitchSettlementClock {
  requestAnimationFrame(callback: () => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface MultiSwitchSettlement {
  readonly state: MultiSwitchSettlementState;
  cancel(): void;
}

/** Starts the wait. `onTimedOut` runs only if the switch is still current after both frames and the full wait. */
export function beginMultiSwitchSettlement(options: {
  readonly clock: MultiSwitchSettlementClock;
  readonly settleAfterMs: number;
  readonly stillSwitching: () => boolean;
  readonly onTimedOut: () => void;
}): MultiSwitchSettlement {
  const { clock } = options;
  const machine = multiSwitchSettlementMachine.create();
  // Each waiting state holds exactly one frame or timer; this releases whichever is held.
  let release: (() => void) | null = null;
  const cancel = () => {
    if (!machine.send("cancel")) return;
    release?.();
    release = null;
  };
  const awaitFrame = (then: () => void) => {
    const handle = clock.requestAnimationFrame(() => {
      release = null;
      if (!options.stillSwitching()) { cancel(); return; }
      machine.send("framePainted");
      then();
    });
    release = () => clock.cancelAnimationFrame(handle);
  };
  awaitFrame(() => awaitFrame(() => {
    const handle = clock.setTimeout(() => {
      release = null;
      if (machine.send("timedOut")) options.onTimedOut();
    }, options.settleAfterMs);
    release = () => clock.clearTimeout(handle);
  }));
  return { get state() { return machine.state; }, cancel };
}
