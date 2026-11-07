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

import { atmoNamedImages } from "../../Themes/Atmo/namedImages";

/** NSImage: a named system image. Atmo supplies its artwork; controls supply its content colour. */
export class NSEImage {
  /** NSImage.goBackTemplateName (NSImage.Name). */
  static readonly goBackTemplateName = "NSGoBackTemplate";
  /** NSImage.goForwardTemplateName (NSImage.Name). */
  static readonly goForwardTemplateName = "NSGoForwardTemplate";
  static readonly #named = new Map<string, NSEImage>();
  readonly isTemplate = true;

  private constructor(readonly name: string, readonly src: string, readonly size: Readonly<{ width: number; height: number }>) {
    Object.freeze(this);
  }

  /** NSImage(named:): returns the shared system image, or null when the name is unknown. */
  static named(name: string): NSEImage | null {
    if (!Object.hasOwn(atmoNamedImages, name)) return null;
    let image = this.#named.get(name);
    if (!image) {
      const artwork = atmoNamedImages[name as keyof typeof atmoNamedImages];
      image = new NSEImage(name, artwork.src, artwork.size);
      this.#named.set(name, image);
    }
    return image;
  }
}
