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

export interface NSEPickerTransaction<T> {
  readonly opening: T | null;
  readonly hasOpening: boolean;
  readonly draft: T;
  readonly previewed: boolean;
  readonly open: boolean;
}

export type NSEPickerTransactionAction<T> =
  | Readonly<{ type: "begin"; value: T; draft?: T }>
  | Readonly<{ type: "preview"; value: T }>
  | Readonly<{ type: "commit"; value: T }>
  | Readonly<{ type: "cancel" }>
  | Readonly<{ type: "replace"; value: T }>;

export function createPickerTransaction<T>(value: T): NSEPickerTransaction<T> {
  return Object.freeze({ opening: null, hasOpening: false, draft: value, previewed: false, open: false });
}

export function reducePickerTransaction<T>(state: NSEPickerTransaction<T>, action: NSEPickerTransactionAction<T>): NSEPickerTransaction<T> {
  switch (action.type) {
    case "begin": return Object.freeze({ opening: action.value, hasOpening: true, draft: action.draft === undefined ? action.value : action.draft, previewed: false, open: true });
    case "preview": return Object.freeze({ ...state, draft: action.value, previewed: true });
    case "commit": return Object.freeze({ opening: null, hasOpening: false, draft: action.value, previewed: false, open: false });
    case "cancel": return Object.freeze({ opening: null, hasOpening: false, draft: state.hasOpening ? state.opening as T : state.draft, previewed: false, open: false });
    case "replace": return Object.freeze({ opening: state.open ? action.value : null, hasOpening: state.open, draft: action.value, previewed: false, open: state.open });
  }
}
