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

import type { NSETheme } from "../../Theme/NSETheme";
import { atmoTheme } from "../../Appearance/atmoTheme";

/** NSImage: a named system image. Atmo supplies its artwork; controls supply its content colour. */
export class NSEImage {
  /** NSImage.goBackTemplateName (NSImage.Name). */
  static readonly goBackTemplateName = "NSGoBackTemplate";
  /** NSImage.goForwardTemplateName (NSImage.Name). */
  static readonly goForwardTemplateName = "NSGoForwardTemplate";
  static readonly #named = new WeakMap<NSETheme, Map<string, NSEImage>>();


  private constructor(readonly name: string, readonly src: string, readonly size: Readonly<{ width: number; height: number }>, readonly isTemplate = true, readonly files: Readonly<Record<string, string>> = Object.freeze({ "1x": src })) {
    Object.freeze(this);
  }

  /** NSImage(named:): returns the shared system image, or null when the name is unknown. */
  static named(name: string, theme: NSETheme = atmoTheme): NSEImage | null {
    const artwork = theme.images[name] ?? atmoTheme.images[name];
    if (!artwork) return null;
    let cache = this.#named.get(theme);
    if (!cache) this.#named.set(theme, cache = new Map());
    let image = cache.get(name);
    if (!image) {
      image = new NSEImage(name, artwork.files["1x"]!, artwork.pointSize, artwork.template ?? false, artwork.files);
      cache.set(name, image);
    }
    return image;
  }
}
