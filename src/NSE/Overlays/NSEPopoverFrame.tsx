/*
 * SynCloudOS
 * Copyright Â© 2026 Syndromatic Ltd. All rights reserved.
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

import { type Ref } from "react";

/** Shared visual frame; the window manager or overlay host owns its lifetime. */
export function PopoverFrame({ arrowRef, anchored }: { readonly arrowRef: Ref<HTMLSpanElement>; readonly anchored: boolean }) {
  return <>
    <svg className="nse-popover-frame" data-nse-part="popover-frame" aria-hidden>
      <path data-nse-part="popover-arrow-fill" />
      <path data-nse-part="popover-outline" />
    </svg>
    {anchored ? <span ref={arrowRef} className="nse-popover-arrow" data-nse-part="arrow" aria-hidden /> : null}
  </>;
}
