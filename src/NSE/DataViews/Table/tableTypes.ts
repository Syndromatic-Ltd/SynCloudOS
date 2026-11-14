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

import type { NSEMenu, MenuOverlayOptions } from "../../Menus";
import type { SelectionChange, SelectionSnapshot } from "../../../SynCloudOS/Models";
import type { NSEFormatter, NSESortDescriptor } from "../../../Foundation/public";
import type {
  NSEDataViewAdapter,
  NSEDataViewKey,
  NSEDataViewSelectionEvent,
  NSEDataViewState,
} from "../Core";
import type { NSEDataViewDragBinding } from "../Drag";
import type { DragEndpoint } from "../../../SynCloudOS/SynCloudOS";
import type { NSEDragCommandPort } from "../../Drag";

export interface NSETableViewEditContext<T, TId, TValue> {
  readonly item: T;
  readonly id: TId;
  readonly columnId: string;
  readonly previousValue: TValue;
  readonly value: TValue;
  readonly signal: AbortSignal;
  readonly commit?: (value: TValue) => void;
  readonly cancel?: () => void;
}

export interface NSETableColumn<T, TId, TValue> {
  readonly id: string;
  readonly title: string;
  readonly value: (item: T) => TValue;
  readonly width: { readonly min: number; readonly ideal: number; readonly max: number };
  readonly alignment?: "start" | "centre" | "end";
  readonly editable?: boolean;
  readonly format?: NSEFormatter<TValue>;
  readonly sort?: { readonly compare: (left: TValue, right: TValue) => number };
  readonly render?: (value: TValue, item: T, id: TId) => ReactNode;
  readonly editor?: (context: NSETableViewEditContext<T, TId, TValue>) => ReactNode;
}

export interface NSETableViewDropProposal<TId> {
  readonly sessionId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
  readonly ids: readonly TId[];
  readonly targetId: TId | null;
  readonly operation: "above" | "on" | "below";
  readonly insertionIndex: number;
}

export interface NSETableColumnConfiguration {
  readonly order: readonly string[];
  readonly visibility: Readonly<Record<string, boolean>>;
  readonly widths: Readonly<Record<string, number>>;
}

/** The header view's menu (NSTableHeaderView.menu), opened from its Columns pull-down. */
export interface NSETableColumnMenu {
  readonly menu: NSEMenu;
  readonly overlay: MenuOverlayOptions;
}

export interface NSETableViewProps<T, TId extends NSEDataViewKey>
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "onDoubleClick"> {
  readonly adapter: NSEDataViewAdapter<T, TId>;
  readonly columns: readonly NSETableColumn<T, TId, unknown>[];
  readonly state?: NSEDataViewState;
  readonly selectionMode?: "none" | "single" | "multiple";
  readonly allowsEmptySelection?: boolean;
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  /** NSTableView with no header view: the rows alone, as a list. */
  readonly headerHidden?: boolean;
  /**
   * The rows' visible height in CSS pixels, or `"fill"` to take the height of the table's container
   * (an NSTableView in an NSScrollView that fills its pane), measured as it resizes.
   */
  readonly viewportBlockSize?: number | "fill";
  readonly locale?: string;
  readonly columnVisibility?: Readonly<Record<string, boolean>>;
  readonly columnOrder?: readonly string[];
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly sortDescriptors?: readonly NSESortDescriptor<T, unknown>[];
  readonly columnMenu?: NSETableColumnMenu;
  readonly onColumnConfigurationChange?: (configuration: NSETableColumnConfiguration) => void;
  readonly onSortDescriptorsChange?: (descriptors: readonly NSESortDescriptor<T, unknown>[]) => void;
  readonly onSelectionChange?: (event: NSEDataViewSelectionEvent<TId>) => void;
  readonly onDoubleAction?: (id: TId, item: T) => void;
  readonly onEditCommit?: (context: NSETableViewEditContext<T, TId, unknown>) => void | Promise<void>;
  readonly onValidateDrop?: (proposal: NSETableViewDropProposal<TId>) => boolean | Promise<boolean>;
  readonly onAcceptDrop?: (proposal: NSETableViewDropProposal<TId>) => void | Promise<void>;
  readonly dragBinding?: NSEDataViewDragBinding<TId>;
  readonly dragEndpoint?: DragEndpoint;
  /** Optional runtime command bridge for focused keyboard drag alternatives. */
  readonly commands?: NSEDragCommandPort;
  /** A live responder that owns the three generic NSE drag commands. */
  readonly responderId?: string;
  /** Establishes the table's responder focus before a keyboard drag command
   * is dispatched. The owning application supplies this narrow focus bridge. */
  readonly onCommandFocus?: (responderId: string) => void;
}

export interface NSETableViewSelectionSnapshot<TId extends NSEDataViewKey> {
  readonly snapshot: SelectionSnapshot<TId>;
  readonly change: SelectionChange<TId>;
}
