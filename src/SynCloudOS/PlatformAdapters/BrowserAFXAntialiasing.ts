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

import type { AFXRendererQuad, AFXRendererScene } from '../../FX/AnimationFX/AFXRenderer';

export const antialiasedVertexStride = 27;
export const antialiasedAttributes = [
  ['a_clip', 4, 0], ['a_local_uv', 2, 4], ['a_opacity', 1, 6],
  ['a_colour_scale', 4, 7], ['a_colour_offset', 4, 11],
  ['a_contents_rect', 4, 15], ['a_mask_rect', 4, 19], ['a_edges', 4, 23],
] as const;

export const antialiasedVertexSource = `#version 300 es
in vec4 a_clip;
in vec2 a_local_uv;
in float a_opacity;
in vec4 a_colour_scale;
in vec4 a_colour_offset;
in vec4 a_contents_rect;
in vec4 a_mask_rect;
in vec4 a_edges;
out vec2 v_local_uv;
out float v_opacity;
flat out vec4 v_colour_scale;
flat out vec4 v_colour_offset;
flat out vec4 v_contents_rect;
flat out vec4 v_mask_rect;
flat out vec4 v_edges;
void main() {
  gl_Position = a_clip;
  v_local_uv = a_local_uv;
  v_opacity = a_opacity;
  v_colour_scale = a_colour_scale;
  v_colour_offset = a_colour_offset;
  v_contents_rect = a_contents_rect;
  v_mask_rect = a_mask_rect;
  v_edges = a_edges;
}`;

