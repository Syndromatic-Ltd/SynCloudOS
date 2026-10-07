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

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type NSEAppFrameVariant = "standard" | "sourceList" | "document" | "canvas";

export interface NSEAppFrameProps extends HTMLAttributes<HTMLElement> {
  variant?: NSEAppFrameVariant;
  topBar?: ReactNode;
  sidebar?: ReactNode;
  statusBar?: ReactNode;
  children: ReactNode;
}

export function NSEAppFrame({
  variant = "standard",
  topBar,
  sidebar,
  statusBar,
  children,
  className = "",
  ...props
}: NSEAppFrameProps) {
  return (
    <main className={classes("nse-app-frame", className)} data-variant={variant} {...props}>
      {topBar ? <div className="nse-app-frame-topbar">{topBar}</div> : null}
      <div className="nse-app-frame-body">
        {sidebar ? <div className="nse-app-frame-sidebar">{sidebar}</div> : null}
        <div className="nse-app-frame-content">{children}</div>
      </div>
      {statusBar ? <div className="nse-app-frame-statusbar">{statusBar}</div> : null}
    </main>
  );
}
