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

import { CRFXInsecureSHA1 } from "./CRFXInsecureSHA1";
import { CRFXInsecureSHA1Digest } from "./CRFXInsecureSHA1Digest";
import { CRFXInsecureMD5 } from "./CRFXInsecureMD5";
import { CRFXInsecureMD5Digest } from "./CRFXInsecureMD5Digest";
/** CryptoKit.Insecure. SHA1 is for compatibility; MD5 operations fail with CRFXError. */
export class CRFXInsecure {
  private constructor() {}
  static readonly SHA1 = CRFXInsecureSHA1;
  static readonly SHA1Digest = CRFXInsecureSHA1Digest;
  static readonly MD5 = CRFXInsecureMD5;
  static readonly MD5Digest = CRFXInsecureMD5Digest;
}
