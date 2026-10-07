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

/** The original Spin Distortion kernel, on the complete cloud sublayer tree. */
export const VORTEX_SPIN_SHADER = `
vec4 ifxMain(vec2 inputUv, vec2 size) {
  vec2 centered = inputUv - 0.5;
  float dN = length(centered);
  float f0 = 1.0 - dN / uRadius;
  float idv = pow(max(f0, 0.0), uPower) + 0.5;
  float a = atan(centered.y, centered.x) + uAngle * idv * f0;
  vec2 uv = vec2(cos(a), sin(a)) * dN + 0.5;
  vec4 tex = texture(ifxInput, uv);
  float edge = smoothstep(1.0, 0.62, dN * 2.0);
  return vec4(tex.rgb, uAlpha * edge);
}`;

/** Original quad UV cover/drift, tint and radial fade for the image plates. */
export const VORTEX_PLATE_SHADER = `
vec4 ifxMain(vec2 uv, vec2 size) {
  vec2 sourceUv = uv * uUvScale + uUvOffset;
  vec4 tex = texture(ifxInput, vec2(sourceUv.x, 1.0 - sourceUv.y));
  float fade = 1.0;
  if (uRadialFade > 0.5) fade = smoothstep(1.0, 0.55, length(uv - 0.5) * 2.0);
  return vec4(tex.rgb * uTint, tex.a * fade * uAlpha);
}`;
