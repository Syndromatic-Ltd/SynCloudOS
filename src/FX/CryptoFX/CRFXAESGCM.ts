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
import { CRFXAESGCMNonce } from "./CRFXAESGCMNonce";
import { CRFXAESGCMSealedBox } from "./CRFXAESGCMSealedBox";
import { CRFXError } from "./CRFXError";
import { concat, copy, empty, operation, provider, unsupported, valueBytes } from "./internal/bytes";
import { aesKey } from "./internal/aes";
/** CryptoKit.AES.GCM. */
export class CRFXAESGCM {
  private constructor() {}
  static readonly Nonce = CRFXAESGCMNonce;
  static readonly SealedBox = CRFXAESGCMSealedBox;
  /** seal(inPlace:using:nonce:authenticating:tag:). Async backend boundary; immutable NSEData mutation fails with CRFXError.underlyingCoreCryptoError. */
  static async sealInPlace(_message: NSEData, _key: CRFXSymmetricKey, _nonce: CRFXAESGCMNonce, _authenticating: NSEData | null, _tag: NSEData): Promise<void> { unsupported("Immutable NSEData cannot be sealed in place or receive an output tag."); }
  /** open(inPlace:using:nonce:authenticating:tag:). Async backend boundary; immutable NSEData mutation fails with CRFXError.underlyingCoreCryptoError. */
  static async openInPlace(_message: NSEData, _key: CRFXSymmetricKey, _nonce: CRFXAESGCMNonce, _authenticating: NSEData | null, _tag: NSEData): Promise<void> { unsupported("Immutable NSEData cannot be opened in place."); }
  /** Browser-forced asynchronous seal(_:using:nonce:authenticating:). */
  static async seal(data: NSEData, key: CRFXSymmetricKey, nonce: CRFXAESGCMNonce | null = null, authenticating: NSEData = empty()): Promise<CRFXAESGCMSealedBox> {
    const input = copy(data), selectedNonce = nonce ?? new CRFXAESGCMNonce();
    if (!(selectedNonce instanceof CRFXAESGCMNonce)) throw new CRFXError("invalidParameter");
    const parameters = { name: "AES-GCM", iv: copy(valueBytes(selectedNonce)), additionalData: copy(authenticating), tagLength: 128 };
    const imported = await aesKey(key);
    return operation(async () => {
      const sealed = new Uint8Array(await provider().subtle.encrypt(parameters, imported, input));
      return new CRFXAESGCMSealedBox(selectedNonce, NSEData.from(sealed.slice(0, -16)), NSEData.from(sealed.slice(-16)));
    });
  }
  /** Browser-forced asynchronous open(_:using:authenticating:). */
  static async open(box: CRFXAESGCMSealedBox, key: CRFXSymmetricKey, authenticating: NSEData = empty()): Promise<NSEData> {
    if (!(box instanceof CRFXAESGCMSealedBox)) throw new CRFXError("invalidParameter");
    const input = concat(copy(box.ciphertext), copy(box.tag));
    const parameters = { name: "AES-GCM", iv: copy(valueBytes(box.nonce)), additionalData: copy(authenticating), tagLength: 128 };
    const imported = await aesKey(key);
    return operation(async () => NSEData.from(await provider().subtle.decrypt(parameters, imported, input)), true);
  }
}
