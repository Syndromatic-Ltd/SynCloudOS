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

import type { NSEControllerDisposalReason } from "../../Controllers/NSEController";
import type { NSEDataViewState } from "./dataViewTypes";

/** The state a data view presents once its controller is disposed: rows stay
 * visible, but the view is disabled and ignores selection and activation. */
export const dataViewDisposedControllerState: NSEDataViewState = Object.freeze({
  kind: "disabled",
  message: "This content is no longer available.",
});

/** Development builds only: explains why a data view dropped an interaction
 * instead of letting its disposed controller throw from an event handler. */
export function warnDisposedDataViewController(
  controller: { readonly id: string; readonly disposalReason: NSEControllerDisposalReason | undefined },
  interaction: string,
): void {
  if (!import.meta.env.DEV) return;
  console.warn(
    `[NSE_CONTROLLER_DISPOSED] A data view ignored ${interaction} because its controller "${controller.id}" was disposed (${controller.disposalReason ?? "explicit"}). `
    + "The view stays inert until it is given a live controller. Create controllers with useNSEArrayController() or useNSETreeController() "
    + "so React StrictMode's effect replay cannot dispose them while the view is mounted.",
  );
}
