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

import React, { type ReactNode } from "react";
import { NSEImage } from "./NSEImageResource";

/** @internal The image cell shared by buttons and segments. Template tint inherits the control's colour. */
export function NSEControlImage({ image }: { readonly image: ReactNode | NSEImage }): ReactNode {
  if (image instanceof NSEImage) return <span aria-hidden="true" data-nse-image-template={image.name} style={{
    display: "inline-block", flexShrink: 0, width: image.size.width, height: image.size.height,
    maxWidth: "100%", maxHeight: "100%", backgroundColor: "currentColor",
    maskImage: `url("${image.src}")`, WebkitMaskImage: `url("${image.src}")`,
    maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
  }} />;
  return typeof image === "string" ? <img src={image} alt="" draggable={false} /> : image;
}
