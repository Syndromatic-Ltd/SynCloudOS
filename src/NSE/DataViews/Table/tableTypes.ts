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

import type { NSEMenuController, NSEMenuModel, NSEMenuOverlayOptions } from "../../Menus";
import type { Formatter, SelectionChange, SelectionSnapshot, SortDescriptor } from "../../../SynCloudOS/Models";
import type {
  NSEDataViewAdapter,
  NSEDataViewKey,
  NSEDataViewSelectionEvent,
  NSEDataViewState,
} from "../Core";
import type { NSEDataViewDragBinding } from "../Drag";
import type { DragEndpoint } from "../../../SynCloudOS/SynCloudOS";
import type { NSEDragCommandPort } from "../../Drag";

export interface NSETableEditContext<T, TId, TValue> {
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
  readonly format?: Formatter<TValue>;
  readonly sort?: { readonly compare: (left: TValue, right: TValue) => number };
  readonly render?: (value: TValue, item: T, id: TId) => ReactNode;
  readonly editor?: (context: NSETableEditContext<T, TId, TValue>) => ReactNode;
}

export interface NSETableDropProposal<TId> {
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

export interface NSETableColumnMenu {
  readonly model: NSEMenuModel;
  readonly controller: NSEMenuController;
  readonly overlay: NSEMenuOverlayOptions;
}

export interface NSETableProps<T, TId extends NSEDataViewKey>
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
  readonly viewportBlockSize?: number;
  readonly locale?: string;
  readonly columnVisibility?: Readonly<Record<string, boolean>>;
  readonly columnOrder?: readonly string[];
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly sortDescriptors?: readonly SortDescriptor<T, unknown>[];
  readonly columnMenu?: NSETableColumnMenu;
  readonly onColumnConfigurationChange?: (configuration: NSETableColumnConfiguration) => void;
  readonly onSortDescriptorsChange?: (descriptors: readonly SortDescriptor<T, unknown>[]) => void;
  readonly onSelectionChange?: (event: NSEDataViewSelectionEvent<TId>) => void;
  readonly onDoubleAction?: (id: TId, item: T) => void;
  readonly onEditCommit?: (context: NSETableEditContext<T, TId, unknown>) => void | Promise<void>;
  readonly onValidateDrop?: (proposal: NSETableDropProposal<TId>) => boolean | Promise<boolean>;
  readonly onAcceptDrop?: (proposal: NSETableDropProposal<TId>) => void | Promise<void>;
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

export interface NSETableSelectionSnapshot<TId extends NSEDataViewKey> {
  readonly snapshot: SelectionSnapshot<TId>;
  readonly change: SelectionChange<TId>;
}
