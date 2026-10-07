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

export type IFXShaderUniformType = 'float' | 'vec2' | 'vec3' | 'vec4';
export interface IFXShaderUniform {
  readonly type: IFXShaderUniformType;
  readonly value: number | readonly number[];
}

function uniformValue(type: IFXShaderUniformType, value: number | readonly number[]): number | readonly number[] {
  const count = { float: 1, vec2: 2, vec3: 3, vec4: 4 }[type];
  if (!count) throw new TypeError('Unsupported ImageFX shader uniform type.');
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 3.402823466e38;
  if (type === 'float') {
    if (!finite(value)) throw new RangeError('ImageFX shader float uniform must be finite and representable.');
    return value;
  }
  if (!Array.isArray(value) || value.length !== count || !Array.from(value).every(finite))
    throw new RangeError('ImageFX shader vector uniform requires finite components of its declared size.');
  return Object.freeze([...value]);
}

/** Immutable GLSL ES 3 image recipe. Execution and GPU residency belong to the host adapter. */
export class IFXShader {
  readonly source: string;
  readonly uniforms: Readonly<Record<string, IFXShaderUniform>>;

  constructor(source: string, uniforms: Record<string, IFXShaderUniform> = {}) {
    if (typeof source !== 'string' || !source.trim() || source.length > 65536)
      throw new RangeError('ImageFX shader source must contain at most 65536 characters.');
    if (!uniforms || (Object.getPrototypeOf(uniforms) !== Object.prototype && Object.getPrototypeOf(uniforms) !== null))
      throw new TypeError('ImageFX shader uniforms require a data record.');
    const names = Object.keys(uniforms);
    if (names.length > 64) throw new RangeError('ImageFX shader exceeds the 64 uniform limit.');
    const owned: Record<string, IFXShaderUniform> = Object.create(null);
    for (const name of names.sort()) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || /^(ifx|gl_)/.test(name) ||
        /^(main|uniform|float|vec[234]|int|bool|in|out|precision|sampler2D)$/.test(name))
        throw new TypeError('ImageFX shader uniform name is invalid or reserved.');
      const declaration = Object.getOwnPropertyDescriptor(uniforms, name);
      if (!declaration || !('value' in declaration)) throw new TypeError('ImageFX shader uniforms must be data.');
      const uniform = declaration.value as IFXShaderUniform;
      if (!uniform || !Object.hasOwn(uniform, 'type') || !Object.hasOwn(uniform, 'value') ||
        !('value' in Object.getOwnPropertyDescriptor(uniform, 'type')!) ||
        !('value' in Object.getOwnPropertyDescriptor(uniform, 'value')!))
        throw new TypeError('ImageFX shader uniform requires a type and value.');
      owned[name] = Object.freeze({ type: uniform.type, value: uniformValue(uniform.type, uniform.value) });
    }
    this.source = source;
    this.uniforms = Object.freeze(owned);
    Object.freeze(this);
  }

  withUniforms(values: Record<string, number | readonly number[]>): IFXShader {
    if (!values || (Object.getPrototypeOf(values) !== Object.prototype && Object.getPrototypeOf(values) !== null))
      throw new TypeError('ImageFX shader uniform values require a data record.');
    const uniforms = { ...this.uniforms };
    for (const name of Object.keys(values)) {
      if (!Object.hasOwn(uniforms, name)) throw new TypeError('Unknown ImageFX shader uniform.');
      const descriptor = Object.getOwnPropertyDescriptor(values, name)!;
      if (!('value' in descriptor)) throw new TypeError('ImageFX shader uniform values must be data.');
      uniforms[name] = { type: uniforms[name]!.type, value: descriptor.value };
    }
    return new IFXShader(this.source, uniforms);
  }
}
