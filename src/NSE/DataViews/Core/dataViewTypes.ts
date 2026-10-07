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

import type { ReactNode } from "react";

import type { NSEArrayController } from "../../Controllers";
import type {
  ChangeSet,
  IndexPath,
  SelectionChange,
  SelectionSnapshot,
  SortComparator,
} from "../../../SynCloudOS/Models";

export type NSEDataViewKey = string | number;

export type NSEDataViewState =
  | { readonly kind: "ready" }
  | { readonly kind: "loading"; readonly message: string }
  | { readonly kind: "empty"; readonly message: string }
  | { readonly kind: "disabled"; readonly message: string }
  | { readonly kind: "read-only"; readonly message: string }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "denied"; readonly message: string; readonly retry?: () => void }
  | { readonly kind: "interrupted"; readonly message: string; readonly resume?: () => void }
  | { readonly kind: "error"; readonly message: string; readonly retry?: () => void };

export interface NSEDataViewAdapter<T, TId extends NSEDataViewKey> {
  readonly controller: NSEArrayController<T, TId>;
  idForItem(item: T): TId;
  labelForItem(item: T): string;
  isItemDisabled?(item: T): boolean;
}

export interface NSEDataViewDelegate<T, TId extends NSEDataViewKey> {
  shouldSelect?(id: TId, item: T): boolean;
  didActivate?(id: TId, item: T): void;
  didRequestContextMenu?(id: TId, anchor: HTMLElement): void;
  didRequestReorder?(ids: readonly TId[], insertionIndex: number): void;
}

export interface NSEDataViewSelectionEvent<TId extends NSEDataViewKey> {
  readonly reason: "pointer" | "keyboard" | "keyboard-range" | "controller-change" | "collapse-parent";
  readonly snapshot: SelectionSnapshot<TId>;
  readonly change: SelectionChange<TId>;
}

export interface NSEDataViewItem<T, TId extends NSEDataViewKey> {
  readonly id: TId;
  readonly item: T;
  readonly index: number;
  readonly indexPath: IndexPath;
  readonly disabled: boolean;
}

export interface NSEDataViewSnapshot<T, TId extends NSEDataViewKey> {
  readonly revision: number;
  readonly items: readonly NSEDataViewItem<T, TId>[];
  readonly selection: SelectionSnapshot<TId>;
  readonly activeId: TId | null;
  readonly editingId: TId | null;
  readonly state: NSEDataViewState;
  readonly changeSet: ChangeSet<TId, T>;
  readonly sortDescriptors: readonly SortComparator<T>[];
}

export type NSEDataViewSelectionMode = "none" | "single" | "multiple";

export interface NSEDataViewCoordinatorOptions<T, TId extends NSEDataViewKey> {
  readonly selectionMode: NSEDataViewSelectionMode;
  readonly state?: NSEDataViewState;
  readonly delegate?: NSEDataViewDelegate<T, TId>;
  readonly onSelectionChange?: (event: NSEDataViewSelectionEvent<TId>) => void;
}

export interface NSEDataViewCellImage {
  readonly src: string;
  readonly alt: string;
}

export interface NSEDataViewCellContentProps {
  readonly image?: NSEDataViewCellImage;
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
  readonly badge?: ReactNode;
  readonly accessory?: ReactNode;
}
