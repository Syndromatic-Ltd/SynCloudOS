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
import { concatCollection, copy, makeValue, operation, provider, valueBytes } from "./internal/bytes";
import { hashAlgorithm, registerAuthenticationCodeHash, type HashType } from "./internal/hash";

const specialisations = new WeakMap<HashType, ReturnType<typeof CRFXHMAC>>();

/** CryptoKit.HMAC<H>. CRFXHMAC(Hash) is TypeScript's runtime generic specialisation. */
export function CRFXHMAC(Hash: HashType): {
  new(key: CRFXSymmetricKey): {
    update(data: NSEData): void;
    /** Browser-forced asynchronous finalize(). */
    finalize(): Promise<CRFXHashedAuthenticationCode>;
  };
  /** Browser-forced asynchronous authenticationCode(for:using:). */
  authenticationCode(data: NSEData, key: CRFXSymmetricKey): Promise<CRFXHashedAuthenticationCode>;
  /** Browser-forced asynchronous isValidAuthenticationCode(_:authenticating:using:). */
  isValidAuthenticationCode(code: CRFXHashedAuthenticationCode | NSEData, data: NSEData, key: CRFXSymmetricKey): Promise<boolean>;
} {
  const cached = specialisations.get(Hash);
  if (cached) return cached;
  const algorithm = hashAlgorithm(Hash);
  class HMAC {
    readonly #key: CRFXSymmetricKey;
    readonly #chunks: Uint8Array[] = [];
    constructor(key: CRFXSymmetricKey) { this.#key = new CRFXSymmetricKey(valueBytes(key)); }
    update(data: NSEData): void { this.#chunks.push(copy(data)); }
    /** Browser-forced asynchronous counterpart of finalize(). */
    finalize(): Promise<CRFXHashedAuthenticationCode> { return HMAC.authenticationCode(NSEData.from(concatCollection(this.#chunks)), this.#key); }
    /** Browser-forced asynchronous counterpart of authenticationCode(for:using:). */
    static authenticationCode(data: NSEData, key: CRFXSymmetricKey): Promise<CRFXHashedAuthenticationCode> {
      const input = copy(data), keyBytes = copy(valueBytes(key));
      return operation(async () => {
        // WebCrypto rejects an empty HMAC key; one all-zero block is the same HMAC key.
        const imported = await provider().subtle.importKey("raw", keyBytes.length ? keyBytes : new Uint8Array(Hash.blockByteCount), { name: "HMAC", hash: algorithm }, false, ["sign"]);
        const value = makeValue(CRFXHashedAuthenticationCode, NSEData.from(await provider().subtle.sign("HMAC", imported, input)));
        registerAuthenticationCodeHash(value, Hash);
        return value;
      });
    }
    /** Browser-forced asynchronous counterpart of isValidAuthenticationCode(_:authenticating:using:). */
    static async isValidAuthenticationCode(code: CRFXHashedAuthenticationCode | NSEData, data: NSEData, key: CRFXSymmetricKey): Promise<boolean> {
      const expected = await HMAC.authenticationCode(data, key);
      return CRFXHashedAuthenticationCode["=="](expected, code);
    }
  }
  specialisations.set(Hash, HMAC);
  return HMAC;
}
