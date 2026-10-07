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

import { useOptionalNSEOverlayProvider } from "../Overlays";
import { NSEPicker } from "./NSEPicker";

export interface NSEChoiceOption {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface NSEChoiceControlProps {
  readonly label: string;
  /** Keep the label for assistive technology only (segment editors). */
  readonly labelHidden?: boolean;
  /** Spoken name when it should say more than the visible caption. */
  readonly accessibleLabel?: string;
  readonly value: string;
  readonly options: readonly NSEChoiceOption[];
  readonly disabled?: boolean;
  readonly className?: string;
  /** A structural hook (data-nse-part) for the enclosing control's styling and evidence. */
  readonly part?: string;
  onChange(value: string): void;
}

/**
 * An in-app choice. Hosted documents get the canonical NSEPicker (the Atmo
 * pill and the shared listbox overlay); only a document with no overlay host
 * falls back to a native select, which is then the one intentional native
 * surface. Callers never pick between the two themselves.
 */
export function NSEChoiceControl({ label, labelHidden = false, accessibleLabel, value, options, disabled = false, className, part, onChange }: NSEChoiceControlProps) {
  const provider = useOptionalNSEOverlayProvider();
  if (!provider?.defaultParentResponderId) {
    return (
      <label className={["nse-choice-control", className].filter(Boolean).join(" ")} data-nse-choice="native" data-nse-part={part}>
        {labelHidden ? <span className="nse-control-visually-hidden">{label}</span> : label}
        <select aria-label={accessibleLabel ?? label} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
          {options.map((option) => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>)}
        </select>
      </label>
    );
  }
  return (
    <NSEPicker
      className={["nse-choice-control", className].filter(Boolean).join(" ")}
      data-nse-choice="picker"
      data-nse-part={part}
      label={label}
      labelHidden={labelHidden}
      accessibleLabel={accessibleLabel}
      disabled={disabled}
      value={value}
      options={options.map((option) => ({ value: option.id, label: option.label, disabled: option.disabled }))}
      onValueChange={onChange}
    />
  );
}
