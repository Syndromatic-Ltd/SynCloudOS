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

import type { NSEData } from "../../Foundation/NSEData";
import type { CRFXSymmetricKey } from "./CRFXSymmetricKey";
import { CRFXChaChaPolyNonce } from "./CRFXChaChaPolyNonce";
import { CRFXChaChaPolySealedBox } from "./CRFXChaChaPolySealedBox";
import { empty, unsupported } from "./internal/bytes";
/** CryptoKit.ChaChaPoly. The browser backend cannot perform ChaCha20-Poly1305. */
export class CRFXChaChaPoly {
  private constructor() {}
  static readonly Nonce = CRFXChaChaPolyNonce;
  static readonly SealedBox = CRFXChaChaPolySealedBox;
  /** Async backend boundary; fails with CRFXError.underlyingCoreCryptoError. */
  static async seal(_data: NSEData, _key: CRFXSymmetricKey, _nonce: CRFXChaChaPolyNonce | null = null, _authenticating: NSEData = empty()): Promise<CRFXChaChaPolySealedBox> { return unsupported("ChaChaPoly is unavailable."); }
  /** Async backend boundary; fails with CRFXError.underlyingCoreCryptoError. */
  static async open(_box: CRFXChaChaPolySealedBox, _key: CRFXSymmetricKey, _authenticating: NSEData = empty()): Promise<NSEData> { return unsupported("ChaChaPoly is unavailable."); }
}
