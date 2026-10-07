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

import { useId } from "react";

/** A raised arrow on the same ground plane as the glass shelf. The extrusion
 * stays below the face in both directions; rotating a flat icon flips it over. */
export function ChronosphereArrow({ direction }: { direction: "past" | "present" }) {
  const id = useId();
  const sign = direction === "past" ? 1 : -1;
  const points = [[0, -36], [32, -8], [13, -8], [13, 30], [-13, 30], [-13, -8], [-32, -8]]
    .map(([x, y]) => [48 + sign * (x * 0.94 + y * 0.64), 27 + sign * (x * -0.12 + y * 0.62)]);
  const polygon = (vertices: number[][]) => vertices.map(point => point.join(",")).join(" ");
  return <svg viewBox="0 0 96 64" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0" stopColor="#b4bdb9" /><stop offset="0.46" stopColor="#747e7a" /><stop offset="1" stopColor="#3c4643" />
    </linearGradient></defs>
    {points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      return <polygon key={index} points={polygon([point, next, [next[0], next[1] + 9], [point[0], point[1] + 9]])}
        fill={next[0] > point[0] ? "#17201e" : "#394340"} stroke="#505b56" strokeWidth="0.65" />;
    })}
    <polygon points={polygon(points)} fill={`url(#${id})`} stroke="#b5c0b9" strokeWidth="0.8" />
    <path d={direction === "past" ? "M48 8 57 25 79 44" : "M48 47 39 29 17 10"} fill="none" stroke="#d2dad4" strokeOpacity=".15" />
  </svg>;
}
