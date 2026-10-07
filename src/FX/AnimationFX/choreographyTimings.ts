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

/** Shared deterministic timings for runtime and shell choreography. */
export const choreographyTimings = Object.freeze({
  routeReopenDelayMs: 80,
  webspringReturnFallbackMs: 2200,
  multiSwitchMotionMs: 720,
  multiSwitchSettleFallbackMs: 860,
  webspringLaunchCoverFallbackMs: 1800,
  webspringLaunchStageFallbackMs: 800,
});
