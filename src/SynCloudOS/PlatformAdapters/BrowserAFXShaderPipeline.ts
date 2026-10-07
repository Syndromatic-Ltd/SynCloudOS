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

import { IFXShader } from '../../FX/ImageFX/IFXShader';

export function compileAFXProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new DOMException('Layer renderer shader allocation failed.', 'NotSupportedError');
      shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(`Layer renderer shader compile failed: ${gl.getShaderInfoLog(shader) ?? 'unknown shader error'}`);
    }
    program = gl.createProgram();
    if (!program) throw new DOMException('Layer renderer program allocation failed.', 'NotSupportedError');
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`Layer renderer program link failed: ${gl.getProgramInfoLog(program) ?? 'unknown link error'}`);
    return program;
  } catch (error) { if (program) gl.deleteProgram(program); throw error; }
  finally { for (const shader of shaders) gl.deleteShader(shader); }
}

const vertex = `#version 300 es
out vec2 ifxUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  ifxUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

interface ShaderProgram {
  readonly program: WebGLProgram;
  readonly input: WebGLUniformLocation | null;
  readonly size: WebGLUniformLocation | null;
  readonly uniforms: ReadonlyMap<string, WebGLUniformLocation | null>;
  readonly bytes: number;
}
export interface AFXShaderTarget {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly depth: WebGLRenderbuffer;
  readonly resolveFramebuffer: WebGLFramebuffer | null;
  readonly colour: WebGLRenderbuffer | null;
  readonly samples: number;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}
const maximumTargets = 128;
// Sized for 6K canvases: a full 6144 × 3456 subtree isolated with 4× multisampling
// (28 bytes per pixel) plus one filter pass (6 bytes per pixel) needs about 690 MiB.
const maximumBytes = 1024 * 1024 * 1024;
const maximumDimension = 16384;

function key(shader: IFXShader): string {
  return JSON.stringify([shader.source, Object.entries(shader.uniforms).map(([name, uniform]) => [name, uniform.type])]);
}

/** Private pass machinery of BrowserAFXCanvasRenderer; no scheduling or scene ownership. */
export class BrowserAFXShaderPipeline {
  readonly #gl: WebGL2RenderingContext;
  readonly #programs = new Map<string, ShaderProgram>();
  readonly #targets: AFXShaderTarget[] = [];
  #nextTarget = 0;
  #frameBytes = 0;
  #vao: WebGLVertexArrayObject | null = null;

  constructor(gl: WebGL2RenderingContext) { this.#gl = gl; }

  begin(shaders: readonly IFXShader[]): void {
    const recipes = new Map(shaders.map(shader => [key(shader), shader]));
    if (recipes.size > 64) throw new RangeError('Layer renderer shader program budget exceeded (64).');
    const gl = this.#gl;
    for (const [key, value] of this.#programs) {
      if (recipes.has(key)) continue;
      gl.deleteProgram(value.program); this.#programs.delete(key);
    }
    const created: string[] = [];
    try {
      for (const [cacheKey, shader] of recipes) {
        if (this.#programs.has(cacheKey)) continue;
        const declarations = Object.entries(shader.uniforms).map(([name, uniform]) => `uniform ${uniform.type} ${name};`).join('\n');
        const fragment = `#version 300 es
