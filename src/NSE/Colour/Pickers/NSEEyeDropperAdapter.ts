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

import type { GFXColour } from "../../../FX/GraphicsFX/public";

export type NSEEyeDropperResult =
  | Readonly<{ kind: "accepted"; colour: GFXColour }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "error"; error: unknown }>;

export interface NSEEyeDropperAdapter {
  availability(): "available" | "unavailable";
  pick(signal?: AbortSignal): Promise<NSEEyeDropperResult>;
}

export function classifyEyeDropperError(error: unknown): NSEEyeDropperResult {
  if (error instanceof DOMException && error.name === "AbortError") return Object.freeze({ kind: "cancelled" });
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) return Object.freeze({ kind: "denied" });
  return Object.freeze({ kind: "error", error });
}
