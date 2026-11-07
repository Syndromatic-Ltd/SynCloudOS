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

/** NSDockTile: the application owns the label; Webspring and the host draw it. */
export class NSEDockTile {
  #badgeLabel = "";
  constructor(private readonly update: (label: string) => void) {}
  get badgeLabel(): string { return this.#badgeLabel; }
  set badgeLabel(value: string) {
    if (typeof value !== "string" || value.length > 64) throw new TypeError("A Dock badge label must be a string of at most 64 characters.");
    if (value === this.#badgeLabel) return;
    this.update(value); this.#badgeLabel = value;
  }
}
