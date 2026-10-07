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

import type { ItemIdentity } from "./ChangeSet";
import { IndexPath } from "./IndexPath";

export interface TreeNodeInit<T, TId extends ItemIdentity> {
  readonly id: TId;
  readonly value: T;
  readonly indexPath: IndexPath;
  readonly parentId: TId | null;
  readonly children: readonly TreeNode<T, TId>[];
  readonly loading?: boolean;
  readonly error?: string | null;
}

export class TreeNode<T, TId extends ItemIdentity> {
  readonly id: TId;
  readonly value: T;
  readonly indexPath: IndexPath;
  readonly parentId: TId | null;
  readonly children: readonly TreeNode<T, TId>[];
  readonly loading: boolean;
  readonly error: string | null;

  constructor(init: TreeNodeInit<T, TId>) {
    this.id = init.id;
    this.value = init.value;
    this.indexPath = init.indexPath;
    this.parentId = init.parentId;
    this.children = Object.freeze([...init.children]);
    this.loading = init.loading ?? false;
    this.error = init.error ?? null;
    Object.freeze(this);
  }

  get level(): number {
    return this.indexPath.length - 1;
  }

  get isLeaf(): boolean {
    return this.children.length === 0;
  }

  descendant(path: IndexPath): TreeNode<T, TId> | null {
    let node: TreeNode<T, TId> | undefined = this;
    for (const index of path.indexes) node = node?.children[index];
    return node ?? null;
  }
}
