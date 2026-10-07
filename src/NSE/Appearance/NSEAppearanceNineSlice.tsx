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

import type { ComponentPropsWithoutRef } from "react";

const sliceParts = Object.freeze([
  "block-start-inline-start",
  "block-start-centre",
  "block-start-inline-end",
  "centre-inline-start",
  "centre",
  "centre-inline-end",
  "block-end-inline-start",
  "block-end-centre",
  "block-end-inline-end",
] as const);

interface NSEAppearanceNineSliceProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  readonly kind: "menu-surface" | "window-shadow";
}

/** Structural nine-slice paint plane. Appearance providers decide whether and
 * how its non-overlapping source regions are painted. */
export function NSEAppearanceNineSlice({ kind, className = "", ...props }: NSEAppearanceNineSliceProps) {
  return (
    <span
      {...props}
      className={["nse-appearance-nine-slice", className].filter(Boolean).join(" ")}
      data-nse-nine-slice={kind}
      aria-hidden="true"
    >
      {sliceParts.map((part) => (
        <span
          key={part}
          className="nse-appearance-nine-slice__part"
          data-nse-nine-slice-part={part}
        />
      ))}
    </span>
  );
}
