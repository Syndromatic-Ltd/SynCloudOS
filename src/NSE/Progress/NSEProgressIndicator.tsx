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

import { useNSEAnimationEnvironment } from "../Animation/NSEAnimationEnvironment";
import type { NSEProgressIndicatorProps } from "./progressTypes";
import { normalizeNSEProgress, progressStyle } from "./progressCore";

const SPINNING_SIZE = { small: 16, regular: 32, large: 64 } as const;

/**
 * NSProgressIndicator. A bar fills from `minimum` to `maximum`, or, while
 * indeterminate, sweeps back and forth; a spinning indicator turns, or, given
 * a value, fills as a ring. Indeterminate motion stops under reduced motion.
 */
export function NSEProgressIndicator({ "aria-label": accessibleLabel, style = "bar", value, minimum, maximum, isIndeterminate = value === undefined, controlSize = "regular" }: NSEProgressIndicatorProps) {
  const { reducedMotion } = useNSEAnimationEnvironment();
  const metrics = isIndeterminate ? undefined : normalizeNSEProgress({ value, minimum, maximum });
  const percentage = metrics ? Math.round(metrics.percent) : null;
  return (
    <div
      role="progressbar"
      aria-label={accessibleLabel}
      aria-valuemin={metrics?.minimum}
      aria-valuemax={metrics?.maximum}
      aria-valuenow={metrics?.value}
      data-nse-control="progress-indicator"
      data-state={metrics ? "determinate" : "indeterminate"}
      data-variant={style === "bar" ? "bar" : metrics ? "circular" : "spinner"}
      data-size={style === "bar" ? undefined : SPINNING_SIZE[controlSize]}
      data-control-size={controlSize}
      data-motion={reducedMotion ? "static" : "animated"}
      data-appearance-recipe="progress-indicator"
      style={metrics ? progressStyle(metrics) : undefined}
    >
      <span data-nse-part="track"><span data-nse-part="fill" /></span>
      <span data-nse-part="status">{percentage === null ? "Loading" : `${percentage}%`}</span>
    </div>
  );
}
