/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { DFXTime } from "../DFXTime";
import { DFXWallTime } from "../DFXWallTime";
import { clientError, maximumNanoseconds } from "./time";

interface Timer {
  deadline: DFXTime | DFXWallTime;
  leeway: number;
  strict: boolean;
  fire: () => void;
}
const timers = new Set<Timer>();
const hostTimers = new Set<ReturnType<typeof setTimeout>>();
const maximumHostDelay = 2_147_483_647;
let firing = false;
/** Subtract in the clock's actual representation before converting to milliseconds. */
export function remainingNanoseconds(deadline: DFXTime | DFXWallTime): number {
  if (deadline instanceof DFXTime)
    return deadline.uptimeNanoseconds === maximumNanoseconds ? Infinity : deadline.uptimeNanoseconds - DFXTime.now().uptimeNanoseconds;
  if (deadline instanceof DFXWallTime) {
    if (deadline.rawValue === DFXWallTime.distantFuture.rawValue) return Infinity;
    // Wall raw values are unsigned negative epochs, so their order is reversed.
    return Number(DFXWallTime.now().rawValue - deadline.rawValue);
  }
  return clientError("invalid dispatch deadline");
}
/** Each non-strict group has a common intersection of every member's leeway window. */
function rebuild(): void {
  if (firing) return;
  for (const timer of hostTimers) clearTimeout(timer);
  hostTimers.clear();
  const entries = [...timers]
    .map(timer => ({ timer, due: Math.max(0, remainingNanoseconds(timer.deadline) / 1e6) }))
    .sort((a, b) => a.due - b.due);
  const groups: { timers: Timer[]; start: number; end: number; strict: boolean }[] = [];
  for (const { timer, due } of entries) {
    if (!Number.isFinite(due)) continue;
    const end = due + timer.leeway / 1e6;
    const group = timer.strict ? undefined : groups.find(group => !group.strict && due <= group.end && end >= group.start);
    if (group) {
      group.timers.push(timer);
      group.start = Math.max(group.start, due);
      group.end = Math.min(group.end, end);
    } else groups.push({ timers: [timer], start: due, end, strict: timer.strict });
  }
  for (const group of groups) {
    const handle = setTimeout(
      () => {
        hostTimers.delete(handle);
        firing = true;
        try {
          for (const timer of group.timers)
            if (timers.has(timer) && remainingNanoseconds(timer.deadline) <= 0) {
              timers.delete(timer);
              timer.fire();
            }
        } finally {
          firing = false;
          rebuild();
        }
      },
      Math.min(maximumHostDelay, group.start),
    );
    hostTimers.add(handle);
  }
}
/** Internal timer registration; cancellation is idempotent. Infinite deadlines never arm. */
export function scheduleTimer(deadline: DFXTime | DFXWallTime, leeway: number, strict: boolean, fire: () => void): () => void {
  if (remainingNanoseconds(deadline) === Infinity) return () => {};
  const timer = { deadline, leeway, strict, fire };
  timers.add(timer);
  rebuild();
  return () => {
    if (timers.delete(timer)) rebuild();
  };
}
