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
import { CRFXSymmetricKeySize } from "./CRFXSymmetricKeySize";
import { compareValues, copy, random, storeBytes, unsupported, valueBytes } from "./internal/bytes";
/** CryptoKit.SymmetricKey. RawSpan/ContiguousBytes use immutable NSEData. */
export class CRFXSymmetricKey {
  constructor(dataOrSize: NSEData | CRFXSymmetricKeySize);
  /** init(copyingWithZeroing:). Immutable NSEData cannot be zeroed; throws CRFXError.underlyingCoreCryptoError. */
  constructor(input: { copyingWithZeroing: NSEData });
  /** init(size:initializingWith:). No mutable output span exists; throws CRFXError.underlyingCoreCryptoError without invoking the callback. */
  constructor(size: CRFXSymmetricKeySize, initializingWith: (output: NSEData) => void);
  constructor(dataOrSize: NSEData | CRFXSymmetricKeySize | { copyingWithZeroing: NSEData }, initializingWith?: (output: NSEData) => void) {
    if (initializingWith !== undefined) unsupported("Immutable NSEData cannot initialise an output span.");
    if (dataOrSize && typeof dataOrSize === "object" && "copyingWithZeroing" in dataOrSize) unsupported("Immutable NSEData cannot promise source-byte zeroing.");
    const data = dataOrSize instanceof CRFXSymmetricKeySize ? random(dataOrSize.bitCount / 8) : NSEData.from(copy(dataOrSize));
    storeBytes(this, data); Object.freeze(this);
  }
  get bitCount(): number { return valueBytes(this).count * 8; }
  get bytes(): NSEData { return valueBytes(this); }
  withUnsafeBytes<T>(body: (bytes: NSEData) => T): T { return body(valueBytes(this)); }
  static ["=="](lhs: CRFXSymmetricKey, rhs: CRFXSymmetricKey): boolean { return compareValues(lhs, rhs); }
}
