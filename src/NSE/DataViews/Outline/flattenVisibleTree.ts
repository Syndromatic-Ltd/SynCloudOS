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

import type { TreeNode } from "../../../SynCloudOS/Models";
import type { NSEDataViewKey } from "../Core";
import type { NSEOutlineRow } from "./outlineTypes";

export function flattenVisibleTree<T, TId extends NSEDataViewKey>(
  roots: readonly TreeNode<T, TId>[],
  expandedIds: ReadonlySet<TId>,
  isExpandable: (item: T, node: TreeNode<T, TId>) => boolean = (_item, node) => node.children.length > 0,
): readonly NSEOutlineRow<T, TId>[] {
  const rows: NSEOutlineRow<T, TId>[] = [];
  const seen = new Set<TId>();
  const pending: Array<{
    node: TreeNode<T, TId>;
    level: number;
    positionInSet: number;
    setSize: number;
  }> = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    pending.push({ node: roots[index]!, level: 1, positionInSet: index + 1, setSize: roots.length });
  }

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current.node.id)) continue;
    seen.add(current.node.id);
    const expandable = isExpandable(current.node.value, current.node);
    const expanded = expandable && expandedIds.has(current.node.id);
    rows.push(Object.freeze({
      id: current.node.id,
      item: current.node.value,
      node: current.node,
      row: rows.length,
      level: current.level,
      parentId: current.node.parentId,
      positionInSet: current.positionInSet,
      setSize: current.setSize,
      expandable,
      expanded,
    }));
    if (!expanded) continue;
    const children = current.node.children;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({ node: children[index]!, level: current.level + 1, positionInSet: index + 1, setSize: children.length });
    }
  }

  return Object.freeze(rows);
}
