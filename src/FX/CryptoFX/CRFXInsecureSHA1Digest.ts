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
import type { CRFXDigest } from "./CRFXDigest";
import { compareValues, hex, valueBytes } from "./internal/bytes";
/** CryptoKit.Insecure.SHA1Digest. Produced only by its hash function. */
export class CRFXInsecureSHA1Digest implements CRFXDigest {
  private constructor() {}
  static readonly byteCount = 20;
  get description(): string { return "InsecureSHA1Digest: " + hex(valueBytes(this).bytes); }
  withUnsafeBytes<T>(body: (bytes: NSEData) => T): T { return body(valueBytes(this)); }
  [Symbol.iterator](): IterableIterator<number> { return valueBytes(this).bytes[Symbol.iterator](); }
  static ["=="](lhs: CRFXInsecureSHA1Digest, rhs: CRFXInsecureSHA1Digest | NSEData): boolean { return compareValues(lhs, rhs); }
}
