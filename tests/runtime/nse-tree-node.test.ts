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

import { describe, expect, it } from "vitest";
import { NSETreeNode } from "../../src/NSE/Controllers/NSETreeNode";
import { NSEIndexPath } from "../../src/Foundation/NSEIndexPath";

describe("NSTreeNode semantics", () => {
  it("maintains parent references and index paths through mutable children", () => {
    const root = new NSETreeNode("root");
    const first = new NSETreeNode("first");
    const second = new NSETreeNode("second");
    root.mutableChildNodes.push(first, second);
    expect(first.parentNode).toBe(root);
    expect(second.indexPath.indexes).toEqual([1]);
    expect(root.descendantNode(NSEIndexPath.from(1))).toBe(second);
    root.mutableChildNodes.splice(0, 1);
    expect(first.parentNode).toBeNull();
    expect(second.indexPath.indexes).toEqual([0]);
    expect(root.childNodes).toEqual([second]);
    expect(root.isLeaf).toBe(false);
  });
  it("moves a child between parents and rejects cycles and duplicates", () => {
    const first = new NSETreeNode("first");
    const second = new NSETreeNode("second");
    const child = new NSETreeNode("child");
    first.mutableChildNodes.push(child);
    second.mutableChildNodes.push(child);
    expect(first.childNodes).toEqual([]);
    expect(child.parentNode).toBe(second);
    expect(() => child.mutableChildNodes.push(second)).toThrow(/cycle/i);
    expect(() => second.mutableChildNodes.push(child)).toThrow(/duplicate/i);
    expect(second.childNodes).toEqual([child]);
    child.representedObject = "renamed";
    expect(child.representedObject).toBe("renamed");
  });
});
