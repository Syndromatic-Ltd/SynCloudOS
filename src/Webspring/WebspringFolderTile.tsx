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

import { useId, useLayoutEffect, useState, type CSSProperties } from "react";
import { resolveWebspringFolderTileGeometry, useWebspringFolderAppearance } from "./WebspringFolderAppearance";
import type { WebspringFolderItem } from "./webspringTypes";
import "./WebspringFolderTile.css";

export interface WebspringFolderTileProps {
  readonly folder: WebspringFolderItem;
  /** Lit while a dragged app hovers to merge into this folder. */
  readonly dropTarget?: boolean;
  readonly className?: string;
}

/** How far the shading frames reach past the tile, in pixels: beyond the widest blur. */
const BLEED = 32;

/**
 * A folder's icon: a well, in the definition's folder appearance, showing up to
 * nine member icons.
 *
 * The well is clipped to the shape, so its shading is drawn from the same path
 * in SVG rather than with box shadows, which follow the box and not the clip:
 * the inner shadow and lower highlight are a frame around the shape, offset and
 * clipped with the well; the lip below, the drop-target ring and its shadow are
 * masked to outside the shape.
 */
export function WebspringFolderTile({ folder, dropTarget = false, className }: WebspringFolderTileProps) {
  const appearance = useWebspringFolderAppearance();
  const [element, setElement] = useState<HTMLSpanElement | null>(null);
  const [size, setSize] = useState<{ readonly width: number; readonly height: number } | null>(null);
  const id = `webspring-folder-tile-${useId().replace(/[^\w-]/gu, "")}`;

  useLayoutEffect(() => {
    if (!element) return undefined;
    // Layout size, which transforms (the drop-target scale, a dial's rotation) leave alone.
    const measure = () => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      setSize((current) => width <= 0 || height <= 0
        ? null
        : current?.width === width && current.height === height ? current : { width, height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  const geometry = size && resolveWebspringFolderTileGeometry(appearance.shape, size.width, size.height);
  const fill = appearance.fill;
  const style = {
    ...(geometry ? { "--webspring-folder-tile-clip": geometry.clipPath } : {}),
    ...(fill === "inset" ? {} : {
      "--webspring-folder-tile-texture": `url("${fill.image.replace(/["\\\n\r\f]/gu, (character) => `\\${character.charCodeAt(0).toString(16)} `)}")`,
      "--webspring-folder-tile-texture-size": fill.size,
      "--webspring-folder-tile-texture-colour": fill.colour,
    }),
  } as CSSProperties;
  const frame = geometry && size
    ? `M ${-BLEED} ${-BLEED} H ${size.width + BLEED} V ${size.height + BLEED} H ${-BLEED} Z ${geometry.path}`
    : null;

  return <span
    ref={setElement}
    className={`webspring-folder-tile${className ? ` ${className}` : ""}`}
    data-shape={appearance.shape.kind}
    data-fill={fill === "inset" ? "inset" : "texture"}
    data-drop-target={dropTarget ? "true" : undefined}
    style={style}
    aria-hidden="true"
  >
    {geometry && size ? <svg
      className="webspring-folder-tile-rim"
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${size.width} ${size.height}`}
      overflow="visible"
    >
      <defs>
        <mask id={`${id}-outside`} maskUnits="userSpaceOnUse" x={-BLEED} y={-BLEED} width={size.width + 2 * BLEED} height={size.height + 2 * BLEED}>
          <rect x={-BLEED} y={-BLEED} width={size.width + 2 * BLEED} height={size.height + 2 * BLEED} fill="#fff" />
          <path d={geometry.path} fill="#000" />
        </mask>
        <filter id={`${id}-shadow`} filterUnits="userSpaceOnUse" x={-BLEED} y={-BLEED} width={size.width + 2 * BLEED} height={size.height + 2 * BLEED}>
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <g mask={`url(#${id}-outside)`}>
        <path className="webspring-folder-tile-lip" d={geometry.path} transform="translate(0 1)" />
        <g className="webspring-folder-tile-ring">
          <path className="webspring-folder-tile-ring-shadow" d={geometry.path} transform="translate(0 8)" filter={`url(#${id}-shadow)`} />
          <path className="webspring-folder-tile-ring-stroke" d={geometry.path} fill="none" strokeWidth="6" />
        </g>
      </g>
    </svg> : null}
    <span className="webspring-folder-tile-surface">
      {frame && size ? <svg
        className="webspring-folder-tile-shading"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
      >
        <defs>
          <filter id={`${id}-inner`} filterUnits="userSpaceOnUse" x={-BLEED} y={-BLEED} width={size.width + 2 * BLEED} height={size.height + 2 * BLEED}>
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>
        <path className="webspring-folder-tile-inner-shadow" d={frame} fillRule="evenodd" transform="translate(0 2)" filter={`url(#${id}-inner)`} />
        <path className="webspring-folder-tile-inner-highlight" d={frame} fillRule="evenodd" transform="translate(0 -1)" />
      </svg> : null}
    </span>
    {folder.apps.slice(0, 9).map((app) => <span key={app.id} className="webspring-folder-tile-member">
      {app.iconUrl ? <img src={app.iconUrl} alt="" draggable={false} /> : <span>{app.title.slice(0, 1)}</span>}
    </span>)}
  </span>;
}
