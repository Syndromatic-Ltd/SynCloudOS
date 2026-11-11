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

/** NSProgressIndicator: a bar, or a spinning indicator. */
export interface NSEProgressIndicatorProps {
  readonly "aria-label": string;
  /** NSProgressIndicator.Style: a horizontal bar or a spinning indicator. Default bar. */
  readonly style?: "bar" | "spinning";
  /** NSProgressIndicator.isIndeterminate. Default: indeterminate when there is no value. */
  readonly isIndeterminate?: boolean;
  /** NSProgressIndicator.doubleValue, between `minimum` and `maximum`. */
  readonly value?: number;
  /** NSProgressIndicator.minValue. Default 0. */
  readonly minimum?: number;
  /** NSProgressIndicator.maxValue. Default 100. */
  readonly maximum?: number;
  /** NSControl.ControlSize. A spinning indicator is 16 (small), 32 (regular) or 64 (large) pixels across. Default regular. */
  readonly controlSize?: "small" | "regular" | "large";
}
