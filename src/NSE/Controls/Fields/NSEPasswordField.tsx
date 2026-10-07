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

import type { NSETextFieldProps } from "./NSEFields";
import { NSETextField } from "./NSEFields";
import { classes } from "../Core/nseControlsShared";

export interface NSEPasswordFieldProps<T = string> extends Omit<NSETextFieldProps<T>, "type"> {
  readonly hint?: string;
}

export function NSEPasswordField<T = string>({ hint, placeholder, className = "", autoCapitalize = "none", autoCorrect = "off", spellCheck = false, ...props }: NSEPasswordFieldProps<T>) {
  return <NSETextField<T> {...props} className={classes("nse-extended-password-field", className)} type="password" placeholder={placeholder ?? hint} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} spellCheck={spellCheck} />;
}
