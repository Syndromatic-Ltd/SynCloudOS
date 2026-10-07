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

import type { NSEProgressIndicatorProps } from "./progressTypes";
import { normalizeNSEProgressState, progressStyle } from "./progressCore";

export function NSEProgressIndicator({ state, variant = "bar", size = 16, reducedMotion, ...props }: NSEProgressIndicatorProps) {
  const normalizedState = normalizeNSEProgressState(state);
  if (normalizedState.kind === "hidden") return null;
  if (normalizedState.kind === "error" || normalizedState.kind === "suspended" || normalizedState.kind === "completed") {
    return <span role="status" aria-label={props["aria-label"]} data-nse-control="progress-indicator" data-state={normalizedState.kind}>{normalizedState.kind === "error" ? normalizedState.message : normalizedState.kind}</span>;
  }

  const determinate = normalizedState.kind === "determinate";
  const metrics = determinate ? normalizedState.metrics : undefined;
  const percentage = metrics ? Math.round(metrics.percent) : null;
  return (
    <div
      role="progressbar"
      aria-label={props["aria-label"]}
      aria-valuemin={metrics?.minimum}
      aria-valuemax={metrics?.maximum}
      aria-valuenow={metrics?.value}
      data-nse-control="progress-indicator"
      data-state={normalizedState.kind}
      data-variant={variant}
      data-size={size}
      data-motion={reducedMotion ? "static" : "animated"}
      data-appearance-recipe="progress-indicator"
      style={metrics ? progressStyle(metrics) : undefined}
    >
      <span data-nse-part="track"><span data-nse-part="fill" /></span>
      <span data-nse-part="status">{percentage === null ? "Loading" : `${percentage}%`}</span>
    </div>
  );
}
