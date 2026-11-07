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

/** SCContentFilter analogue for an already granted display capture. */
export class VFXContentFilter {
  constructor(readonly element: Element, readonly mode: "restrict" | "crop" = "restrict") {
    if (mode !== "restrict" && mode !== "crop") throw new TypeError("Invalid content filter mode.");
    if (!element || typeof element !== "object") throw new TypeError("An element target is required.");
    Object.freeze(this);
  }
}
