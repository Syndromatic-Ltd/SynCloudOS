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
import type { NSEChromeScheme, NSETopBarRail } from "./nseTopBarTypes";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type CSSVarStyle = HTMLAttributes<HTMLElement>["style"] & Record<`--${string}`, string>;

export type NSEStatusBarVariant = "default" | "atmoMetal";

export interface NSEStatusBarProps extends HTMLAttributes<HTMLElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  /** `atmoMetal` mirrors the metal top bar as a spliced footer; `default` is the compact strip. */
  variant?: NSEStatusBarVariant;
  /** Chrome light/dark surface for the `atmoMetal` variant. */
  scheme?: NSEChromeScheme;
  /** Sidebar-aligned rail cell for the `atmoMetal` variant (source-list windows). */
  rail?: NSETopBarRail;
}

export function NSEStatusBar({
  leading,
  trailing,
  children,
  variant = "default",
  scheme = "light",
  rail,
  className = "",
  style,
  ...props
}: NSEStatusBarProps) {
  if (variant === "atmoMetal") {
    const railWidth = rail?.width;
    const footerStyle: CSSVarStyle | undefined = railWidth != null
      ? { ...(style as CSSVarStyle), "--nse-app-topbar-rail": typeof railWidth === "number" ? `${railWidth}px` : railWidth }
      : (style as CSSVarStyle | undefined);

    return (
      <footer
        className={classes("nse-statusbar", "nse-statusbar-metal", className)}
        data-variant="atmoMetal"
        data-mode={scheme}
        data-has-rail={rail ? "true" : "false"}
        style={footerStyle}
        {...props}
      >
        {rail ? (
          <div className="nse-statusbar-metal-rail">
            <span className="nse-statusbar-metal-grain" aria-hidden="true" />
            <span className="nse-statusbar-metal-rail-content">{rail.content}</span>
          </div>
        ) : null}
        <div className="nse-statusbar-metal-main">
          <span className="nse-statusbar-metal-grain" aria-hidden="true" />
          <span className="nse-statusbar-metal-leading">{leading}</span>
          <span className="nse-statusbar-metal-center">{children}</span>
          <span className="nse-statusbar-metal-trailing">{trailing}</span>
        </div>
      </footer>
    );
  }

  return (
    <footer className={classes("nse-statusbar", className)} style={style} {...props}>
      <span className="nse-statusbar-leading">{leading}</span>
      <span className="nse-statusbar-center">{children}</span>
      <span className="nse-statusbar-trailing">{trailing}</span>
    </footer>
  );
}
