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
import { classes } from "../Controls/Core/nseControlsShared";

export interface AppMenuSurfaceProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
}

export function AppMenuSurface({ title, className = "", children, ...props }: AppMenuSurfaceProps) {
  return (
    <section data-nse-part="bezel" data-nse-role="application-menu" className={classes("nse-control-app-menu-surface", className)} {...props}>
      {title ? <div data-nse-part="title" className="nse-control-app-menu-title">{title}</div> : null}
      <div data-nse-part="body" className="nse-control-app-menu-inner">{children}</div>
    </section>
  );
}
