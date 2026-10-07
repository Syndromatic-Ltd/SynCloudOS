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

import type { NSEDataViewKey } from "./dataViewTypes";

export function encodeNSEDataViewKey(value: NSEDataViewKey): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError("Data-view identity numbers must be finite and must not be negative zero.");
    const text = String(value);
    return `n${text.length}x${encodeCodeUnits(text)}`;
  }
  if (typeof value !== "string") throw new TypeError("Data-view identity values must be strings or finite supported numbers.");
  return `s${value.length}x${encodeCodeUnits(value)}`;
}

export function decodeNSEDataViewKey(value: string): NSEDataViewKey {
  const separator = value.indexOf("x", 1);
  if (separator < 2 || (value[0] !== "n" && value[0] !== "s")) throw new TypeError("Invalid data-view key token.");
  const lengthText = value.slice(1, separator);
  if (!/^(0|[1-9]\d*)$/.test(lengthText)) throw new TypeError("Invalid data-view key token length.");
  const length = Number(lengthText);
  const payload = value.slice(separator + 1);
  if (payload.length !== length * 4 || !/^[\da-f]*$/.test(payload)) throw new TypeError("Invalid data-view key token payload.");
  const decoded = decodeCodeUnits(payload);
  if (value[0] === "n") {
    const number = Number(decoded);
    if (!Number.isFinite(number) || Object.is(number, -0) || String(number) !== decoded) throw new TypeError("Invalid numeric data-view key token.");
    return number;
  }
  return decoded;
}

function encodeCodeUnits(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) result += value.charCodeAt(index).toString(16).padStart(4, "0");
  return result;
}

function decodeCodeUnits(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 4) result += String.fromCharCode(Number.parseInt(value.slice(index, index + 4), 16));
  return result;
}
