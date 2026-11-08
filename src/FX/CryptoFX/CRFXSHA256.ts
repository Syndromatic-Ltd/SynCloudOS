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
import { CRFXSHA256Digest } from "./CRFXSHA256Digest";
import type { CRFXHashFunction } from "./CRFXHashFunction";
import { concatCollection, copy, makeValue } from "./internal/bytes";
import { digest, registerHash } from "./internal/hash";
/** CryptoKit.SHA256. Updates are buffered because the browser has no streaming hash operation. */
export class CRFXSHA256 implements CRFXHashFunction<CRFXSHA256Digest> {
  static readonly Digest = CRFXSHA256Digest;
  static readonly byteCount = 32;
  static readonly blockByteCount = 64;
  readonly #chunks: Uint8Array[] = [];
  update(data: NSEData): void { this.#chunks.push(copy(data)); }
  /** Browser-forced asynchronous counterpart of finalize(). */
  finalize(): Promise<CRFXSHA256Digest> { return CRFXSHA256.hash(NSEData.from(concatCollection(this.#chunks))); }
  /** Browser-forced asynchronous counterpart of hash(data:). */
  static async hash(data: NSEData): Promise<CRFXSHA256Digest> { return makeValue(CRFXSHA256Digest, await digest(data, "SHA-256")); }
}
registerHash(CRFXSHA256, "SHA-256");
