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

import { NSEData } from "../../Foundation/NSEData";
import { CRFXSymmetricKey } from "./CRFXSymmetricKey";
import { CRFXHashedAuthenticationCode } from "./CRFXHashedAuthenticationCode";
import { CRFXHMAC } from "./CRFXHMAC";
import { CRFXError } from "./CRFXError";
import { concat, concatCollection, copy, empty, unsupported, valueBytes } from "./internal/bytes";
import type { HashType } from "./internal/hash";

/** CryptoKit.HKDF<H>. CRFXHKDF(Hash) specialises the hash type, as Swift's HKDF<Hash>. */
export function CRFXHKDF(Hash: HashType) {
  const HMAC = CRFXHMAC(Hash);
  return class HKDF {
    private constructor() {}
    /** Browser-forced asynchronous counterpart of extract(inputKeyMaterial:salt:). */
    static extract(inputKeyMaterial: CRFXSymmetricKey, salt: NSEData | null = null): Promise<CRFXHashedAuthenticationCode> {
      return HMAC.authenticationCode(valueBytes(inputKeyMaterial), new CRFXSymmetricKey(salt ?? NSEData.from(new Uint8Array(Hash.byteCount))));
    }
    /** Browser-forced asynchronous counterpart of expand(pseudoRandomKey:info:outputByteCount:). */
    static expand(pseudoRandomKey: CRFXHashedAuthenticationCode | NSEData, info: NSEData | null, outputByteCount: number): Promise<CRFXSymmetricKey>;
    /** expand(pseudoRandomKey:info:into:). Async backend boundary; immutable output fails with CRFXError.underlyingCoreCryptoError. */
    static expand(pseudoRandomKey: NSEData, info: NSEData | null, into: NSEData): Promise<void>;
    static async expand(pseudoRandomKey: CRFXHashedAuthenticationCode | NSEData, info: NSEData | null, outputByteCount: number | NSEData): Promise<CRFXSymmetricKey | void> {
      if (outputByteCount instanceof NSEData) unsupported("Immutable NSEData cannot receive HKDF output.");
      if (!Number.isSafeInteger(outputByteCount) || outputByteCount < 0 || outputByteCount > 255 * Hash.byteCount) throw new CRFXError("incorrectParameterSize");
      const key = new CRFXSymmetricKey(pseudoRandomKey instanceof NSEData ? pseudoRandomKey : valueBytes(pseudoRandomKey));
      const information = copy(info ?? empty()), blocks: Uint8Array[] = []; let previous = new Uint8Array();
      for (let counter = 1; counter <= Math.ceil(outputByteCount / Hash.byteCount); counter++) {
        previous = copy(valueBytes(await HMAC.authenticationCode(NSEData.from(concat(previous, information, Uint8Array.of(counter))), key)));
        blocks.push(previous);
      }
      return new CRFXSymmetricKey(NSEData.from(concatCollection(blocks).slice(0, outputByteCount)));
    }
    /** Browser-forced asynchronous deriveKey(inputKeyMaterial:outputByteCount:) overload. */
    static deriveKey(inputKeyMaterial: CRFXSymmetricKey, outputByteCount: number): Promise<CRFXSymmetricKey>;
    /** Browser-forced asynchronous deriveKey(inputKeyMaterial:salt:info:outputByteCount:); null omits salt/info. */
    static deriveKey(inputKeyMaterial: CRFXSymmetricKey, salt: NSEData | null, info: NSEData | null, outputByteCount: number): Promise<CRFXSymmetricKey>;
    /** deriveKey(inputKeyMaterial:salt:info:output:). Async backend boundary; immutable output fails with CRFXError.underlyingCoreCryptoError. */
    static deriveKey(inputKeyMaterial: CRFXSymmetricKey, salt: NSEData | null, info: NSEData | null, output: NSEData): Promise<void>;
    static async deriveKey(inputKeyMaterial: CRFXSymmetricKey, saltOrCount: NSEData | number | null, info: NSEData | null = null, outputByteCount?: number | NSEData): Promise<CRFXSymmetricKey | void> {
      if (outputByteCount instanceof NSEData) unsupported("Immutable NSEData cannot receive HKDF output.");
      const count = typeof saltOrCount === "number" ? saltOrCount : outputByteCount!;
      const salt = typeof saltOrCount === "number" ? null : saltOrCount;
      return HKDF.expand(await HKDF.extract(inputKeyMaterial, salt), info, count);
    }
  };
}
