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

export interface FormatterContext {
  readonly locale: string;
  readonly timeZone?: string;
}

export interface FormatterError {
  readonly code: string;
  readonly message: string;
  readonly input: string;
}

export type FormatterResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: FormatterError };

export interface Formatter<T> {
  format(value: T, context: FormatterContext): string;
  editingText(value: T, context: FormatterContext): string;
  parse(text: string, context: FormatterContext): FormatterResult<T>;
  validatePartial(
    text: string,
    context: FormatterContext,
  ): {
    readonly valid: boolean;
    readonly replacement?: string;
    readonly error?: FormatterError;
  };
}

export function formatterFailure<T>(
  code: string,
  message: string,
  input: string,
): FormatterResult<T> {
  return { ok: false, error: { code, message, input } };
}
