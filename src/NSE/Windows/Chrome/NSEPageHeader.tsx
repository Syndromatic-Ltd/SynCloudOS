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

import type { HTMLAttributes, ReactNode } from "react";
import { classes } from "../../Controls/Core/nseControlsShared";

export interface NSEPageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  kicker?: ReactNode;
  /** Leading slot, before the copy — a back control on a navigable surface. */
  leading?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  /**
   * "start" is the page-header default. "center" is for a header used as the
   * cap of a popup or toast, where the title reads as the surface's own name.
   */
  align?: "start" | "center";
}

export function NSEPageHeader({
  kicker,
  leading,
  title,
  actions,
  align = "start",
  className = "",
  children,
  ...props
}: NSEPageHeaderProps) {
  const centered = align === "center";
  return (
    <header className={classes("nse-control-page-header", className)} data-align={align} {...props}>
      {/* Both side slots are rendered whenever the header is centred, empty or
          not: the title is centred by occupying the middle column of a
          1fr/auto/1fr grid, and a missing side child collapses that column and
          drags the title off-centre by the width of whatever remains. */}
      {leading || centered ? (
        <span className="nse-control-page-header-leading">{leading}</span>
      ) : null}
      <span className="nse-control-page-header-copy">
        {kicker ? <span className="nse-control-page-header-kicker">{kicker}</span> : null}
        <span className="nse-control-page-header-title">{title}</span>
        {children ? <span className="nse-control-page-header-body">{children}</span> : null}
      </span>
      {/* When centred the trailing slot is rendered even when empty: the title
          is centred by sitting in the middle column of a 1fr/auto/1fr grid, and
          a missing third child would collapse that column and pull the title
          off-centre by exactly the width of the leading control. */}
      {actions || centered ? (
        <span className="nse-control-page-header-actions">{actions}</span>
      ) : null}
    </header>
  );
}
