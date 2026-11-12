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
import type { SynCloudOSWebspringState } from "./webspringStateTypes";

type Phase = SynCloudOSWebspringState["launchPhase"];

export type WebspringLaunchPhaseEvent = "stage" | "cancelStage" | "launch" | "cancelLaunch" | "cover" | "beginReturn" | "finishReturn" | "reset";

// A newer request may take over from any phase, so these events are legal everywhere.
const fromAnywhere = { stage: "staging", launch: "launching", cover: "covered", beginReturn: "returning", finishReturn: "idle", reset: "idle" } as const;

/** Every legal move of Webspring's launch phase. The cancel events only undo the phase they belong to. */
export const webspringLaunchPhaseMachine = defineStateMachine<Phase, WebspringLaunchPhaseEvent>({
  initial: "idle",
  states: {
    idle: fromAnywhere,
    staging: { ...fromAnywhere, cancelStage: "idle" },
    launching: { ...fromAnywhere, cancelLaunch: "idle" },
    covered: fromAnywhere,
    returning: fromAnywhere,
  },
});

/** Moves the draft's launch phase. Returns false, having written nothing, when the table has no such move. */
export function sendWebspringLaunchPhase(draft: { webspring: { launchPhase: Phase } }, event: WebspringLaunchPhaseEvent): boolean {
  const next = nextState(webspringLaunchPhaseMachine.definition, draft.webspring.launchPhase, event);
  if (next === null) return false;
  draft.webspring.launchPhase = next;
  return true;
}
