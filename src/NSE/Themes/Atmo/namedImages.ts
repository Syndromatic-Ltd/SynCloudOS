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

/** Atmo owns the artwork and natural point size of system template images.
 * Resolve URLs only when an image is requested: importing an unrelated control
 * must not require an ESM asset base (for example in a classic-script view host).
 */
const navigationTemplateSize = Object.freeze({ width: 17, height: 17 });
export const atmoNamedImages = Object.freeze({
  get NSGoBackTemplate() {
    return { src: new URL("./Resources/navigation-back.svg", import.meta.url).href, size: navigationTemplateSize };
  },
  get NSGoForwardTemplate() {
    return { src: new URL("./Resources/navigation-forward.svg", import.meta.url).href, size: navigationTemplateSize };
  },
});