precision highp float;
uniform sampler2D ifxInput;
uniform vec2 ifxSize;
in vec2 ifxUV;
out vec4 ifxOutput;
${declarations}
${shader.source}
void main() { ifxOutput = ifxMain(ifxUV, ifxSize); }`;
        const program = compileAFXProgram(gl, vertex, fragment);
        try {
          this.#programs.set(cacheKey, { program, input: gl.getUniformLocation(program, 'ifxInput'), size: gl.getUniformLocation(program, 'ifxSize'),
            uniforms: new Map(Object.keys(shader.uniforms).map(name => [name, gl.getUniformLocation(program, name)])),
            bytes: fragment.length * 2 + vertex.length * 2 });
          created.push(cacheKey);
        } catch (error) { gl.deleteProgram(program); throw error; }
      }
    } catch (error) {
      for (const cacheKey of created) { gl.deleteProgram(this.#programs.get(cacheKey)!.program); this.#programs.delete(cacheKey); }
      throw error;
    }
    this.#nextTarget = 0; this.#frameBytes = 0;
  }

  acquire(width: number, height: number, samples = 0): AFXShaderTarget {
    const gl = this.#gl;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      !Number.isSafeInteger(samples) || samples < 0 || samples > 4)
      throw new RangeError('Layer renderer shader surfaces require positive integer dimensions and at most 4 samples.');
    const textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE), renderbufferLimit = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    const dimensionLimit = Math.min(maximumDimension,
      typeof textureLimit === 'number' ? textureLimit : maximumDimension,
      typeof renderbufferLimit === 'number' ? renderbufferLimit : maximumDimension);
    if (width > dimensionLimit || height > dimensionLimit)
      throw new RangeError(`Layer renderer shader surface ${width} × ${height} exceeds ${dimensionLimit} pixels per axis.`);
    if (this.#nextTarget >= maximumTargets)
      throw new RangeError(`Layer renderer shader surface budget exceeded (${maximumTargets} targets per frame).`);
    const bytes = width * height * (samples ? 4 + 6 * samples : 6);
    if (this.#frameBytes + bytes > maximumBytes)
      throw new RangeError(`Layer renderer shader surface budget exceeded (${maximumBytes / 1024 / 1024} MiB per frame).`);
    this.#frameBytes += bytes;
    const index = this.#nextTarget++;
    const existing = this.#targets[index];
    if (existing?.width === width && existing.height === height && existing.samples === samples) return existing;
    if (existing) { this.#deleteTarget(existing); this.#targets.splice(index, 1); }
    // Old targets beyond this frame's cursor are reusable storage, but still
    // count toward the live allocation quota while dimensions change.
    while (this.#targets.reduce((sum, target) => sum + target.bytes, bytes) > maximumBytes && this.#targets.length > index)
      this.#deleteTarget(this.#targets.pop()!);
    const texture = gl.createTexture(), framebuffer = gl.createFramebuffer(), depth = gl.createRenderbuffer();
    const resolveFramebuffer = samples ? gl.createFramebuffer() : null, colour = samples ? gl.createRenderbuffer() : null;
    if (!texture || !framebuffer || !depth || (samples && (!resolveFramebuffer || !colour))) {
      if (texture) gl.deleteTexture(texture); if (framebuffer) gl.deleteFramebuffer(framebuffer); if (depth) gl.deleteRenderbuffer(depth);
      if (resolveFramebuffer) gl.deleteFramebuffer(resolveFramebuffer); if (colour) gl.deleteRenderbuffer(colour);
      throw new DOMException('Layer renderer shader surface allocation failed.', 'NotSupportedError');
    }
    const target = { texture, framebuffer, depth, width, height, bytes, samples, resolveFramebuffer, colour };
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, resolveFramebuffer ?? framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (samples) {
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw new DOMException('Layer renderer shader resolve framebuffer is incomplete.', 'NotSupportedError');
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.bindRenderbuffer(gl.RENDERBUFFER, colour);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colour);
      }
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      if (samples) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT16, width, height);
      else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new DOMException('Layer renderer shader framebuffer is incomplete.', 'NotSupportedError');
      this.#targets.splice(index, 0, target);
      return target;
    } catch (error) { this.#deleteTarget(target); throw error; }
    finally { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindRenderbuffer(gl.RENDERBUFFER, null); }
  }

  resolve(target: AFXShaderTarget): void {
    if (!target.resolveFramebuffer) return;
    const gl = this.#gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.resolveFramebuffer);
    gl.blitFramebuffer(0, 0, target.width, target.height, 0, 0, target.width, target.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(shader: IFXShader, target: AFXShaderTarget, input: WebGLTexture | null): void {
    const gl = this.#gl, pipeline = this.#programs.get(key(shader))!;
    this.#vao ??= gl.createVertexArray();
    if (!this.#vao) throw new DOMException('Layer renderer shader geometry allocation failed.', 'NotSupportedError');
    gl.bindVertexArray(this.#vao);
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.useProgram(pipeline.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, input);
      gl.uniform1i(pipeline.input, 0); gl.uniform2f(pipeline.size, target.width, target.height);
      for (const [name, uniform] of Object.entries(shader.uniforms)) {
        const location = pipeline.uniforms.get(name)!;
        if (uniform.type === 'float') gl.uniform1f(location, uniform.value as number);
        else {
          const value = uniform.value as readonly number[];
          if (uniform.type === 'vec2') gl.uniform2f(location, value[0]!, value[1]!);
          else if (uniform.type === 'vec3') gl.uniform3f(location, value[0]!, value[1]!, value[2]!);
          else gl.uniform4f(location, value[0]!, value[1]!, value[2]!, value[3]!);
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } finally { gl.bindVertexArray(null); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.depthMask(true); }
  }

  finish(success: boolean): void {
    while (this.#targets.length > (success ? this.#nextTarget : 0)) this.#deleteTarget(this.#targets.pop()!);
  }

  *measureResidency(): Iterable<{ key: string; bytes: number; state: 'active' }> {
    for (const [key, program] of this.#programs) yield { key: 'ifx-program:' + key, bytes: program.bytes, state: 'active' };
    for (const [index, target] of this.#targets.entries()) yield { key: 'ifx-surface:' + index, bytes: target.bytes, state: 'active' };
  }

  dispose(): void {
    for (const program of this.#programs.values()) this.#gl.deleteProgram(program.program);
    for (const target of this.#targets) this.#deleteTarget(target);
    if (this.#vao) this.#gl.deleteVertexArray(this.#vao);
    this.forget();
  }
  forget(): void { this.#programs.clear(); this.#targets.length = 0; this.#vao = null; }
  #deleteTarget(target: AFXShaderTarget): void {
    this.#gl.deleteTexture(target.texture); this.#gl.deleteFramebuffer(target.framebuffer); this.#gl.deleteRenderbuffer(target.depth);
    if (target.resolveFramebuffer) this.#gl.deleteFramebuffer(target.resolveFramebuffer);
    if (target.colour) this.#gl.deleteRenderbuffer(target.colour);
  }
}
