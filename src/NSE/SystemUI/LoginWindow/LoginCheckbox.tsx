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

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { useNSEFeedback, type HFXFeedbackRequest } from "../../Feedback";
import { loginWindowAssets } from "./loginWindowAssets";

export interface LoginCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  selectionHaptic?: HFXFeedbackRequest;
}

export function LoginCheckbox({
  label,
  selectionHaptic = "selection",
  className = "",
  id,
  disabled,
  onChange,
  ...props
}: LoginCheckboxProps) {
  const feedback = useNSEFeedback();

  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label className={`nse-checkbox ${disabled ? "is-disabled" : ""} ${className}`} htmlFor={inputId}>
      <span className="nse-checkbox-control">
        <input
          id={inputId}
          type="checkbox"
          disabled={disabled}
          onChange={(event) => {
            onChange?.(event);
            if (!disabled && !event.defaultPrevented) feedback?.trigger(selectionHaptic);
          }}
          {...props}
        />
        <span className="nse-checkbox-art" aria-hidden="true">
          <img className="nse-checkbox-art-unchecked" src={loginWindowAssets.checkboxUnchecked} alt="" draggable={false} />
          <img className="nse-checkbox-art-checked" src={loginWindowAssets.checkboxChecked} alt="" draggable={false} />
        </span>
      </span>
      <span className="nse-checkbox-label">{label}</span>
    </label>
  );
}
