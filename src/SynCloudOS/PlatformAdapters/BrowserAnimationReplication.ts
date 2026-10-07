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

import type { AFXReplication } from "../../FX/AnimationFX/AFXReplication";
import { AFXTransform3D } from "../../FX/AnimationFX/AFXTransform3D";
import { GFXColour } from "../../FX/GraphicsFX/GFXColour";
import type { GFXRect } from "../../FX/GraphicsFX/GFXGeometry";
export function replicationSVG(
  source: string | readonly string[],
  replication: AFXReplication,
  bounds: GFXRect,
  id: string,
): string {
  const count = replication.instanceCount;
  if (!Number.isInteger(count) || count < 0 || count > 64)
    throw new RangeError("Invalid replica count.");
  if (typeof source !== "string" && source.length !== count)
    throw new RangeError("Replica history requires one source per instance.");
  const offsets = [
    replication.instanceRedOffset,
    replication.instanceGreenOffset,
    replication.instanceBlueOffset,
    replication.instanceAlphaOffset,
  ];
  if (offsets.some((value) => !Number.isFinite(value) || Math.abs(value) > 1))
    throw new RangeError("Invalid replica channel offset.");
  const colour = GFXColour.prototype.converting.call(
    replication.instanceColour,
    "srgb",
  ).components;
  const { r, g, b, a } = GFXColour.rgba(
    colour.r,
    colour.g,
    colour.b,
    colour.a,
  ).components;
  let transform = new AFXTransform3D();
  const sources: string[] = [];
  const copies: string[] = [];
  if (typeof source === "string")
    sources.push(`<g id="${id}-source">${source}</g>`);
  for (let index = 0; index < count; index++) {
    const state = replication.instances[index],
      opacity = state?.opacity ?? 1;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
      throw new RangeError("Invalid replica opacity.");
    const matrix = AFXTransform3D.translation(-bounds.x, -bounds.y)
      .multiply(transform)
      .multiply(state?.transform ?? new AFXTransform3D())
      .multiply(AFXTransform3D.translation(bounds.x, bounds.y))
      .toAffine();
    const channels = [
      r,
      0,
      0,
      0,
      index * offsets[0],
      0,
      g,
      0,
      0,
      index * offsets[1],
      0,
      0,
      b,
      0,
      index * offsets[2],
      0,
      0,
      0,
      a,
      index * offsets[3],
    ];
    const filter =
      '<filter id="' +
      id +
      "-color-" +
      index +
      '" color-interpolation-filters="sRGB" x="-100%" y="-100%" width="300%" height="300%"><feColorMatrix type="matrix" values="' +
      channels.join(" ") +
      '"/></filter>';
    const sourceId = typeof source === "string"
      ? `${id}-source`
      : `${id}-source-${index}`;
    if (typeof source !== "string")
      sources.push(
        `<g id="${sourceId}" data-afx-replica-source="${index}">${source[index]}</g>`,
      );
    copies.push(
      filter +
        '<use href="#' +
        sourceId +
        '" transform="matrix(' +
        [matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty].join(
          " ",
        ) +
        ')" opacity="' +
        opacity +
        '" filter="url(#' +
        id +
        "-color-" +
        index +
        ')"/>',
    );
    transform = transform.multiply(replication.instanceTransform);
  }
  return (
    "<defs>" +
    sources.join("") +
    "</defs>" +
    copies.join("")
  );
}

export function replicationProjectiveHTML(
  sources: readonly string[],
  replication: AFXReplication,
  bounds: GFXRect,
  id: string,
): string {
  const count = replication.instanceCount;
  if (!Number.isInteger(count) || count < 0 || count > 64)
    throw new RangeError("Invalid replica count.");
  if (sources.length !== count)
    throw new RangeError("Replica history requires one source per instance.");
  const offsets = [
    replication.instanceRedOffset,
    replication.instanceGreenOffset,
    replication.instanceBlueOffset,
    replication.instanceAlphaOffset,
  ];
  if (offsets.some((value) => !Number.isFinite(value) || Math.abs(value) > 1))
    throw new RangeError("Invalid replica channel offset.");
  const colour = GFXColour.prototype.converting.call(
    replication.instanceColour,
    "srgb",
  ).components;
  const { r, g, b, a } = GFXColour.rgba(
    colour.r,
    colour.g,
    colour.b,
    colour.a,
  ).components;
  if (
    offsets.some((value) => value !== 0) ||
    r !== 1 ||
    g !== 1 ||
    b !== 1 ||
    a !== 1
  )
    throw new TypeError(
      "Projective replication colour modulation requires a depth-preserving backend.",
    );
  let transform = new AFXTransform3D();
  const copies: string[] = [];
  for (let index = 0; index < count; index++) {
    const state = replication.instances[index];
    const opacity = state?.opacity ?? 1;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
      throw new RangeError("Invalid replica opacity.");
    const matrix = AFXTransform3D.translation(-bounds.x, -bounds.y)
      .multiply(transform)
      .multiply(state?.transform ?? new AFXTransform3D())
      .multiply(AFXTransform3D.translation(bounds.x, bounds.y));
    copies.push(
      `<div data-afx-replica="${index}" style="position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;transform-style:preserve-3d;pointer-events:none;opacity:${opacity};transform:${matrix.toCSS()}">` +
        `<div data-afx-replica-source="${index}" style="position:absolute;left:0;top:0;width:100%;height:100%;transform-style:preserve-3d">${sources[index]}</div>` +
        `</div>`,
    );
    transform = transform.multiply(replication.instanceTransform);
  }
  return copies.join("");
}
