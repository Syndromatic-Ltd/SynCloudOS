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

export type NSEProgressState =
  | { readonly kind: "determinate"; readonly value: number; readonly minimum: number; readonly maximum: number }
  | { readonly kind: "indeterminate" }
  | { readonly kind: "suspended"; readonly value?: number }
  | { readonly kind: "completed" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "hidden" };

export interface NSEProgressIndicatorProps {
  readonly "aria-label": string;
  readonly state: NSEProgressState;
  readonly variant?: "bar" | "circular" | "spinner";
  readonly size?: 16 | 32 | 64;
  readonly reducedMotion?: boolean;
}
