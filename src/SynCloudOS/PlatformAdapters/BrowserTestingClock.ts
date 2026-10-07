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

/** Capture the host clock once so settlement and test watchdogs can continue
 * progressing when an application installs fake timers later. */
const timerWasIntercepted = "clock" in globalThis.setTimeout || "_isMockFunction" in globalThis.setTimeout;
const schedule = globalThis.setTimeout.bind(globalThis);
const unschedule = globalThis.clearTimeout.bind(globalThis);
const now = globalThis.performance?.now.bind(globalThis.performance) ?? Date.now.bind(Date);

export const browserTestingClock = Object.freeze({
  timerWasIntercepted,
  now,
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    return schedule(callback, delayMs);
  },
  clearTimeout(handle: unknown): void {
    unschedule(handle as ReturnType<typeof setTimeout>);
  },
});
