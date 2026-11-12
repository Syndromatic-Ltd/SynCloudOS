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

import { defineStateMachine, type StateMachine } from "../../Foundation/internal/StateMachine";

/** The history actions that move a request on. Each names the phase it leads to. */
export type LaunchRequestStep = "requested" | "queued" | "deferred" | "started" | "authorised" | "loading" | "ready" | "complete" | "failed" | "cancelled";
export type LaunchRequestPhase = "new" | LaunchRequestStep;

const ends = { failed: "failed", cancelled: "cancelled" } as const;

/** Every legal order of a launch request's steps, from acceptance to its outcome. */
export const launchRequestMachine = defineStateMachine<LaunchRequestPhase, LaunchRequestStep>({
  initial: "new",
  states: {
    new: { requested: "requested", queued: "queued" },
    requested: { queued: "queued", deferred: "deferred", started: "started", ...ends },
    queued: { deferred: "deferred", started: "started", ...ends },
    deferred: { queued: "queued", deferred: "deferred", started: "started", ...ends },
    started: { authorised: "authorised", ...ends },
    authorised: { loading: "loading", ...ends },
    loading: { ready: "ready", ...ends },
    ready: { complete: "complete", ...ends },
    complete: {},
    failed: {},
    // Two owners may each report the same cancellation.
    cancelled: { cancelled: "cancelled" },
  },
});

const stepNames: ReadonlySet<string> = new Set(Object.keys(launchRequestMachine.definition.states).filter(phase => phase !== "new"));

/** Whether a history action moves a request on. The rest (coalesced, staged, MultiSwitch, preload) only annotate it. */
export function isLaunchRequestStep(action: string): action is LaunchRequestStep {
  return stepNames.has(action);
}

// Keyed by the request object, so the public request details gain no field.
const machines = new WeakMap<object, StateMachine<LaunchRequestPhase, LaunchRequestStep>>();

export function launchRequestPhase(request: object): LaunchRequestPhase {
  return machines.get(request)?.state ?? "new";
}

/** Moves the request on. An out-of-order step leaves it where it was and says so. */
export function advanceLaunchRequest(request: object, step: LaunchRequestStep): { readonly legal: boolean; readonly previous: LaunchRequestPhase; readonly phase: LaunchRequestPhase } {
  let machine = machines.get(request);
  if (!machine) machines.set(request, machine = launchRequestMachine.create());
  const previous = machine.state;
  const legal = machine.send(step) !== null;
  return { legal, previous, phase: machine.state };
}
