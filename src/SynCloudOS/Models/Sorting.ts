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

import type { NSESortComparator } from "../../Foundation/NSESortDescriptor";

export function sortWithDescriptors<T>(
  items: readonly T[],
  descriptors: readonly NSESortComparator<T>[],
): readonly T[] {
  if (descriptors.length === 0) return items;

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      for (const descriptor of descriptors) {
        const result = descriptor.compare(left.item, right.item);
        if (result !== 0) return result;
      }
      return left.index - right.index;
    })
    .map(({ item }) => item);
}
