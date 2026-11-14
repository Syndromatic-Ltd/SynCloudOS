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

import type { NSEDataViewKey, NSEDataViewState } from "../Core";

export class BrowserDataError extends TypeError {
  readonly code: "shape" | "identity" | "duplicate";
  constructor(code: BrowserDataError["code"], message: string) { super(message); this.name = "NSEBrowserDataError"; this.code = code; }
}

export interface NSEBrowserDataSource<T, TId extends NSEDataViewKey> {
  rootItems(signal: AbortSignal): readonly T[] | Promise<readonly T[]>;
  children(item: T, signal: AbortSignal): readonly T[] | Promise<readonly T[]>;
  idForItem(item: T): TId;
  labelForItem(item: T): string;
  isLeaf(item: T): boolean;
  iconForItem?(item: T): ReactNode;
}

export interface BrowserPathItem<T, TId extends NSEDataViewKey> {
  readonly id: TId;
  readonly item: T;
}

export interface BrowserItemPresentation<T, TId extends NSEDataViewKey> {
  readonly item: T;
  readonly id: TId;
  readonly label: string;
  readonly leaf: boolean;
  readonly icon?: ReactNode;
}

export type BrowserColumnStatus = "loading" | "ready" | "empty" | "denied" | "interrupted" | "error";

export interface BrowserColumnState<T, TId extends NSEDataViewKey> {
  readonly parentId: TId | null;
  readonly items: readonly T[];
  readonly presentation: readonly BrowserItemPresentation<T, TId>[];
  readonly activeId: TId | null;
  readonly status: BrowserColumnStatus;
  readonly message?: string;
  readonly retry?: () => void;
}

export interface NSEBrowserProps<T, TId extends NSEDataViewKey>
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "onChange"> {
  readonly dataSource: NSEBrowserDataSource<T, TId>;
  readonly presentation: "columns" | "compact";
  readonly path?: readonly BrowserPathItem<T, TId>[];
  readonly defaultPath?: readonly BrowserPathItem<T, TId>[];
  readonly onPathChange?: (path: readonly BrowserPathItem<T, TId>[]) => void;
  readonly onActivateLeaf?: (item: BrowserPathItem<T, TId>) => void;
  readonly columnWidths?: readonly number[];
  readonly defaultColumnWidth?: number;
  readonly onColumnWidthsChange?: (widths: readonly number[]) => void;
  readonly minimumColumnWidth?: number;
  readonly maximumColumnWidth?: number;
  readonly state?: NSEDataViewState;
}
