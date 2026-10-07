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

/** Returns a browser monotonic clock in seconds. The runtime keeps Date.now()
 * as its wall clock and never substitutes it when this capability is absent. */
export function createBrowserMonotonicNowSeconds(
  performanceClock: Pick<Performance, "now"> | null,
): (() => number) | undefined {
  if (!performanceClock || typeof performanceClock.now !== "function") return undefined;
  return () => {
    const milliseconds = performanceClock.now();
    if (!Number.isFinite(milliseconds)) throw new RangeError("Browser performance clock returned a nonfinite value.");
    return milliseconds / 1_000;
  };
}
