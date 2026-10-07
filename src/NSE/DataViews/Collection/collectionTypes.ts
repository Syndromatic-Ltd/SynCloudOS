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

import type { HTMLAttributes, ReactNode, Ref } from "react";

import type { NSEDataViewAdapter, NSEDataViewKey, NSEDataViewSelectionEvent, NSEDataViewState } from "../Core";
import type { NSEDataViewDragBinding } from "../Drag";
import type { DragEndpoint } from "../../../SynCloudOS/SynCloudOS";

export interface NSECollectionLayoutItem {
  readonly index: number;
  readonly row: number;
  readonly column: number;
  readonly inlineStart: number;
  readonly blockStart: number;
  readonly inlineSize: number;
  readonly blockSize: number;
}

export interface NSECollectionLayoutInput {
  readonly count: number;
  readonly viewportInlineSize: number;
}

export interface NSECollectionLayout {
  readonly direction: "vertical" | "horizontal";
  readonly itemSize: { readonly inline: number; readonly block: number };
  readonly minimumGap: number;
  readonly sectionInset: { readonly blockStart: number; readonly inlineEnd: number; readonly blockEnd: number; readonly inlineStart: number };
  items(input: NSECollectionLayoutInput): readonly NSECollectionLayoutItem[];
  itemAt(index: number, input: NSECollectionLayoutInput): NSECollectionLayoutItem | null;
  columnCount(input: NSECollectionLayoutInput): number;
  rowCount(input: NSECollectionLayoutInput): number;
  indexInDirection(fromIndex: number, direction: "up" | "down" | "left" | "right", input: NSECollectionLayoutInput): number | null;
}

export interface NSECollectionViewItemProps<T, TId> {
  readonly item: T;
  readonly id: TId;
  readonly selected: boolean;
  readonly focused: boolean;
  readonly editing: boolean;
}

export interface NSECollectionDropProposal<TId> {
  readonly sessionId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
  readonly ids: readonly TId[];
  readonly targetId: TId | null;
  readonly insertionIndex: number;
}

export interface NSECollectionViewProps<T, TId extends NSEDataViewKey>
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly adapter: NSEDataViewAdapter<T, TId>;
  readonly layout: NSECollectionLayout;
  readonly renderItem: (props: NSECollectionViewItemProps<T, TId>) => ReactNode;
  readonly state?: NSEDataViewState;
  readonly selectionMode?: "none" | "single" | "multiple";
  /** Whether a primary pointer click activates after NSE has made the item active and selected. */
  readonly pointerActivation?: "double-click" | "single-click";
  readonly viewportInlineSize?: number;
  readonly viewportBlockSize?: number;
  /** Optional app-owned attachment points for shared scroll effects and canvas decoration. */
  readonly viewportRef?: Ref<HTMLDivElement>;
  readonly canvasRef?: Ref<HTMLDivElement>;
  readonly editableLabels?: boolean;
  readonly onSelectionChange?: (event: NSEDataViewSelectionEvent<TId>) => void;
  readonly onActivate?: (id: TId, item: T) => void;
  readonly onRequestReorder?: (ids: readonly TId[], insertionIndex: number) => void;
  readonly onValidateDrop?: (proposal: NSECollectionDropProposal<TId>) => boolean | Promise<boolean>;
  readonly onAcceptDrop?: (proposal: NSECollectionDropProposal<TId>) => void | Promise<void>;
  readonly dragBinding?: NSEDataViewDragBinding<TId>;
  readonly dragEndpoint?: DragEndpoint;
}
