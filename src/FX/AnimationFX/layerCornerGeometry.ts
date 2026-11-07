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

import type { AFXLayerCorner } from "./AFXLayerStyle";

/** A sampled exponent-four superellipse, matching CSS corner-shape: squircle. */
export function continuousLayerPath(x: number, y: number, width: number, height: number, radius: number, corners: readonly AFXLayerCorner[]): string {
  const r = Math.min(Math.max(0, radius), width / 2, height / 2);
  const points: string[] = [];
  const add = (px: number, py: number) => points.push(`${points.length ? "L" : "M"} ${Number(px.toFixed(5))} ${Number(py.toFixed(5))}`);
  const arc = (corner: AFXLayerCorner, cx: number, cy: number, start: number, squareX: number, squareY: number) => {
    if (!r || !corners.includes(corner)) { add(squareX, squareY); return; }
    for (let i = 0; i <= 32; i++) {
      const angle = start + i * Math.PI / 64;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      add(cx + r * Math.sign(cosine) * Math.sqrt(Math.abs(cosine)), cy + r * Math.sign(sine) * Math.sqrt(Math.abs(sine)));
    }
  };
  arc("top-right", x + width - r, y + r, -Math.PI / 2, x + width, y);
  arc("bottom-right", x + width - r, y + height - r, 0, x + width, y + height);
  arc("bottom-left", x + r, y + height - r, Math.PI / 2, x, y + height);
  arc("top-left", x + r, y + r, Math.PI, x, y);
  return points.join(" ") + " Z";
}