export const antialiasedFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D u_video;
uniform sampler2D u_mask;
uniform bool u_has_mask;
uniform bool u_premultiplied;
uniform bool u_accumulated;
in vec2 v_local_uv;
in float v_opacity;
flat in vec4 v_colour_scale;
flat in vec4 v_colour_offset;
flat in vec4 v_contents_rect;
flat in vec4 v_mask_rect;
flat in vec4 v_edges;
out vec4 out_colour;
void main() {
  // Disabled edges cover the complete pixel square geometrically, then use
  // its centre for a hard inside/outside decision. Enabled edges keep their
  // original geometry and therefore get actual per-sample colour AND depth.
  if ((v_edges.x == 0.0 && v_local_uv.x < 0.0) ||
      (v_edges.y == 0.0 && v_local_uv.x > 1.0) ||
      (v_edges.z == 0.0 && v_local_uv.y > 1.0) ||
      (v_edges.w == 0.0 && v_local_uv.y < 0.0)) discard;
  vec2 local = clamp(v_local_uv, 0.0, 1.0);
  vec2 uv = v_contents_rect.xy + local * v_contents_rect.zw;
  vec2 mask_uv = v_mask_rect.xy + local * v_mask_rect.zw;
  vec4 source = texture(u_video, vec2(uv.x, 1.0 - uv.y));
  float mask_alpha = u_has_mask ? texture(u_mask, vec2(mask_uv.x, 1.0 - mask_uv.y)).a : 1.0;
  if (u_accumulated) {
    float alpha = clamp(source.a * v_colour_scale.a + v_colour_offset.a, 0.0, 1.0);
    float alpha_scale = source.a > 0.0 ? alpha / source.a : v_colour_scale.a;
    vec3 rgb = clamp((source.rgb * v_colour_scale.rgb + v_colour_offset.rgb * source.a) * alpha_scale, 0.0, 1.0);
    float weight = v_opacity * mask_alpha;
    out_colour = vec4(rgb * weight, alpha * weight);
    return;
  }
  if (u_premultiplied) source.rgb = source.a > 0.0 ? source.rgb / source.a : vec3(0.0);
  vec4 colour = clamp(source * v_colour_scale + v_colour_offset, 0.0, 1.0);
  out_colour = vec4(colour.rgb, colour.a * v_opacity * mask_alpha);
}`;

const nearPlane = .05;
const order = [0, 1, 2, 0, 2, 3] as const;
const neutral = { scale: { r: 1, g: 1, b: 1, a: 1 }, offset: { r: 0, g: 0, b: 0, a: 0 } };
const unit = { x: 0, y: 0, width: 1, height: 1 };
type Corner = number[]; // Homogeneous clip coordinates followed by local u,v.

function clip(corners: readonly Corner[]): Corner[] {
  const result: Corner[] = [];
  for (let index = 0; index < corners.length; index++) {
    const a = corners[index]!, b = corners[(index + 1) % corners.length]!;
    const insideA = a[3]! >= nearPlane, insideB = b[3]! >= nearPlane;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (nearPlane - a[3]!) / (b[3]! - a[3]!);
      result.push(a.map((value, component) => value + (b[component]! - value) * t));
    }
  }
  return result;
}

/** Extend only hard edges by one backing pixel, with perspective-correct UVs. */
function coverDisabledEdges(corners: Corner[], quad: AFXRendererQuad, scene: AFXRendererScene,
  ratio: number, mask: number): Corner[] {
  if (mask === 15 || corners.length < 3) return corners;
  const screen = corners.map(p => [(p[0]! / p[3]! + 1) * scene.width / 2,
    (1 - p[1]! / p[3]!) * scene.height / 2]);
  const area = screen.reduce((sum, p, i) => {
    const q = screen[(i + 1) % screen.length]!; return sum + p[0]! * q[1]! - q[0]! * p[1]!;
  }, 0);
  if (Math.abs(area) < 1e-12) return [];
  const sign = Math.sign(area);
  const lines = screen.map((p, i) => {
    const next = (i + 1) % screen.length, q = screen[next]!;
    const a = corners[i]!, b = corners[next]!;
    const equal = (index: number, value: number) => Math.abs(a[index]! - value) < 1e-9 && Math.abs(b[index]! - value) < 1e-9;
    // A newly clipped near-plane edge is not one of the four CALayer edges.
    const flag = equal(4, 0) ? 1 : equal(4, 1) ? 2 : equal(5, 1) ? 4 : equal(5, 0) ? 8 : 0;
    const dx = q[0]! - p[0]!, dy = q[1]! - p[1]!, length = Math.hypot(dx, dy);
    const nx = -sign * dy / length, ny = sign * dx / length;
    return [nx, ny, -nx * p[0]! - ny * p[1]! + (flag && !(mask & flag) ? 1 / ratio : 0)];
  });
  const m = quad.transform.values, bounds = quad.bounds;
  return corners.map((original, i) => {
    const a = lines[(i + lines.length - 1) % lines.length]!, b = lines[i]!;
    const determinant = a[0]! * b[1]! - b[0]! * a[1]!;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return original;
    const x = (a[1]! * b[2]! - b[1]! * a[2]!) / determinant;
    const y = (a[2]! * b[0]! - b[2]! * a[0]!) / determinant;
    const aa = m[0]! - x * m[3]!, bb = m[4]! - x * m[7]!;
    const cc = m[1]! - y * m[3]!, dd = m[5]! - y * m[7]!;
    const det = aa * dd - bb * cc;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return original;
    const ex = x * m[15]! - m[12]!, ey = y * m[15]! - m[13]!;
    const lx = (ex * dd - bb * ey) / det, ly = (aa * ey - ex * cc) / det;
    const w = m[3]! * lx + m[7]! * ly + m[15]!;
    return [(2 * x / scene.width - 1) * w, (1 - 2 * y / scene.height) * w,
      -(m[2]! * lx + m[6]! * ly + m[14]!) / 16384, w,
      (lx - bounds.x) / bounds.width, (ly - bounds.y) / bounds.height];
  });
}

/** Writes one vertex: position and local UV from `values`, then the quad's
 * flat attributes. Module-level so packing allocates no per-quad closure. */
function writeVertex(output: Float32Array, cursor: number, values: ArrayLike<number>, start: number,
  quad: AFXRendererQuad, colour: typeof neutral, uv: typeof unit, maskUV: typeof unit, mask: number): number {
  for (let i = 0; i < 6; i++) output[cursor + i] = values[start + i]!;
  output[cursor + 6] = quad.opacity;
  output[cursor + 7] = colour.scale.r; output[cursor + 8] = colour.scale.g;
  output[cursor + 9] = colour.scale.b; output[cursor + 10] = colour.scale.a;
  output[cursor + 11] = colour.offset.r; output[cursor + 12] = colour.offset.g;
  output[cursor + 13] = colour.offset.b; output[cursor + 14] = colour.offset.a;
  output[cursor + 15] = uv.x; output[cursor + 16] = uv.y;
  output[cursor + 17] = uv.width; output[cursor + 18] = uv.height;
  output[cursor + 19] = maskUV.x; output[cursor + 20] = maskUV.y;
  output[cursor + 21] = maskUV.width; output[cursor + 22] = maskUV.height;
  output[cursor + 23] = mask & 1; output[cursor + 24] = (mask >> 1) & 1;
  output[cursor + 25] = (mask >> 2) & 1; output[cursor + 26] = (mask >> 3) & 1;
  return cursor + antialiasedVertexStride;
}

const projectedScratch = new Float64Array(24);

/** Caller-owned scratch storage keeps the moving MSAA path allocation-bounded.
 * Packs quads[start, end), so a renderer can pass runs without copying them. */
export function packAntialiasedQuadVertices(quads: readonly AFXRendererQuad[], scene: AFXRendererScene,
  ratio = scene.pixelRatio ?? 1, storage?: Float32Array, start = 0, end = quads.length): Float32Array {
  const maximum = (end - start) * 9 * antialiasedVertexStride;
  const output = storage ?? new Float32Array(maximum);
  if (output.length < maximum) throw new RangeError('Antialiased geometry storage is too small.');
  const projected = projectedScratch;
  let cursor = 0;
  for (let quadIndex = start; quadIndex < end; quadIndex++) {
    const quad = quads[quadIndex]!;
    const mask = quad.edgeAntialiasingMask ?? 0;
    if (!Number.isInteger(mask) || mask < 0 || mask > 15) throw new RangeError('Invalid layer edge antialiasing mask.');
    const m = quad.transform.values, b = quad.bounds, uv = quad.uv, maskUV = quad.mask?.uv ?? unit;
    if (b.width <= 0 || b.height <= 0) continue;
    const colour = quad.colourModulation ?? neutral;
    let clipped = false;
    for (let corner = 0; corner < 4; corner++) {
      const u = corner === 1 || corner === 2 ? 1 : 0, v = corner >= 2 ? 1 : 0;
      const x = b.x + u * b.width, y = b.y + v * b.height;
      const px = m[0]! * x + m[4]! * y + m[12]!, py = m[1]! * x + m[5]! * y + m[13]!;
      const pz = m[2]! * x + m[6]! * y + m[14]!, w = m[3]! * x + m[7]! * y + m[15]!;
      if (!Number.isFinite(px + py + pz + w)) throw new RangeError('Layer renderer projection must be finite.');
      const offset = corner * 6;
      projected[offset] = 2 * px / scene.width - w; projected[offset + 1] = w - 2 * py / scene.height;
      projected[offset + 2] = -pz / 16384; projected[offset + 3] = w;
      projected[offset + 4] = u; projected[offset + 5] = v;
      clipped ||= w < nearPlane;
    }
    if (mask === 15 && !clipped) {
      for (let vertex = 0; vertex < 6; vertex++)
        cursor = writeVertex(output, cursor, projected, order[vertex]! * 6, quad, colour, uv, maskUV, mask);
    } else {
      let corners = Array.from({ length: 4 }, (_, i) => Array.from(projected.subarray(i * 6, i * 6 + 6)));
      if (clipped) corners = clip(corners);
      corners = coverDisabledEdges(corners, quad, scene, ratio, mask);
      for (let i = 1; i + 1 < corners.length; i++) {
        cursor = writeVertex(output, cursor, corners[0]!, 0, quad, colour, uv, maskUV, mask);
        cursor = writeVertex(output, cursor, corners[i]!, 0, quad, colour, uv, maskUV, mask);
        cursor = writeVertex(output, cursor, corners[i + 1]!, 0, quad, colour, uv, maskUV, mask);
      }
    }
  }
  return output.subarray(0, cursor);
}
