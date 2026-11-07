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

export interface NSEFormatterContext {
  readonly locale: string;
  readonly timeZone?: string;
}

export interface NSEFormatterError {
  readonly code: string;
  readonly message: string;
  readonly input: string;
}

export type NSEFormatterResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: NSEFormatterError };

/** NSFormatter: subclass to convert between objects and their display and editing strings. */
export abstract class NSEFormatter<T> {
  abstract string(value: T, context: NSEFormatterContext): string;
  abstract editingString(value: T, context: NSEFormatterContext): string;
  abstract getObjectValue(text: string, context: NSEFormatterContext): NSEFormatterResult<T>;
  abstract isPartialStringValid(
    text: string,
    context: NSEFormatterContext,
  ): {
    readonly valid: boolean;
    readonly replacement?: string;
    readonly error?: NSEFormatterError;
  };
}

export function formatterFailure<T>(
  code: string,
  message: string,
  input: string,
): NSEFormatterResult<T> {
  return { ok: false, error: { code, message, input } };
}
