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

import type { PasteboardRepresentation } from "../../../SynCloudOS/SynCloudOS";
import { GFXColour } from "../../../FX/GraphicsFX/public";

export function serialiseNSEColourTransfer(colour: GFXColour): readonly PasteboardRepresentation[] {
  const value = colour.toCSS();
  return Object.freeze([
    Object.freeze({ type: "application/x-syncloudos-colour" as const, value }),
    Object.freeze({ type: "text/plain" as const, value }),
  ]);
}

export function parseNSEColourTransfer(values: readonly PasteboardRepresentation[]): GFXColour | null {
  const representation = values.find(({ type }) => type === "application/x-syncloudos-colour")
    ?? values.find(({ type }) => type === "text/plain");
  if (!representation || typeof representation.value !== "string") return null;
  try { return GFXColour.parse(representation.value); } catch { return null; }
}
