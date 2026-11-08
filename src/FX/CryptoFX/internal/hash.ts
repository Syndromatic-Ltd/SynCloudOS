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
import type { CRFXDigest } from "../CRFXDigest";
import type { CRFXHashFunction } from "../CRFXHashFunction";
import { copy, operation, provider, unsupported } from "./bytes";

export type HashType<D extends CRFXDigest = CRFXDigest> = {
  new(): CRFXHashFunction<D>;
  readonly byteCount: number;
  readonly blockByteCount: number;
  hash(data: NSEData): Promise<D>;
};
const algorithms = new WeakMap<object, string>();
const authenticationCodeHashes = new WeakMap<object, string>();
export function registerAuthenticationCodeHash(value: object, type: HashType): void { authenticationCodeHashes.set(value, hashAlgorithm(type).replace("-", "")); }
export function authenticationCodeHash(value: object): string {
  const name = authenticationCodeHashes.get(value);
  if (!name) return unsupported("The authentication code has no hash metadata.");
  return name;
}
export function registerHash(type: HashType, algorithm: string): void { algorithms.set(type, algorithm); }
export function hashAlgorithm(type: HashType): string {
  const algorithm = algorithms.get(type);
  if (!algorithm || algorithm === "MD5") unsupported("The requested hash function is unavailable.");
  return algorithm;
}
export function digest(data: NSEData, algorithm: string): Promise<NSEData> {
  const input = copy(data);
  return operation(async () => {
    if (algorithm === "MD5") unsupported("MD5 is unavailable in the cryptographic provider.");
    return NSEData.from(await provider().subtle.digest(algorithm, input));
  });
}
