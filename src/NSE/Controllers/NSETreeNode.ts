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

import { NSEIndexPath } from "../../Foundation/NSEIndexPath";

/** NSTreeNode: a represented object and a mutable, parent-aware tree of child nodes. */
export class NSETreeNode<T = unknown> {
  representedObject: T | null;
  #parent: NSETreeNode<T> | null = null;
  readonly #children: NSETreeNode<T>[] = [];
  readonly #mutableChildren: NSETreeNode<T>[];

  constructor(representedObject: T | null = null) {
    this.representedObject = representedObject;
    const mutators = new Set<PropertyKey>(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "copyWithin", "fill"]);
    this.#mutableChildren = new Proxy(this.#children, {
      get: (target, key, receiver) => {
        if (!mutators.has(key)) return Reflect.get(target, key, receiver);
        return (...args: unknown[]) => {
          const next = [...target];
          const method = Reflect.get(Array.prototype, key) as (...values: unknown[]) => unknown;
          const result = Reflect.apply(method, next, args);
          this.#replaceChildren(next);
          return result === next ? this.#mutableChildren : result;
        };
      },
      set: (_target, key, value) => {
        if (key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key))) {
          throw new TypeError("Child arrays support only indexed values and length.");
        }
        const next = [...this.#children];
        Reflect.set(next, key, value);
        this.#replaceChildren(next);
        return true;
      },
      defineProperty: () => { throw new TypeError("Change child nodes through indexed assignment or array methods."); },
      deleteProperty: () => { throw new TypeError("Remove child nodes with splice or pop."); },
      preventExtensions: () => false,
    });
  }

  get parentNode(): NSETreeNode<T> | null { return this.#parent; }
  get childNodes(): readonly NSETreeNode<T>[] { return Object.freeze([...this.#children]); }
  get mutableChildNodes(): NSETreeNode<T>[] { return this.#mutableChildren; }
  get isLeaf(): boolean { return this.#children.length === 0; }

  get indexPath(): NSEIndexPath {
    const indexes: number[] = [];
    let node: NSETreeNode<T> = this;
    while (node.#parent) {
      indexes.unshift(node.#parent.#children.indexOf(node));
      node = node.#parent;
    }
    return NSEIndexPath.from(...indexes);
  }

  descendantNode(indexPath: NSEIndexPath): NSETreeNode<T> | null {
    let node: NSETreeNode<T> | undefined = this;
    for (const index of indexPath.indexes) node = node ? node.#children[index] : undefined;
    return node ?? null;
  }

  #replaceChildren(next: NSETreeNode<T>[]): void {
    const seen = new Set<NSETreeNode<T>>();
    for (let index = 0; index < next.length; index += 1) {
      const child = next[index];
      if (!(child instanceof NSETreeNode)) throw new TypeError("Children must be tree nodes without empty indexes.");
      if (seen.has(child)) throw new TypeError("A tree cannot contain duplicate children.");
      seen.add(child);
      for (let ancestor: NSETreeNode<T> | null = this; ancestor; ancestor = ancestor.#parent) {
        if (ancestor === child) throw new TypeError("A tree cannot contain a cycle.");
      }
    }
    // Validate the whole mutation before changing either parent, including cross-tree moves.
    for (const child of this.#children) if (!seen.has(child)) child.#parent = null;
    for (const child of next) {
      const previous = child.#parent;
      if (previous && previous !== this) previous.#children.splice(previous.#children.indexOf(child), 1);
      child.#parent = this;
    }
    this.#children.splice(0, this.#children.length, ...next);
  }
}
