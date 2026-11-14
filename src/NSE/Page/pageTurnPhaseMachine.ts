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

import { defineStateMachine, nextState } from "../../Foundation/internal/StateMachine";
import type { PagePhase } from "./pageTypes";

export type PageTurnEvent = "startTurn" | "startDrag" | "settle" | "complete" | "cancel" | "tear" | "reset";

const anyPhase = { startTurn: "turning", startDrag: "dragging", settle: "settling", complete: "idle", cancel: "canceling", tear: "torn", reset: "idle" } as const;

/** A page turn's phases. Every call is honoured from every phase, so each row is the same; "reduced" is only ever a starting phase. */
export const pageTurnPhaseMachine = defineStateMachine<PagePhase, PageTurnEvent>({
  initial: "idle",
  states: { idle: anyPhase, dragging: anyPhase, turning: anyPhase, settling: anyPhase, canceling: anyPhase, torn: anyPhase, reduced: anyPhase },
});

export const pageTurnPhaseAfter = (phase: PagePhase, event: PageTurnEvent): PagePhase => nextState(pageTurnPhaseMachine.definition, phase, event) ?? phase;
