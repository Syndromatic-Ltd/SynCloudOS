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
import { CRFXChaChaPolyNonce } from "./CRFXChaChaPolyNonce";
import { CRFXError } from "./CRFXError";
import { concat, copy } from "./internal/bytes";
/** CryptoKit.ChaChaPoly.SealedBox. */
export class CRFXChaChaPolySealedBox {
  readonly nonce: CRFXChaChaPolyNonce;
  readonly ciphertext: NSEData;
  readonly tag: NSEData;
  constructor(combined: NSEData);
  constructor(nonce: CRFXChaChaPolyNonce, ciphertext: NSEData, tag: NSEData);
  constructor(first: NSEData | CRFXChaChaPolyNonce, ciphertext?: NSEData, tag?: NSEData) {
    if (first instanceof NSEData) {
      const bytes = copy(first);
      if (bytes.length < 28) throw new CRFXError("incorrectParameterSize");
      this.nonce = new CRFXChaChaPolyNonce(NSEData.from(bytes.slice(0, 12)));
      this.ciphertext = NSEData.from(bytes.slice(12, -16)); this.tag = NSEData.from(bytes.slice(-16));
    } else {
      if (!(first instanceof CRFXChaChaPolyNonce) || !ciphertext || !tag) throw new CRFXError("invalidParameter");
      this.nonce = first; this.ciphertext = NSEData.from(copy(ciphertext)); this.tag = NSEData.from(copy(tag));
      if (this.tag.count !== 16) throw new CRFXError("incorrectParameterSize");
    }
    Object.freeze(this);
  }
  get combined(): NSEData {
    return NSEData.from(concat(copy(this.nonce.bytes), copy(this.ciphertext), copy(this.tag)));
  }
}
