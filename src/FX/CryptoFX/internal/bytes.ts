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

import { NSEData } from "../../../Foundation/NSEData";
import { CRFXError } from "../CRFXError";

export const empty = () => NSEData.from(new Uint8Array());
export function copy(data: NSEData): Uint8Array<ArrayBuffer> {
  if (!(data instanceof NSEData)) throw new CRFXError("invalidParameter", "Expected NSEData.");
  return new Uint8Array(data.bytes);
}
export function concat(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  return concatCollection(parts);
}
export function concatCollection(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
export const hex = (data: Uint8Array) => Array.from(data, b => b.toString(16).padStart(2, "0")).join("");
export const unhex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], x => parseInt(x, 16));
export function unsupported(message: string): never { throw new CRFXError("underlyingCoreCryptoError", message, -1); }
export function provider(): Crypto {
  if (!globalThis.crypto?.subtle) unsupported("The cryptographic provider is unavailable.");
  return globalThis.crypto;
}
export async function operation<T>(body: () => Promise<T>, authentication = false): Promise<T> {
  try { return await body(); }
  catch (error) {
    if (error instanceof CRFXError) throw error;
    throw new CRFXError(authentication ? "authenticationFailure" : "underlyingCoreCryptoError", "The cryptographic operation failed.", -1, { cause: error });
  }
}
export function random(size: number): NSEData {
  try {
    const result = new Uint8Array(size);
    for (let i = 0; i < size; i += 65536) provider().getRandomValues(result.subarray(i, i + 65536));
    return NSEData.from(result);
  } catch (error) {
    if (error instanceof CRFXError) throw error;
    throw new CRFXError("underlyingCoreCryptoError", "Secure random generation failed.", -1, { cause: error });
  }
}

// The only branch in equal's loop depends on the public byte length. Both load
// addresses depend only on the public index. No JS/JIT byte comparison is used.
// WAT: (func (param i32 i32 i32) (result i32) (local i32 i32)
//   (loop (local.set 4 (i32.or (local.get 4) (i32.xor
//     (i32.load8_u (i32.add (local.get 0) (local.get 3)))
//     (i32.load8_u (i32.add (local.get 1) (local.get 3))))))
//     (br_if 0 (i32.lt_u (local.tee 3 (i32.add (local.get 3) (i32.const 1))) (local.get 2))))
//   (i32.eqz (local.get 4)))
type Comparison = { memory: WebAssembly.Memory; equal: (a: number, b: number, n: number) => number };
let comparison: Comparison | undefined;
export function equal(left: NSEData, right: NSEData): boolean {
  if (left.count !== right.count) return false;
  try {
    if (!comparison) {
      const body = [1, 2, 0x7f, 3, 0x40, 0x20, 4, 0x20, 0, 0x20, 3, 0x6a, 0x2d, 0, 0, 0x20, 1, 0x20, 3, 0x6a, 0x2d, 0, 0, 0x73, 0x72, 0x21, 4, 0x20, 3, 0x41, 1, 0x6a, 0x22, 3, 0x20, 2, 0x49, 0x0d, 0, 0x0b, 0x20, 4, 0x45, 0x0b];
      const module = new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0, 1,8,1,0x60,3,0x7f,0x7f,0x7f,1,0x7f, 3,2,1,0, 5,3,1,0,1, 7,18,2,6,109,101,109,111,114,121,2,0,5,101,113,117,97,108,0,0, 10,body.length+2,1,body.length,...body]));
      comparison = new WebAssembly.Instance(module).exports as Comparison;
    }
    if (left.count === 0) return true;
    const needed = left.count * 2, memory = comparison!.memory;
    if (memory.buffer.byteLength < needed) memory.grow(Math.ceil((needed - memory.buffer.byteLength) / 65536));
    const view = new Uint8Array(memory.buffer, 0, needed);
    view.set(left.bytes); view.set(right.bytes, left.count);
    try { return comparison!.equal(0, left.count, left.count) === 1; }
    finally { view.fill(0); }
  } catch (error) {
    throw new CRFXError("underlyingCoreCryptoError", "Constant-time equality is unavailable.", -1, { cause: error });
  }
}

const storage = new WeakMap<object, NSEData>();
export function storeBytes(value: object, data: NSEData): void { storage.set(value, NSEData.from(data)); }
export function valueBytes(value: object): NSEData {
  const data = storage.get(value); if (!data) throw new CRFXError("invalidParameter", "Invalid cryptographic value.");
  return NSEData.from(data);
}
export function makeValue<T extends object>(type: { prototype: T }, data: NSEData): T {
  const value = Object.create(type.prototype) as T; storeBytes(value, data); return Object.freeze(value);
}
export function compareValues(lhs: object, rhs: object | NSEData): boolean { return equal(valueBytes(lhs), rhs instanceof NSEData ? rhs : valueBytes(rhs)); }
