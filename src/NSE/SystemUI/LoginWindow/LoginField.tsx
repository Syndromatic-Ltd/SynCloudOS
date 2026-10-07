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

import { forwardRef, type InputHTMLAttributes } from "react";

export interface LoginFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  invalid?: boolean;
  tone?: "light" | "dark";
  /** Applied to the wrapping label, not the input — the well is drawn there. */
  className?: string;
}

export const LoginField = forwardRef<HTMLInputElement, LoginFieldProps>(function LoginField(
  { label, invalid = false, tone = "light", className = "", id, ...props },
  ref
) {
  const fieldId = id ?? `login-field-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <label
      className={`nse-login-field nse-login-field--${tone} ${invalid ? "is-invalid" : ""} ${className}`.trim()}
      htmlFor={fieldId}
    >
      <span className="nse-login-field-label">{label}</span>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={invalid ? "true" : undefined}
        {...props}
      />
    </label>
  );
});
