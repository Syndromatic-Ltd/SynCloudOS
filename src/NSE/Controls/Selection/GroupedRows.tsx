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

import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { cloneElement } from "../../Theme/contract/hookMirrorReact";
import { NSEBox, type NSEBoxProps } from "../Fields/NSEFields";
import { classes } from "../Core/nseControlsShared";

export type GroupedRowsEdge = "first" | "middle" | "last" | "only";

export interface GroupedRowsProps extends Omit<NSEBoxProps, "children"> {
  /** Direct GroupedRow children; adjacent row bevels form the shared seams. */
  readonly children: ReactNode;
}

function edgeFor(index: number, count: number): GroupedRowsEdge {
  if (count === 1) return "only";
  if (index === 0) return "first";
  if (index === count - 1) return "last";
  return "middle";
}

/**
 * The neutral group-box/list composition used by Preferences-quality source
 * lists. It keeps rows as direct group-inner children and inherits the
 * canonical paired list-item bevel at each internal seam; unlike a section
 * divider, that treatment remains part of the selected/held row surface.
 * It also publishes the frame-minus-inset edge geometry for every selected,
 * held, and focused paint layer.
 */
export function GroupedRows({ children, className = "", ...props }: GroupedRowsProps) {
  const items = Children.toArray(children).filter(isValidElement) as Array<ReactElement<Record<string, unknown>>>;

  return (
    <NSEBox
      {...props}
      className={classes("nse-control-grouped-list", className)}
      data-nse-style="grouped" data-nse-grouped-list="true"
      data-nse-grouped-list-inner-radius="frame-minus-row-inset"

    >
      {items.map((item, index) => cloneElement(item, {
        "data-nse-grouped-list-edge": edgeFor(index, items.length),
        "data-nse-position": items.length === 1 ? "single" : edgeFor(index, items.length),
        key: item.key ?? `nse-grouped-list-item-${index}`,
      }))}
    </NSEBox>
  );
}
