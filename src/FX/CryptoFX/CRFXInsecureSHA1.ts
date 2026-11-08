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
import { CRFXInsecureSHA1Digest } from "./CRFXInsecureSHA1Digest";
import type { CRFXHashFunction } from "./CRFXHashFunction";
import { concat, copy, makeValue } from "./internal/bytes";
import { digest, registerHash } from "./internal/hash";
/** CryptoKit.Insecure.SHA1. Updates are buffered because the browser has no streaming hash operation. */
export class CRFXInsecureSHA1 implements CRFXHashFunction<CRFXInsecureSHA1Digest> {
  static readonly Digest = CRFXInsecureSHA1Digest;
  static readonly byteCount = 20;
  static readonly blockByteCount = 64;
  readonly #chunks: Uint8Array[] = [];
  update(data: NSEData): void { this.#chunks.push(copy(data)); }
  /** Browser-forced asynchronous counterpart of finalize(). */
  finalize(): Promise<CRFXInsecureSHA1Digest> { return CRFXInsecureSHA1.hash(NSEData.from(concat(...this.#chunks))); }
  /** Browser-forced asynchronous counterpart of hash(data:). */
  static async hash(data: NSEData): Promise<CRFXInsecureSHA1Digest> { return makeValue(CRFXInsecureSHA1Digest, await digest(data, "SHA-1")); }
}
registerHash(CRFXInsecureSHA1, "SHA-1");
