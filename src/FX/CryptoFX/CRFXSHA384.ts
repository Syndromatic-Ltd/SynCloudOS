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
import { CRFXSHA384Digest } from "./CRFXSHA384Digest";
import type { CRFXHashFunction } from "./CRFXHashFunction";
import { concat, copy, makeValue } from "./internal/bytes";
import { digest, registerHash } from "./internal/hash";
/** CryptoKit.SHA384. Updates are buffered because the browser has no streaming hash operation. */
export class CRFXSHA384 implements CRFXHashFunction<CRFXSHA384Digest> {
  static readonly Digest = CRFXSHA384Digest;
  static readonly byteCount = 48;
  static readonly blockByteCount = 128;
  readonly #chunks: Uint8Array[] = [];
  update(data: NSEData): void { this.#chunks.push(copy(data)); }
  /** Browser-forced asynchronous counterpart of finalize(). */
  finalize(): Promise<CRFXSHA384Digest> { return CRFXSHA384.hash(NSEData.from(concat(...this.#chunks))); }
  /** Browser-forced asynchronous counterpart of hash(data:). */
  static async hash(data: NSEData): Promise<CRFXSHA384Digest> { return makeValue(CRFXSHA384Digest, await digest(data, "SHA-384")); }
}
registerHash(CRFXSHA384, "SHA-384");
