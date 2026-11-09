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

import type { NSEAppearanceName } from "./nseAppearanceTypes";
import type { NSETheme } from "../Theme/NSETheme";
import type { NSEChromeAppearance, NSEContrast, NSETransparency } from "./nseAppearanceTypes";

export interface NSEAppearanceOptions {
  /** The theme that draws it. Default: the theme of the view it is set on, Atmo in an application. */
  readonly theme?: NSETheme;
  /** The window chrome the theme draws inside it. Default: inherited. */
  readonly chrome?: NSEChromeAppearance;
  /** Increased contrast (AppKit's accessibilityHighContrast appearances). Default: inherited. */
  readonly contrast?: NSEContrast;
  /** Reduced transparency. Default: inherited. */
  readonly transparency?: NSETransparency;
}

/**
 * NSAppearance: how a view and its subviews are drawn. Set one on a view with
 * `<NSEView appearance={new NSEAppearance("darkAqua")}>`; views without one take their superview's,
 * as `NSView.effectiveAppearance` does.
 */
export class NSEAppearance {
  /** NSAppearance.name: `aqua` (light) or `darkAqua` (dark). */
  readonly name: NSEAppearanceName;
  readonly theme: NSETheme | undefined;
  readonly chrome: NSEChromeAppearance | undefined;
  readonly contrast: NSEContrast | undefined;
  readonly transparency: NSETransparency | undefined;

  /** NSAppearance(named:). */
  constructor(name: NSEAppearanceName, options: NSEAppearanceOptions = {}) {
    if (name !== "aqua" && name !== "darkAqua") throw new TypeError(`Unknown appearance name "${String(name)}".`);
    this.name = name;
    this.theme = options.theme;
    this.chrome = options.chrome;
    this.contrast = options.contrast;
    this.transparency = options.transparency;
    Object.freeze(this);
  }
}
