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

import type { AFXRendererParticleBatch } from '../../FX/AnimationFX/AFXRenderer';
import type { GFXImage } from '../../FX/GraphicsFX/GFXImage';

const vertex = `#version 300 es
in vec3 a_position;
in vec2 a_shape;
in vec4 a_colour;
uniform mat4 u_world;
uniform vec2 u_viewport;
uniform vec2 u_size;
uniform vec4 u_scale;
uniform vec4 u_offset;
uniform float u_opacity;
uniform vec4 u_mask_rect;
out vec2 v_uv;
out vec2 v_mask_uv;
out vec4 v_scale;
out vec4 v_offset;
out float v_opacity;
void main() {
  vec2 corners[6] = vec2[6](vec2(-1,-1),vec2(1,-1),vec2(1,1),vec2(-1,-1),vec2(1,1),vec2(-1,1));
  vec2 corner = corners[gl_VertexID];
  vec2 local = corner * u_size * .5;
  vec2 rotated = vec2(a_shape.x*local.x-a_shape.y*local.y, a_shape.y*local.x+a_shape.x*local.y);
  vec4 world = u_world * vec4(a_position.xy+rotated,a_position.z,1);
  gl_Position = vec4(2.*world.x/u_viewport.x-world.w,world.w-2.*world.y/u_viewport.y,-world.z/16384.,world.w);
  vec2 uv = corner*.5+.5;
  v_uv = vec2(uv.x,1.-uv.y);
  v_mask_uv = vec2(u_mask_rect.x+uv.x*u_mask_rect.z,1.-u_mask_rect.y-uv.y*u_mask_rect.w);
  v_scale = u_scale * vec4(a_colour.rgb,1.);
  v_offset = u_offset * vec4(a_colour.rgb,1.);
  v_opacity = u_opacity*a_colour.a;
}`;
const fragment = `#version 300 es
precision mediump float;
uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform bool u_has_mask;
in vec2 v_uv;
in vec2 v_mask_uv;
in vec4 v_scale;
in vec4 v_offset;
in float v_opacity;
out vec4 out_colour;
void main() {
  vec4 colour = clamp(texture(u_image,v_uv)*v_scale+v_offset,0.,1.);
  float mask = u_has_mask ? texture(u_mask,v_mask_uv).a : 1.;
  out_colour = vec4(colour.rgb,colour.a*v_opacity*mask);
}`;
const stride = 9;

/** Browser implementation of AFX particle batches. Geometry stays instanced on
 * the GPU; the public layer retains image, colour, mask and transform semantics. */
export class BrowserAFXParticlePipeline {
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #buffer: WebGLBuffer;
  readonly #vao: WebGLVertexArrayObject;
  readonly #uniforms: Record<string, WebGLUniformLocation | null> = {};
  #storage = new Float32Array(0);
  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Particle shader allocation failed.');
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const reason = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`Particle shader: ${reason}`);
      }
      return shader;
    };
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, vao: WebGLVertexArrayObject | null = null;
    try {
      shaders.push(compile(gl.VERTEX_SHADER, vertex));
      shaders.push(compile(gl.FRAGMENT_SHADER, fragment));
      program = gl.createProgram(); buffer = gl.createBuffer(); vao = gl.createVertexArray();
      if (!program || !buffer || !vao) throw new Error('Particle pipeline allocation failed.');
      shaders.forEach(s => gl.attachShader(program!, s)); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Particle program: ${gl.getProgramInfoLog(program)}`);
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const [name, count, offset] of [['a_position',3,0],['a_shape',2,3],['a_colour',4,5]] as const) {
        const location = gl.getAttribLocation(program, name);
        if (location < 0) throw new Error(`Particle attribute ${name} is unavailable.`);
        gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, count, gl.FLOAT, false, stride * 4, offset * 4);
        gl.vertexAttribDivisor(location, 1);
      }
      for (const name of ['world','viewport','size','scale','offset','opacity','mask_rect','image','mask','has_mask'])
        this.#uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
      this.#program = program; this.#buffer = buffer; this.#vao = vao;
    } catch (error) {
      if (program) gl.deleteProgram(program); if (buffer) gl.deleteBuffer(buffer); if (vao) gl.deleteVertexArray(vao);
      throw error;
    } finally { shaders.forEach(s => gl.deleteShader(s)); gl.bindVertexArray(null); }
  }
  render(batch: AFXRendererParticleBatch, width: number, height: number, texture: (image: GFXImage) => WebGLTexture): void {
    const gl = this.#gl, u = this.#uniforms;
    const addition = batch.compositingFilter?.parameters.mode === 'addition';
    if (addition) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.#vao); gl.useProgram(this.#program); gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
    try {
      gl.uniformMatrix4fv(u.world!, false, batch.transform.values);
      gl.uniform2f(u.viewport!, width, height);
      const { scale, offset } = batch.colourModulation;
      gl.uniform4f(u.scale!, scale.r, scale.g, scale.b, scale.a); gl.uniform4f(u.offset!, offset.r, offset.g, offset.b, offset.a);
      gl.uniform1f(u.opacity!, batch.opacity); gl.uniform1i(u.image!, 0); gl.uniform1i(u.mask!, 1);
      gl.uniform1i(u.has_mask!, batch.mask ? 1 : 0);
      const uv = batch.mask?.uv ?? { x: 0, y: 0, width: 1, height: 1 };
      gl.uniform4f(u.mask_rect!, uv.x, uv.y, uv.width, uv.height);
      const particles = batch.particles;
      if (this.#storage.length < particles.length * stride) this.#storage = new Float32Array(particles.length * stride);
      // Only consecutive matching sprites/depth modes combine: no painter-order reordering.
      for (let start = 0; start < particles.length;) {
        const first = particles[start]!, image = first.contents;
        const opaque = !addition && first.colour.components.a * batch.opacity === 1;
        let end = start + 1;
        while (end < particles.length && particles[end]!.contents === image
          && (!addition && particles[end]!.colour.components.a * batch.opacity === 1) === opaque) end++;
        let cursor = 0;
        for (let i = start; i < end; i++) {
          const p = particles[i]!, colour = p.colour.converting('srgb').components;
          this.#storage[cursor++] = p.position.x; this.#storage[cursor++] = p.position.y; this.#storage[cursor++] = p.zPosition;
          this.#storage[cursor++] = Math.cos(p.rotation) * p.scale; this.#storage[cursor++] = Math.sin(p.rotation) * p.scale;
          this.#storage[cursor++] = colour.r; this.#storage[cursor++] = colour.g; this.#storage[cursor++] = colour.b; this.#storage[cursor++] = colour.a;
        }
        gl.bufferData(gl.ARRAY_BUFFER, this.#storage.subarray(0, cursor), gl.DYNAMIC_DRAW);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture(image));
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texture(batch.mask?.content ?? image));
        gl.uniform2f(u.size!, image.width, image.height); gl.depthMask(opaque);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, end - start);
        start = end;
      }
    } finally { gl.bindVertexArray(null); gl.depthMask(true); }
  }
  dispose(): void {
    this.#gl.deleteProgram(this.#program); this.#gl.deleteBuffer(this.#buffer); this.#gl.deleteVertexArray(this.#vao);
  }
}
