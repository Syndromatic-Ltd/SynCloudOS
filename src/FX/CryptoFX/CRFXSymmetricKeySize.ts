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

import { CRFXError } from "./CRFXError";
/** CryptoKit.SymmetricKeySize. */
export class CRFXSymmetricKeySize {
  static readonly bits128 = new CRFXSymmetricKeySize(128);
  static readonly bits192 = new CRFXSymmetricKeySize(192);
  static readonly bits256 = new CRFXSymmetricKeySize(256);
  constructor(readonly bitCount: number) {
    if (!Number.isSafeInteger(bitCount) || bitCount < 0 || bitCount % 8 !== 0) throw new CRFXError("incorrectKeySize");
    Object.freeze(this);
  }
}
