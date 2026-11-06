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

import { NSEAnimationDefaults } from "../../Animation/NSEAnimationDefaults";

/**
 * Atmo's motion: the timing curves and durations its views animate with. NSEAnimationContext.current
 * carries the standard pair; reach for the others when your own animation should feel like Atmo's
 * emphasised entrances (`emphasized`), arrivals (`decelerate`) or exits (`accelerate`).
 */
export const atmoMotion = Object.freeze({
  timingFunctions: NSEAnimationDefaults.easing,
  durations: NSEAnimationDefaults.durationSeconds,
});
