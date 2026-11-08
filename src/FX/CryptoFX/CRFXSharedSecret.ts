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
import { CRFXHKDF } from "./CRFXHKDF";
import { CRFXError } from "./CRFXError";
import type { HashType } from "./internal/hash";
import { compareValues, concat, copy, hex, valueBytes } from "./internal/bytes";
/** CryptoKit.SharedSecret. Created by key agreement, never a public data initializer. */
export class CRFXSharedSecret {
  private constructor() {}
  get description(): string { return "SharedSecret: " + hex(valueBytes(this).bytes); }
  withUnsafeBytes<T>(body: (bytes: NSEData) => T): T { return body(valueBytes(this)); }
  static ["=="](lhs: CRFXSharedSecret, rhs: CRFXSharedSecret | NSEData): boolean { return compareValues(lhs, rhs); }
  /** Browser-forced asynchronous hkdfDerivedSymmetricKey(using:salt:sharedInfo:outputByteCount:). */
  hkdfDerivedSymmetricKey(Hash: HashType, salt: NSEData, sharedInfo: NSEData, outputByteCount: number): Promise<CRFXSymmetricKey> {
    return CRFXHKDF(Hash).deriveKey(new CRFXSymmetricKey(valueBytes(this)), salt, sharedInfo, outputByteCount);
  }
  /** Browser-forced asynchronous x963DerivedSymmetricKey(using:sharedInfo:outputByteCount:). */
  async x963DerivedSymmetricKey(Hash: HashType, sharedInfo: NSEData, outputByteCount: number): Promise<CRFXSymmetricKey> {
    if (!Number.isSafeInteger(outputByteCount) || outputByteCount < 0 || outputByteCount > 0xffffffff * Hash.byteCount) throw new CRFXError("incorrectParameterSize");
    const secret = copy(valueBytes(this)), information = copy(sharedInfo), blocks: Uint8Array[] = [];
    for (let counter = 1; counter <= Math.ceil(outputByteCount / Hash.byteCount); counter++) {
      const count = new Uint8Array(4); new DataView(count.buffer).setUint32(0, counter, false);
      blocks.push(copy(valueBytes(await Hash.hash(NSEData.from(concat(secret, count, information))))));
    }
    return new CRFXSymmetricKey(NSEData.from(concat(...blocks).slice(0, outputByteCount)));
  }
}
