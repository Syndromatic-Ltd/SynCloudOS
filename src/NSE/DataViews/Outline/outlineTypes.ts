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

import type { HTMLAttributes, ReactNode } from "react";

import type { NSETreeController } from "../../Controllers";
import type { SelectionChange, SelectionSnapshot, TreeNode } from "../../../SynCloudOS/Models";
import type { NSEDataViewKey, NSEDataViewState } from "../Core";
import type { NSEDataViewDragBinding } from "../Drag";
import type { DragEndpoint } from "../../../SynCloudOS/SynCloudOS";

export interface NSEOutlineViewDataSource<T, TId extends NSEDataViewKey> {
  idForItem(item: T): TId;
  childrenForItem(item: T, signal?: AbortSignal): readonly T[] | Promise<readonly T[]>;
  labelForItem(item: T): string;
  isExpandable?(item: T): boolean;
}

export interface NSEOutlineViewDelegate<T, TId extends NSEDataViewKey> {
  /**
   * `outlineView(_:isGroupItem:)`: a group item is a section header. In a source
   * list the theme draws it as a group row (Atmo: blue label, a line to the edge
   * and the disclosure arrow) rather than as a selectable row.
   */
  isGroupItem?(id: TId, item: T): boolean;
  /**
   * `outlineView(_:shouldShowOutlineCellForItem:)`: return false to hide an
   * item's disclosure control, so a section cannot be collapsed.
   */
  shouldShowOutlineCell?(id: TId, item: T): boolean;
  /**
   * `outlineView(_:shouldSelectItem:)`. Without it, every item except a group
   * item can be selected.
   */
  shouldSelect?(id: TId, item: T): boolean;
  shouldExpand?(id: TId, item: T): boolean;
  shouldCollapse?(id: TId, item: T): boolean;
  didExpand?(id: TId, item: T): void;
  didCollapse?(id: TId, item: T): void;
  didActivate?(id: TId, item: T): void;
  renderItem?(row: NSEOutlineViewRow<T, TId>): ReactNode;
}

export interface NSEOutlineViewRow<T, TId extends NSEDataViewKey> {
  readonly id: TId;
  readonly item: T;
  readonly node: TreeNode<T, TId>;
  readonly row: number;
  readonly level: number;
  readonly parentId: TId | null;
  readonly positionInSet: number;
  readonly setSize: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
}

export interface NSEOutlineViewSelectionEvent<TId extends NSEDataViewKey> {
  readonly reason: "pointer" | "keyboard" | "keyboard-range" | "collapse-parent" | "controller-change";
  readonly snapshot: SelectionSnapshot<TId>;
  readonly change: SelectionChange<TId>;
}

export interface NSEOutlineViewDropProposal<TId extends NSEDataViewKey> {
  readonly sessionId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
  readonly ids: readonly TId[];
  readonly targetId: TId | null;
  readonly insertionIndex: number;
  readonly operation: "above" | "on" | "below";
}

export interface NSEOutlineViewProps<T, TId extends NSEDataViewKey>
  extends Omit<HTMLAttributes<HTMLDivElement>, "children">,
    NSEOutlineViewDataSource<T, TId> {
  readonly controller: NSETreeController<T, TId>;
  readonly delegate?: NSEOutlineViewDelegate<T, TId>;
  readonly state?: NSEDataViewState;
  readonly selectionMode?: "none" | "single" | "multiple";
  readonly expandedIds?: ReadonlySet<TId>;
  readonly defaultExpandedIds?: ReadonlySet<TId>;
  readonly onExpandedIdsChange?: (ids: ReadonlySet<TId>) => void;
  readonly onSelectionChange?: (event: NSEOutlineViewSelectionEvent<TId>) => void;
  readonly rowHeight?: number;
  /**
   * `NSTableView.selectionHighlightStyle`. `"sourceList"` draws the outline as
   * a sidebar source list: the theme's source-list background, group rows for
   * group items, and the source-list selection. Default `"regular"`.
   */
  readonly selectionHighlightStyle?: "regular" | "sourceList";
  /**
   * Views that float over the rows at the top of the enclosing scroll view
   * (`NSScrollView.addFloatingSubview(_:for:)`), such as a source list's search
   * field. Rows scroll beneath them.
   */
  readonly floatingSubviews?: ReactNode;
  /** The scroll viewport's height in pixels, or `"fill"` to take the container's height. */
  readonly viewportBlockSize?: number | "fill";
  readonly onValidateDrop?: (proposal: NSEOutlineViewDropProposal<TId>) => boolean | Promise<boolean>;
  readonly onAcceptDrop?: (proposal: NSEOutlineViewDropProposal<TId>) => void | Promise<void>;
  readonly dragBinding?: NSEDataViewDragBinding<TId>;
  readonly dragEndpoint?: DragEndpoint;
}
