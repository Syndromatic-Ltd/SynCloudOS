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

import type { KeyboardEventHandler } from "react";
import type { WindowRecord, WindowRole } from "../../SynCloudOS/SynCloudOS";
import type { NSEWindowViewProps } from "./windowViewTypes";

export function assertNSEWindowViewRole(component: string, record: WindowRecord, expected: WindowRole): void {
  if (record.role !== expected) {
    throw new TypeError(`${component} requires a ${expected} window record; received ${record.role}.`);
  }
}

export function windowEscapeCloseHandler(
  props: Pick<NSEWindowViewProps, "record" | "dispatchCommand">,
  enabled: boolean,
): KeyboardEventHandler<HTMLElement> | undefined {
  if (!enabled) return undefined;
  return (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void props.dispatchCommand("window.close", { windowControllerId: props.record.id });
  };
}
