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
import type { DragPhase } from "./dragTypes";

export type DragPhaseEvent = "enterDestination" | "drop" | "accept" | "refuse";

/** A drag session's phases. Cancelling ends the session outright, so it is not a move here. */
export const dragPhaseMachine = defineStateMachine<DragPhase, DragPhaseEvent>({
  initial: "dragging",
  states: {
    dragging: { enterDestination: "over-destination" },
    "over-destination": { enterDestination: "over-destination", drop: "dropping" },
    dropping: { accept: "completed", refuse: "cancelled" },
    completed: {},
    cancelled: {},
  },
});
