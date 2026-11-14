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
import { useNSEAppearance } from "../../Appearance/NSEAppearanceProvider";
import { NSEImage } from "./NSEImageResource";

/** @internal The image cell shared by buttons and segments. Template tint inherits the control's colour. */
export function ControlImage({ image }: { readonly image: ReactNode | NSEImage }): ReactNode {
  const { theme } = useNSEAppearance();
  const resolved = image instanceof NSEImage ? NSEImage.named(image.name, theme) ?? image : null;
  const source = resolved ? Object.keys(resolved.files).length > 1 ? `image-set(${Object.entries(resolved.files).map(([scale, path]) => `url("${path}") ${scale}`).join(", ")})` : `url("${resolved.src}")` : "";
  const maskSource = typeof CSS !== "undefined" && CSS.supports?.("mask-image", source) ? source : resolved ? `url("${resolved.src}")` : "";
  if (resolved && !resolved.isTemplate) return <img src={resolved.src} srcSet={Object.entries(resolved.files).map(([scale, path]) => `${path} ${scale}`).join(", ")} alt="" draggable={false} width={resolved.size.width} height={resolved.size.height} />;
  if (resolved) return <span aria-hidden="true" data-nse-image-template={resolved.name} style={{
    display: "inline-block", flexShrink: 0, width: resolved.size.width, height: resolved.size.height,
    maxWidth: "100%", maxHeight: "100%", backgroundColor: "currentColor",
    maskImage: maskSource, WebkitMaskImage: maskSource,
    maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
  }} />;
  return typeof image === "string" ? <img src={image} alt="" draggable={false} /> : image as ReactNode;
}
