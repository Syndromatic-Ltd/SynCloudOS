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

import type { AFXRendererQuad, AFXRendererTarget, AFXRendererScene, AFXRendererViewport } from "../../FX/AnimationFX/AFXRenderer";
import { GFXImage } from "../../FX/GraphicsFX/GFXImage";
import { VFXFrame } from "../../FX/VideoFX/VFXFrame";
import { IFXShader } from '../../FX/ImageFX/IFXShader';
import { BrowserAFXShaderPipeline, compileAFXProgram } from './BrowserAFXShaderPipeline';
import { afxImageTexturePixels } from './BrowserAFXImagePixels';
import { BrowserAFXParticlePipeline } from './BrowserAFXParticlePipeline';
import { antialiasedAttributes, antialiasedFragmentSource, antialiasedVertexSource,
  antialiasedVertexStride, packAntialiasedQuadVertices } from './BrowserAFXAntialiasing';

const vertexSource = `#version 300 es
in vec4 a_clip;
in vec2 a_uv;
in float a_opacity;
in vec4 a_colour_scale;
in vec4 a_colour_offset;
in vec2 a_mask_uv;
out vec2 v_uv;
out float v_opacity;
out vec4 v_colour_scale;
out vec4 v_colour_offset;
out vec2 v_mask_uv;
void main() {
  gl_Position = a_clip;
  v_uv = a_uv;
  v_opacity = a_opacity;
  v_colour_scale = a_colour_scale;
  v_colour_offset = a_colour_offset;
  v_mask_uv = a_mask_uv;
}`;
const fragmentSource = `#version 300 es
precision mediump float;
uniform sampler2D u_video;
uniform sampler2D u_mask;
uniform bool u_has_mask;
uniform bool u_premultiplied;
uniform bool u_accumulated;
in vec2 v_uv;
in float v_opacity;
in vec4 v_colour_scale;
in vec4 v_colour_offset;
in vec2 v_mask_uv;
out vec4 out_colour;
void main() {
  vec4 source = texture(u_video, v_uv);
  float mask_alpha = u_has_mask ? texture(u_mask, v_mask_uv).a : 1.0;
  if (u_accumulated) {
    // Addition can retain RGB above (or beside a rounded-zero) alpha.
    // Keep those weighted channels intact and present them with ONE blending.
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

const vertexStride = 17;
const nearPlane = .05;
const neutralModulation: NonNullable<AFXRendererQuad["colourModulation"]> = Object.freeze({
  scale: Object.freeze({ r: 1, g: 1, b: 1, a: 1 }),
  offset: Object.freeze({ r: 0, g: 0, b: 0, a: 0 }),
});
const unitRect = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

function program(gl: WebGL2RenderingContext, vertexText = vertexSource, fragmentText = fragmentSource): WebGLProgram {
  return compileAFXProgram(gl, vertexText, fragmentText);
}

function vertex(
  quad: AFXRendererQuad,
  x: number,
  y: number,
  u: number,
  v: number,
  maskU: number,
  maskV: number,
  scene: AFXRendererScene,
): number[] {
  const m = quad.transform.values;
  const px = m[0] * x + m[4] * y + m[12];
  const py = m[1] * x + m[5] * y + m[13];
  const pz = m[2] * x + m[6] * y + m[14];
  const pw = m[3] * x + m[7] * y + m[15];
  if (!Number.isFinite(px + py + pz + pw)) throw new RangeError("Layer renderer projection must be finite.");
  const modulation = quad.colourModulation ?? neutralModulation;
  return [
    2 * px / scene.width - pw, pw - 2 * py / scene.height, -pz / 16384, pw,
    u, 1 - v, quad.opacity,
    modulation.scale.r, modulation.scale.g, modulation.scale.b, modulation.scale.a,
    modulation.offset.r, modulation.offset.g, modulation.offset.b, modulation.offset.a,
    maskU, 1 - maskV,
  ];
}

/** Clip in homogeneous space so a flyby may pass a panel without losing the scene. */
export function quadVertices(quad: AFXRendererQuad, scene: AFXRendererScene): number[] {
  const b = quad.bounds, uv = quad.uv;
  const mask = quad.mask?.uv ?? unitRect;
  const x0 = b.x, y0 = b.y, x1 = b.x + b.width, y1 = b.y + b.height;
  const u0 = uv.x, v0 = uv.y, u1 = uv.x + uv.width, v1 = uv.y + uv.height;
  const mu0 = mask.x, mv0 = mask.y, mu1 = mask.x + mask.width, mv1 = mask.y + mask.height;
  const corners = [
    vertex(quad, x0, y0, u0, v0, mu0, mv0, scene),
    vertex(quad, x1, y0, u1, v0, mu1, mv0, scene),
    vertex(quad, x1, y1, u1, v1, mu1, mv1, scene),
    vertex(quad, x0, y1, u0, v1, mu0, mv1, scene),
  ];
  const clipped: number[][] = [];
  for (let index = 0; index < corners.length; index++) {
    const from = corners[index], to = corners[(index + 1) % corners.length];
    const fromInside = from[3] >= nearPlane, toInside = to[3] >= nearPlane;
    if (fromInside) clipped.push(from);
    if (fromInside !== toInside) {
      const fraction = (nearPlane - from[3]) / (to[3] - from[3]);
      clipped.push(from.map((value, component) => value + (to[component] - value) * fraction));
    }
  }
  const triangles: number[] = [];
  for (let index = 1; index + 1 < clipped.length; index++)
    triangles.push(...clipped[0], ...clipped[index], ...clipped[index + 1]);
  return triangles;
}

function projectCorner(
  output: Float64Array,
  offset: number,
  matrix: readonly number[],
  x: number,
  y: number,
  scene: AFXRendererScene,
): void {
  const px = matrix[0] * x + matrix[4] * y + matrix[12];
  const py = matrix[1] * x + matrix[5] * y + matrix[13];
  const pz = matrix[2] * x + matrix[6] * y + matrix[14];
  const pw = matrix[3] * x + matrix[7] * y + matrix[15];
  // One sum is non-finite exactly when a component is; no per-corner array.
  if (!Number.isFinite(px + py + pz + pw)) throw new RangeError("Layer renderer projection must be finite.");
  output[offset] = 2 * px / scene.width - pw;
  output[offset + 1] = pw - 2 * py / scene.height;
  output[offset + 2] = -pz / 16384;
  output[offset + 3] = pw;
}

function writeProjectedVertex(
  output: Float32Array,
  offset: number,
  projected: Float64Array,
  projectedOffset: number,
  u: number,
  v: number,
  opacity: number,
  modulation: NonNullable<AFXRendererQuad["colourModulation"]>,
  maskU: number,
  maskV: number,
): number {
  output[offset] = projected[projectedOffset]!;
  output[offset + 1] = projected[projectedOffset + 1]!;
  output[offset + 2] = projected[projectedOffset + 2]!;
  output[offset + 3] = projected[projectedOffset + 3]!;
  output[offset + 4] = u;
  output[offset + 5] = 1 - v;
  output[offset + 6] = opacity;
  output[offset + 7] = modulation.scale.r;
  output[offset + 8] = modulation.scale.g;
  output[offset + 9] = modulation.scale.b;
  output[offset + 10] = modulation.scale.a;
  output[offset + 11] = modulation.offset.r;
  output[offset + 12] = modulation.offset.g;
  output[offset + 13] = modulation.offset.b;
  output[offset + 14] = modulation.offset.a;
  output[offset + 15] = maskU;
  output[offset + 16] = 1 - maskV;
  return offset + vertexStride;
}

const projectedScratch = new Float64Array(16);

/** Packs quads[start, end) in one pass; only a quad crossing the near plane
 * takes the clipping path, and its triangles land at its painter position. */
export function packQuadVertices(quads: readonly AFXRendererQuad[], scene: AFXRendererScene, storage?: Float32Array,
  start = 0, end = quads.length): Float32Array {
  const maximum = (end - start) * 9 * vertexStride;
  if (storage && storage.length < Math.min(maximum, (end - start) * 6 * vertexStride))
    throw new RangeError('Layer geometry storage is too small.');
  let output = storage ?? new Float32Array(maximum);
  const projected = projectedScratch;
  let offset = 0;
  for (let index = start; index < end; index++) {
    const quad = quads[index]!;
    const matrix = quad.transform.values;
    const b = quad.bounds, uv = quad.uv;
    const x0 = b.x, y0 = b.y, x1 = b.x + b.width, y1 = b.y + b.height;
    if (
      matrix[3] * x0 + matrix[7] * y0 + matrix[15] < nearPlane ||
      matrix[3] * x1 + matrix[7] * y0 + matrix[15] < nearPlane ||
      matrix[3] * x1 + matrix[7] * y1 + matrix[15] < nearPlane ||
      matrix[3] * x0 + matrix[7] * y1 + matrix[15] < nearPlane
    ) {
      const clipped = quadVertices({ ...quad, transform: { values: matrix } as AFXRendererQuad["transform"] }, scene);
      if (offset + clipped.length > output.length) {
        if (storage) throw new RangeError('Layer geometry storage is too small.');
        const grown = new Float32Array(Math.max(output.length * 2, offset + clipped.length));
        grown.set(output.subarray(0, offset));
        output = grown;
      }
      output.set(clipped, offset);
      offset += clipped.length;
      continue;
    }
    if (offset + 6 * vertexStride > output.length) throw new RangeError('Layer geometry storage is too small.');
    const mask = quad.mask?.uv ?? unitRect;
    const u0 = uv.x, v0 = uv.y, u1 = uv.x + uv.width, v1 = uv.y + uv.height;
    const mu0 = mask.x, mv0 = mask.y, mu1 = mask.x + mask.width, mv1 = mask.y + mask.height;
    const modulation = quad.colourModulation ?? neutralModulation;
    projectCorner(projected, 0, matrix, x0, y0, scene);
    projectCorner(projected, 4, matrix, x1, y0, scene);
    projectCorner(projected, 8, matrix, x1, y1, scene);
    projectCorner(projected, 12, matrix, x0, y1, scene);
    offset = writeProjectedVertex(output, offset, projected, 0, u0, v0, quad.opacity, modulation, mu0, mv0);
    offset = writeProjectedVertex(output, offset, projected, 4, u1, v0, quad.opacity, modulation, mu1, mv0);
    offset = writeProjectedVertex(output, offset, projected, 8, u1, v1, quad.opacity, modulation, mu1, mv1);
    offset = writeProjectedVertex(output, offset, projected, 0, u0, v0, quad.opacity, modulation, mu0, mv0);
    offset = writeProjectedVertex(output, offset, projected, 8, u1, v1, quad.opacity, modulation, mu1, mv1);
    offset = writeProjectedVertex(output, offset, projected, 12, u0, v1, quad.opacity, modulation, mu0, mv1);
  }
  return output.subarray(0, offset);
}

interface Pipeline {
  readonly program: WebGLProgram;
  readonly attributes: readonly { location: number; count: number; offset: number }[];
  readonly video: WebGLUniformLocation | null;
  readonly mask: WebGLUniformLocation | null;
  readonly hasMask: WebGLUniformLocation | null;
  readonly premultiplied: WebGLUniformLocation | null;
  readonly accumulated: WebGLUniformLocation | null;
  readonly stride: number;
}
const ordinaryAttributes = [
  ['a_clip', 4, 0], ['a_uv', 2, 4], ['a_opacity', 1, 6],
  ['a_colour_scale', 4, 7], ['a_colour_offset', 4, 11], ['a_mask_uv', 2, 15],
] as const;

/** One canvas compositor owned by AnimationFX, with one texture upload per shared content revision. */
interface TextureAllocation {
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

const maximumPooledTextureBytes = 64 * 1024 * 1024;
const maximumPooledTextures = 64;

export class BrowserAFXCanvasRenderer implements AFXRendererTarget {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext | null;
  readonly #fallback: CanvasRenderingContext2D | null;
  readonly #pipelines = new Map<boolean, Pipeline>();
  #particlePipeline: BrowserAFXParticlePipeline | null = null;
  #shaderPipeline: BrowserAFXShaderPipeline | null = null;
  readonly #effectTextures = new Map<AFXRendererQuad, { texture: WebGLTexture; premultiplied: boolean; accumulated: boolean }>();
  #buffer: WebGLBuffer | null = null;
  #bufferBytes = 0;
  readonly #enabledAttributes = new Set<number>();
  #geometry = new Float32Array(0);
  #samples: number | null = null;
  readonly #textures = new Map<VFXFrame | GFXImage, TextureAllocation>();
  readonly #texturePool: TextureAllocation[] = [];
  #pooledTextureBytes = 0;
  readonly #fallbackImages = new Map<VFXFrame | GFXImage, HTMLCanvasElement>();
  #fallbackStage: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null = null;
  #stage: { framebuffer: WebGLFramebuffer; colour: WebGLRenderbuffer; depth: WebGLRenderbuffer;
    width: number; height: number; samples: number } | null = null;
  #disposed = false;
  #pixelRatio = 1;
  #pendingViewport: AFXRendererViewport | null = null;
  #contextLost = false;
  readonly #invalidationListeners = new Set<() => void>();
  /** Scratch reused by every submission; cleared before and after use. */
  readonly #activeContents = new Set<VFXFrame | GFXImage>();
  readonly #uploadedThisRender: Array<VFXFrame | GFXImage> = [];
  readonly #groups: Array<{ content: VFXFrame | GFXImage; mask: GFXImage | null; opaque: boolean;
    addition: boolean; premultiplied: boolean; accumulated: boolean; texture: WebGLTexture | null;
    start: number; end: number; first: number; count: number }> = [];
  readonly #onContextLost = (event: Event) => {
    if (this.#disposed) return;
    event.preventDefault();
    this.#contextLost = true;
    this.#forgetGPUResources();
    for (const listener of this.#invalidationListeners) listener();
  };
  readonly #onContextRestored = () => {
    if (this.#disposed) return;
    this.#contextLost = false;
    this.#forgetGPUResources();
    // Rebuild from the owning renderer's CURRENT layer tree. Holding a prior
    // borrowed scene here would replay frames the media owner already closed.
    for (const listener of this.#invalidationListeners) listener();
  };

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    // Multisampling belongs to the staged colour/depth target. Resolve to the
    // single-sample canvas; a multisampled default canvas cannot receive a blit.
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (gl?.getContextAttributes()?.antialias)
      throw new DOMException("Layer renderer requires a single-sample WebGL2 canvas; this canvas already has a multisampled context.", "NotSupportedError");
    this.#gl = gl;
    this.#fallback = gl ? null : canvas.getContext("2d");
    if (!gl && !this.#fallback)
      throw new DOMException("Layer renderer canvas rendering is unavailable.", "NotSupportedError");
    if (gl) {
      if (!gl.isContextLost()) this.#pipeline(false);
      canvas.addEventListener('webglcontextlost', this.#onContextLost);
      canvas.addEventListener('webglcontextrestored', this.#onContextRestored);
    }
  }

  get backend(): "webgl2" | "canvas2d" { return this.#gl ? "webgl2" : "canvas2d"; }
  get supportsParticleBatches(): boolean { return Boolean(this.#gl); }
  get available(): boolean { return !this.#disposed && !this.#contextLost && !this.#gl?.isContextLost(); }

  subscribeInvalidation(listener: () => void): () => void {
    if (this.#disposed) throw new DOMException('Layer renderer is disposed.', 'InvalidStateError');
    this.#invalidationListeners.add(listener);
    return () => { this.#invalidationListeners.delete(listener); };
  }

  setViewport({ width, height, pixelRatio }: AFXRendererViewport): void {
    if (this.#disposed) throw new DOMException("Layer renderer renderer is disposed.", "InvalidStateError");
    const physicalWidth = Math.round(width * pixelRatio), physicalHeight = Math.round(height * pixelRatio);
    if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0 ||
      !Number.isFinite(pixelRatio) || pixelRatio <= 0 ||
      !Number.isSafeInteger(physicalWidth) || physicalWidth <= 0 ||
      !Number.isSafeInteger(physicalHeight) || physicalHeight <= 0)
      throw new RangeError("Layer renderer viewport requires bounded positive dimensions.");
    this.#pendingViewport = { width, height, pixelRatio };
  }

  render(scene: AFXRendererScene): void | boolean {
    if (this.#disposed) throw new DOMException("Layer renderer renderer is disposed.", "InvalidStateError");
    if (!this.available) return false;
    const ratio = scene.pixelRatio ?? 1;
    const targetWidth = Math.round(scene.width * ratio), targetHeight = Math.round(scene.height * ratio);
    const pending = this.#pendingViewport;
    if (pending ? (scene.width !== pending.width || scene.height !== pending.height || ratio !== pending.pixelRatio) :
      (ratio !== this.#pixelRatio || targetWidth !== this.#canvas.width || targetHeight !== this.#canvas.height))
      throw new RangeError("Layer renderer scene and canvas dimensions differ.");
    // #textureFor records what this submission uploads, so a failure can
    // release exactly those textures without snapshotting the whole map.
    const uploaded = this.#uploadedThisRender;
    uploaded.length = 0;
    try {
      if (this.#gl) this.#renderGL(scene, targetWidth, targetHeight, ratio);
      else this.#render2D(scene, targetWidth, targetHeight, ratio);
      if (!this.available) return false;
      this.#pendingViewport = null;
    } catch (error) {
      for (const content of uploaded) {
        const texture = this.#textures.get(content);
        if (!texture) continue;
        this.#gl?.deleteTexture(texture.texture);
        this.#textures.delete(content);
      }
      if (this.#gl?.isContextLost()) { this.#forgetGPUResources(); return false; }
      throw error;
    } finally {
      uploaded.length = 0;
      // Reused run records must not keep borrowed surfaces alive.
      for (const group of this.#groups) { group.content = null!; group.mask = null; group.texture = null; }
      this.#effectTextures.clear();
    }
    const active = this.#activeContents;
    const collect = (scene: AFXRendererScene) => {
      for (const quad of scene.quads) {
        if (quad.content instanceof GFXImage || quad.content instanceof VFXFrame) active.add(quad.content);
        if (quad.mask) active.add(quad.mask.content);
        if (quad.group) collect(quad.group.scene);
      }
      for (const batch of scene.particleBatches ?? []) {
        for (const particle of batch.particles) active.add(particle.contents);
        if (batch.mask) active.add(batch.mask.content);
      }
    };
    collect(scene);
    this.#textures.forEach((texture, content) => {
      if (active.has(content)) return;
      this.#recycleTexture(texture);
      this.#textures.delete(content);
    });
    if (this.#fallbackImages.size)
      this.#fallbackImages.forEach((_, content) => {
        if (!active.has(content)) this.#fallbackImages.delete(content);
      });
    active.clear();
  }

  #publishViewport(scene: AFXRendererScene, width: number, height: number, ratio: number): void {
    if (this.#canvas.width !== width) this.#canvas.width = width;
    if (this.#canvas.height !== height) this.#canvas.height = height;
    if (this.#pendingViewport) {
      this.#canvas.style.width = `${scene.width}px`;
      this.#canvas.style.height = `${scene.height}px`;
    }
    this.#pixelRatio = ratio;
  }

  #renderGL(scene: AFXRendererScene, width: number, height: number, ratio: number): void {
    const gl = this.#gl!;
    if (gl.isContextLost()) throw new DOMException("Layer renderer GPU context was lost.", "InvalidStateError");
    const shaders: IFXShader[] = [];
    const collect = (scene: AFXRendererScene) => {
      for (const quad of scene.quads) {
        if (quad.content instanceof IFXShader) shaders.push(quad.content);
        if (quad.group) { shaders.push(...quad.group.filters); collect(quad.group.scene); }
      }
    };
    collect(scene);
    if (shaders.length || scene.quads.some(quad => quad.group)) this.#shaderPipeline ??= new BrowserAFXShaderPipeline(gl);
    let success = false;
    try {
      this.#shaderPipeline?.begin(shaders);
      this.#prepareEffects(scene, ratio);
      const antialias = scene.quads.some(quad => (quad.edgeAntialiasingMask ?? 0) !== 0);
      this.#prepareStage(width, height, antialias ? this.#sampleCount() : 0);
      this.#drawGL(scene, width, height, ratio, this.#stage!.framebuffer);
      if (gl.isContextLost()) throw new DOMException('Layer renderer GPU context was lost.', 'InvalidStateError');
      this.#publishViewport(scene, width, height, ratio);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.#stage!.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      success = true;
    } finally {
      this.#shaderPipeline?.finish(success);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.depthMask(true);
    }
  }

  #prepareEffects(scene: AFXRendererScene, ratio: number): void {
    const pipeline = this.#shaderPipeline;
    if (!pipeline) return;
    for (const quad of scene.quads) {
      if (quad.group) {
        const subtree = quad.group.scene;
        this.#prepareEffects(subtree, ratio);
        const width = Math.ceil(subtree.width * ratio), height = Math.ceil(subtree.height * ratio);
        const antialias = subtree.quads.some(quad => (quad.edgeAntialiasingMask ?? 0) !== 0);
        let target = pipeline.acquire(width, height, antialias ? this.#sampleCount() : 0);
        this.#drawGL(subtree, width, height, ratio, target.framebuffer);
        pipeline.resolve(target);
        for (const filter of quad.group.filters) {
          const next = pipeline.acquire(width, height);
          pipeline.render(filter, next, target.texture);
          target = next;
        }
        const unfiltered = quad.group.filters.length === 0;
        const accumulated = unfiltered && (subtree.quads.some(child => child.compositingFilter?.parameters.mode === 'addition' ||
          this.#effectTextures.get(child)?.accumulated) ||
          (subtree.particleBatches ?? []).some(batch => batch.compositingFilter?.parameters.mode === 'addition'));
        this.#effectTextures.set(quad, { texture: target.texture, premultiplied: unfiltered && !accumulated, accumulated });
      } else if (quad.content instanceof IFXShader) {
        const target = pipeline.acquire(Math.ceil(quad.bounds.width * ratio), Math.ceil(quad.bounds.height * ratio));
        pipeline.render(quad.content, target, null);
        this.#effectTextures.set(quad, { texture: target.texture, premultiplied: false, accumulated: false });
      }
    }
  }

  #drawGL(scene: AFXRendererScene, width: number, height: number, ratio: number, framebuffer: WebGLFramebuffer): void {
    const gl = this.#gl!;
    const quads = scene.quads;
    let antialias = false;
    for (let index = 0; index < quads.length && !antialias; index++)
      antialias = (quads[index]!.edgeAntialiasingMask ?? 0) !== 0;
    const pipeline = this.#pipeline(antialias);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    try {
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(pipeline.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
    for (const location of this.#enabledAttributes)
      if (!pipeline.attributes.some(attribute => attribute.location === location)) gl.disableVertexAttribArray(location);
    this.#enabledAttributes.clear();
    const stride = pipeline.stride * Float32Array.BYTES_PER_ELEMENT;
    for (const { location, count, offset } of pipeline.attributes) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, count, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
      this.#enabledAttributes.add(location);
    }
    gl.uniform1i(pipeline.video, 0);
    gl.uniform1i(pipeline.mask, 1);
    // Preserve layer order: overlapping layers may use different video sources.
    // Consecutive shared-content runs still collapse to one draw each.
    // Runs are index ranges into scene.quads; group records are reused.
    const groups = this.#groups;
    let groupCount = 0;
    const batches = scene.particleBatches ?? [];
    let nextBreak = 0;
    for (let index = 0; index < quads.length; index++) {
      const quad = quads[index]!;
      const mask = quad.mask?.content ?? null, addition = quad.compositingFilter?.parameters.mode === 'addition';
      const opaque = quad.opacity === 1 && !addition;
      const effect = this.#effectTextures.get(quad);
      const texture = effect?.texture ?? null, premultiplied = effect?.premultiplied ?? false;
      const accumulated = effect?.accumulated ?? false;
      while (nextBreak < batches.length && batches[nextBreak]!.beforeQuad < index) nextBreak++;
      const breaks = nextBreak < batches.length && batches[nextBreak]!.beforeQuad === index;
      const group = groupCount ? groups[groupCount - 1]! : null;
      if (!group || breaks || group.content !== quad.content || group.mask !== mask || group.opaque !== opaque ||
        group.addition !== addition || group.texture !== texture || group.premultiplied !== premultiplied || group.accumulated !== accumulated) {
        const next = groups[groupCount] ??= { content: null!, mask, opaque, addition, texture, premultiplied, accumulated, start: index, end: index, first: 0, count: 0 };
        next.content = quad.content as VFXFrame | GFXImage; next.mask = mask; next.opaque = opaque;
        next.addition = addition; next.texture = texture; next.premultiplied = premultiplied;
        next.accumulated = accumulated;
        next.start = index; next.end = index + 1;
        groupCount++;
      } else group.end = index + 1;
    }
    const capacity = quads.length * 9 * pipeline.stride;
    if (this.#geometry.length < capacity) this.#geometry = new Float32Array(capacity);
    let length = 0;
    for (let index = 0; index < groupCount; index++) {
      const group = groups[index]!;
      const storage = this.#geometry.subarray(length);
      const vertices = antialias ? packAntialiasedQuadVertices(quads, scene, ratio, storage, group.start, group.end)
        : packQuadVertices(quads, scene, storage, group.start, group.end);
      group.first = length / pipeline.stride;
      group.count = vertices.length / pipeline.stride;
      length += vertices.length;
    }
    // One contiguous upload per scene; runs preserve exact painter/depth order.
    gl.bufferData(gl.ARRAY_BUFFER, this.#geometry.subarray(0, length), gl.DYNAMIC_DRAW);
    this.#bufferBytes = length * Float32Array.BYTES_PER_ELEMENT;
    let nextBatch = 0;
    const drawParticlesBefore = (index: number) => {
      while (nextBatch < batches.length && batches[nextBatch]!.beforeQuad <= index) {
        this.#particlePipeline ??= new BrowserAFXParticlePipeline(gl);
        this.#particlePipeline.render(batches[nextBatch++]!, scene.width, scene.height, image => this.#textureFor(image));
      }
    };
    for (let index = 0; index < groupCount; index++) {
        const { content, mask, opaque, first, count, start, addition, premultiplied, accumulated, texture: effectTexture } = groups[index]!;
        drawParticlesBefore(start);
        gl.useProgram(pipeline.program);
        const texture = effectTexture ?? this.#textureFor(content);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, mask ? this.#textureFor(mask) : texture);
        gl.uniform1i(pipeline.hasMask, mask ? 1 : 0);
        gl.uniform1i(pipeline.premultiplied, premultiplied ? 1 : 0);
        gl.uniform1i(pipeline.accumulated, accumulated ? 1 : 0);
        // Straight outputs weight RGB by alpha; accumulated images already
        // contain that weight. Keep the same additive alpha contribution.
        if (accumulated) gl.blendFuncSeparate(gl.ONE, addition ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA, addition ? gl.SRC_ALPHA : gl.ONE,
          addition ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
        else if (addition) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(opaque);
        gl.drawArrays(gl.TRIANGLES, first, count);
    }
    drawParticlesBefore(quads.length);
    gl.depthMask(true);
    if (gl.isContextLost()) throw new DOMException("Layer renderer GPU context was lost.", "InvalidStateError");
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.depthMask(true);
    }
  }

  /** Estimated GPU residency: textures sampled by the last scene, the
   * staging target, the canvas drawing buffer and the vertex buffer are
   * active; pooled textures are idle. Empty once lost or disposed. */
  *measureResidency(): Iterable<{ readonly key: unknown; readonly bytes: number; readonly state: "active" | "idle" }> {
    if (!this.#gl || this.#disposed || this.#contextLost) return;
    for (const allocation of this.#textures.values()) yield { key: allocation.texture, bytes: allocation.bytes, state: "active" };
    for (const allocation of this.#texturePool) yield { key: allocation.texture, bytes: allocation.bytes, state: "idle" };
    yield* this.#shaderPipeline?.measureResidency() ?? [];
    const stage = this.#stage;
    if (stage && stage.width) yield { key: stage.framebuffer, bytes: stage.width * stage.height * (4 + 2) * Math.max(1, stage.samples), state: "active" };
    if (this.#canvas.width && this.#canvas.height) yield { key: this.#canvas, bytes: this.#canvas.width * this.#canvas.height * 4, state: "active" };
    if (this.#buffer && this.#bufferBytes) yield { key: this.#buffer, bytes: this.#bufferBytes, state: "active" };
  }

  /** Deletes pooled textures, oldest first, until `targetBytes` are released. */
  releaseIdle(targetBytes: number): number {
    const gl = this.#gl;
    if (!gl || this.#disposed) return 0;
    let released = 0;
    while (released < targetBytes && this.#texturePool.length) {
      const oldest = this.#texturePool.shift()!;
      this.#pooledTextureBytes -= oldest.bytes;
      gl.deleteTexture(oldest.texture);
      released += oldest.bytes;
    }
    return released;
  }

  #pipeline(antialias: boolean): Pipeline {
    const existing = this.#pipelines.get(antialias);
    if (existing) return existing;
    const gl = this.#gl!;
    const value = antialias ? program(gl, antialiasedVertexSource, antialiasedFragmentSource) : program(gl);
    try {
      this.#buffer ??= gl.createBuffer();
      if (!this.#buffer) throw new DOMException('Layer renderer geometry allocation failed.', 'NotSupportedError');
      const attributes = (antialias ? antialiasedAttributes : ordinaryAttributes).map(([name, count, offset]) => {
        const location = gl.getAttribLocation(value, name);
        if (location < 0) throw new Error(`Layer renderer attribute ${name} is unavailable.`);
        return { location, count, offset };
      });
      const pipeline: Pipeline = { program: value, attributes, stride: antialias ? antialiasedVertexStride : vertexStride,
        video: gl.getUniformLocation(value, 'u_video'), mask: gl.getUniformLocation(value, 'u_mask'),
        hasMask: gl.getUniformLocation(value, 'u_has_mask'), premultiplied: gl.getUniformLocation(value, 'u_premultiplied'),
        accumulated: gl.getUniformLocation(value, 'u_accumulated') };
      this.#pipelines.set(antialias, pipeline);
      return pipeline;
    } catch (error) { gl.deleteProgram(value); throw error; }
  }

  #sampleCount(): number {
    if (this.#samples !== null) return this.#samples;
    const gl = this.#gl!;
    const colour = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES) as Int32Array;
    const depth = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, gl.SAMPLES) as Int32Array;
    const supported = Array.from(colour).filter(count => count > 1 && count <= 4 && depth.includes(count));
    if (!supported.length) throw new DOMException('Layer edge antialiasing requires multisampled colour and depth support.', 'NotSupportedError');
    return this.#samples = Math.max(...supported);
  }

  #prepareStage(width: number, height: number, samples: number): void {
    const gl = this.#gl!;
    let stage = this.#stage;
    if (!stage) {
      const framebuffer = gl.createFramebuffer();
      const colour = gl.createRenderbuffer();
      const depth = gl.createRenderbuffer();
      if (!framebuffer || !colour || !depth) {
        if (framebuffer) gl.deleteFramebuffer(framebuffer);
        if (colour) gl.deleteRenderbuffer(colour);
        if (depth) gl.deleteRenderbuffer(depth);
        throw new DOMException("Layer renderer staging allocation failed.", "NotSupportedError");
      }
      stage = { framebuffer, colour, depth, width: 0, height: 0, samples: 0 };
      this.#stage = stage;
    }
    if (stage.width === width && stage.height === height && stage.samples === samples) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, stage.framebuffer);
    try {
      gl.bindRenderbuffer(gl.RENDERBUFFER, stage.colour);
      if (samples) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
      else gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, stage.colour);
      gl.bindRenderbuffer(gl.RENDERBUFFER, stage.depth);
      if (samples) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT16, width, height);
      else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, stage.depth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new DOMException("Layer renderer staging framebuffer is incomplete.", "NotSupportedError");
      stage.width = width;
      stage.height = height;
      stage.samples = samples;
    } finally {
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  #textureFor(content: VFXFrame | GFXImage): WebGLTexture {
    const gl = this.#gl!;
    const existing = this.#textures.get(content);
    if (existing) return existing.texture;
    let allocation: TextureAllocation | undefined;
    const allocate = (width: number, height: number) => {
      allocation = this.#acquireTexture(width, height);
      gl.bindTexture(gl.TEXTURE_2D, allocation.texture);
    };
    try {
      if (content instanceof GFXImage) {
        allocate(content.width, content.height);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, content.width, content.height, gl.RGBA, gl.UNSIGNED_BYTE, afxImageTexturePixels(content));
      } else if (content.storageKind === "video-surface") {
        content.withVideoFrame((surface) => {
          allocate(surface.displayWidth ?? surface.codedWidth, surface.displayHeight ?? surface.codedHeight);
        // CALayer contentsRect and the Canvas2D fallback use a top-left source
        // origin. WebGL uploads TexImageSource rows in the opposite orientation,
        // so normalize the VideoFrame at upload rather than teaching layers a
        // video-only UV convention. Reflections then get exactly one geometric
        // Y inversion from their layer transform.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        try {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, surface as unknown as TexImageSource);
        } finally {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        }
        });
      } else {
        const image = content.toGFXImage();
        allocate(image.width, image.height);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, image.width, image.height, gl.RGBA, gl.UNSIGNED_BYTE, afxImageTexturePixels(image));
      }
      this.#textures.set(content, allocation!);
      this.#uploadedThisRender.push(content);
      return allocation!.texture;
    } catch (error) {
      if (allocation) gl.deleteTexture(allocation.texture);
      throw error;
    }
  }

  #acquireTexture(width: number, height: number): TextureAllocation {
    const gl = this.#gl!;
    const index = this.#texturePool.findIndex(entry => entry.width === width && entry.height === height);
    if (index !== -1) {
      const entry = this.#texturePool.splice(index, 1)[0]!;
      this.#pooledTextureBytes -= entry.bytes;
      return entry;
    }
    const texture = gl.createTexture();
    if (!texture) throw new DOMException('Layer renderer texture allocation failed.', 'NotSupportedError');
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
      return { texture, width, height, bytes: width * height * 4 };
    } catch (error) {
      gl.deleteTexture(texture);
      throw error;
    }
  }

  #recycleTexture(allocation: TextureAllocation): void {
    if (allocation.bytes > maximumPooledTextureBytes) {
      this.#gl!.deleteTexture(allocation.texture);
      return;
    }
    // Recycle after a successful scene submission. No decoded frame is kept
    // alive by the pool, and a failed render retains the preceding scene.
    while (this.#texturePool.length >= maximumPooledTextures ||
      this.#pooledTextureBytes + allocation.bytes > maximumPooledTextureBytes) {
      const oldest = this.#texturePool.shift()!;
      this.#pooledTextureBytes -= oldest.bytes;
      this.#gl!.deleteTexture(oldest.texture);
    }
    this.#texturePool.push(allocation);
    this.#pooledTextureBytes += allocation.bytes;
  }

  #render2D(scene: AFXRendererScene, width: number, height: number, ratio: number): void {
    if (scene.quads.some(quad => quad.group || quad.content instanceof IFXShader || quad.compositingFilter?.parameters.mode === 'addition') ||
      scene.particleBatches?.length)
      throw new DOMException('Layer renderer image shaders, filtered subtrees and additive compositing require WebGL2.', 'NotSupportedError');
    let stage = this.#fallbackStage;
    if (!stage) {
      const canvas = this.#canvas.ownerDocument.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new DOMException("Layer renderer staging canvas is unavailable.", "NotSupportedError");
      stage = { canvas, context };
      this.#fallbackStage = stage;
    }
    if (stage.canvas.width !== width) stage.canvas.width = width;
    if (stage.canvas.height !== height) stage.canvas.height = height;
    const context = stage.context;
    const transforms = scene.quads.map((quad) => quad.transform.toAffine());
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, scene.width, scene.height);
    for (const [index, quad] of scene.quads.entries()) {
      if (quad.mask)
        throw new DOMException("Layer renderer masks require WebGL2.", "NotSupportedError");
      const draw = (source: CanvasImageSource, width: number, height: number) => {
        const transform = transforms[index];
        const uv = quad.uv, bounds = quad.bounds;
        const modulation = quad.colourModulation;
        const scale = modulation?.scale ?? { r: 1, g: 1, b: 1, a: 1 };
        const offset = modulation?.offset ?? { r: 0, g: 0, b: 0, a: 0 };
        const neutralOffset = offset.r === 0 && offset.g === 0 && offset.b === 0 && offset.a === 0;
        const neutralRGB = scale.r === scale.g && scale.g === scale.b;
        if (!neutralOffset || !neutralRGB)
          throw new DOMException("Layer renderer colour modulation requires WebGL2.", "NotSupportedError");
        context.save();
        try {
          context.setTransform(transform.a * ratio, transform.b * ratio,
            transform.c * ratio, transform.d * ratio,
            transform.tx * ratio, transform.ty * ratio);
          context.globalAlpha = quad.opacity * scale.a;
          context.filter = scale.r === 1 ? "none" : `brightness(${scale.r})`;
          context.drawImage(source,
            uv.x * width, uv.y * height, uv.width * width, uv.height * height,
            bounds.x, bounds.y, bounds.width, bounds.height);
        } finally { context.restore(); }
      };
      const content = quad.content;
      if (!content || content instanceof IFXShader)
        throw new DOMException('Layer renderer image shaders require WebGL2.', 'NotSupportedError');
      const drawPixels = (image: GFXImage) => {
        let cached = this.#fallbackImages.get(content);
        if (!cached) {
          const canvas = this.#canvas.ownerDocument.createElement("canvas");
          canvas.width = image.width; canvas.height = image.height;
          const sourceContext = canvas.getContext("2d");
          if (!sourceContext) throw new DOMException("Layer renderer fallback source is unavailable.", "NotSupportedError");
          const data = sourceContext.createImageData(image.width, image.height);
          data.data.set(image.copyData());
          sourceContext.putImageData(data, 0, 0);
          cached = canvas;
          this.#fallbackImages.set(content, canvas);
        }
        draw(cached, cached.width, cached.height);
      };
      if (content instanceof GFXImage) drawPixels(content);
      else if (content.storageKind === "video-surface")
        content.withVideoFrame((surface) => draw(surface as unknown as CanvasImageSource, surface.codedWidth, surface.codedHeight));
      else drawPixels(content.toGFXImage());
    }
    this.#publishViewport(scene, width, height, ratio);
    const visible = this.#fallback!;
    visible.save();
    try {
      visible.setTransform(1, 0, 0, 1, 0, 0);
      visible.globalAlpha = 1;
      visible.globalCompositeOperation = "copy";
      visible.drawImage(stage.canvas, 0, 0);
    } finally { visible.restore(); }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#canvas.removeEventListener('webglcontextlost', this.#onContextLost);
    this.#canvas.removeEventListener('webglcontextrestored', this.#onContextRestored);
    this.#invalidationListeners.clear();
    const gl = this.#gl;
    if (gl) {
      if (this.#stage) {
        gl.deleteFramebuffer(this.#stage.framebuffer);
        gl.deleteRenderbuffer(this.#stage.colour);
        gl.deleteRenderbuffer(this.#stage.depth);
      }
      for (const allocation of this.#textures.values()) gl.deleteTexture(allocation.texture);
      for (const allocation of this.#texturePool) gl.deleteTexture(allocation.texture);
      if (this.#buffer) gl.deleteBuffer(this.#buffer);
      this.#particlePipeline?.dispose();
      this.#shaderPipeline?.dispose();
      for (const pipeline of this.#pipelines.values()) gl.deleteProgram(pipeline.program);
    }
    this.#forgetGPUResources();
    this.#fallbackImages.clear();
    this.#fallbackStage = null;
    this.#geometry = new Float32Array(0);
  }

  #forgetGPUResources(): void {
    this.#textures.clear();
    this.#texturePool.length = 0;
    this.#pooledTextureBytes = 0;
    this.#stage = null;
    this.#buffer = null;
    this.#bufferBytes = 0;
    this.#particlePipeline = null;
    this.#shaderPipeline?.forget();
    this.#shaderPipeline = null;
    this.#effectTextures.clear();
    this.#samples = null;
    this.#pipelines.clear();
    this.#enabledAttributes.clear();
  }
}
