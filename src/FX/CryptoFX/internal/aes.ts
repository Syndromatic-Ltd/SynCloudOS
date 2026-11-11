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

import { CRFXSymmetricKey } from "../CRFXSymmetricKey";
import { CRFXError } from "../CRFXError";
import { copy, operation, provider, valueBytes } from "./bytes";
export async function aesKey(key: CRFXSymmetricKey): Promise<CryptoKey> {
  if (!(key instanceof CRFXSymmetricKey)) throw new CRFXError("invalidParameter", "Expected a symmetric key.");
  if (![128, 192, 256].includes(key.bitCount)) throw new CRFXError("incorrectKeySize");
  const bytes = copy(valueBytes(key));
  return operation(() => provider().subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]));
}
