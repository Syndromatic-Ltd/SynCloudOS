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

import type { CSSProperties } from "react";
import type { NSEStackItemProps } from "./stackViewTypes";

/**
 * A declarative child of NSEStackView. Layout metadata stays on this neutral
 * wrapper; visual treatment belongs to the surrounding NSE appearance layer.
 */
export function NSEStackItem({
  id,
  minimumSize: _minimumSize,
  preferredSize: _preferredSize,
  maximumSize: _maximumSize,
  weight: _weight,
  visibilityPriority: _visibilityPriority,
  detachedWhenHidden: _detachedWhenHidden,
  gravity: _gravity,
  spacingAfter: _spacingAfter,
  hidden: _hidden,
  overflowLabel: _overflowLabel,
  onOverflowActivate: _onOverflowActivate,
  className = "",
  style,
  children,
  ...props
}: NSEStackItemProps) {
  return (
    <div
      {...props}
      className={["nse-stack-view-item", className].filter(Boolean).join(" ")}
      data-nse-stack-item="true"
      data-stack-item-id={id}
      style={style as CSSProperties}
    >
      {children}
    </div>
  );
}
