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
import { classes } from "../Core/nseControlsShared";
import { NSETextField, type NSETextFieldProps } from "./NSEFields";

export interface NSERoundedInputProps extends NSETextFieldProps {
  hint?: string;
}

export function NSERoundedInput({
  hint,
  placeholder,
  className = "",
  ...props
}: NSERoundedInputProps) {
  return (
    <NSETextField
      className={classes("nse-extended-rounded-input", className)}
      placeholder={placeholder ?? hint}
      {...props}
    />
  );
}

export interface NSEToolInputProps extends NSETextFieldProps {
  hint?: string;
}

export function NSEToolInput({
  hint,
  placeholder,
  className = "",
  ...props
}: NSEToolInputProps) {
  return (
    <NSETextField
      className={classes("nse-extended-tool-input", className)}
      placeholder={placeholder ?? hint}
      {...props}
    />
  );
}
