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

export interface NSECompletionDataSource<T> { query(input: string, signal: AbortSignal): Promise<readonly T[]>; idForItem(item: T): string; labelForItem(item: T): string }
export interface NSETokenValue<TId extends string | number, T> { readonly id: TId; readonly representedObject: T; readonly label: string }
export interface NSEComboBoxProps<T> { readonly "aria-label": string; readonly id?: string; readonly parentResponderId?: string; readonly direction?: "ltr" | "rtl"; readonly dataSource: NSECompletionDataSource<T>; readonly value: T | null; readonly inputValue: string; readonly disabled?: boolean; readonly readOnly?: boolean; readonly allowsFreeform?: boolean; readonly name?: string; onInputValueChange(value: string): void; onValueChange(value: T | string | null, reason: "completion" | "freeform" | "clear"): void }
export interface NSETokenFieldProps<T, TId extends string | number> { readonly "aria-label": string; readonly id?: string; readonly parentResponderId?: string; readonly values: readonly NSETokenValue<TId, T>[]; readonly disabled?: boolean; readonly readOnly?: boolean; readonly name?: string; readonly separators?: readonly string[]; readonly dataSource?: NSECompletionDataSource<NSETokenValue<TId, T>>; tokenMenu?(token:NSETokenValue<TId,T>):readonly {readonly id:string;readonly label:string;readonly disabled?:boolean}[]; createToken(label: string): NSETokenValue<TId, T>; onValuesChange(values: readonly NSETokenValue<TId, T>[], reason: "paste" | "create" | "delete" | "reorder" | "edit"): void; onRequestReorder?(id: TId, beforeId: TId | null): void; onTokenMenuAction?(tokenId:TId,actionId:string):void }
