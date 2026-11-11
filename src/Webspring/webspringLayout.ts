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

export const WEBSPRING_BOARD_PROJECTION_VERSION = 1;
export const WEBSPRING_BOARD_PAGE_SIZE = 20;
export const WEBSPRING_BOARD_DOCK_SIZE = 4;

export interface WebspringBoardProjection<T extends { readonly id: string }> {
  readonly version: 1;
  readonly order: readonly string[];
  readonly dock: readonly T[];
  readonly pages: readonly (readonly T[])[];
  readonly pageSize: number;
  readonly dockSize: number;
}

/** Projects the persisted top-level Webspring order into Board regions without owning another order. */
export function createWebspringBoardProjection<T extends { readonly id: string }>(
  items: readonly T[],
  options: { readonly pageSize?: number; readonly dockSize?: number } = {},
): WebspringBoardProjection<T> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? WEBSPRING_BOARD_PAGE_SIZE));
  const dockSize = Math.max(0, Math.floor(options.dockSize ?? WEBSPRING_BOARD_DOCK_SIZE));
  const dock = items.slice(0, dockSize);
  const pageItems = items.slice(dock.length);
  const pages = Array.from(
    { length: Math.max(1, Math.ceil(pageItems.length / pageSize)) },
    (_unused, index) => Object.freeze(pageItems.slice(index * pageSize, (index + 1) * pageSize)),
  );
  return Object.freeze({
    version: WEBSPRING_BOARD_PROJECTION_VERSION,
    order: Object.freeze(items.map((item) => item.id)),
    dock: Object.freeze(dock),
    pages: Object.freeze(pages),
    pageSize,
    dockSize,
  });
}
