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
import { signatureRaw, signatureDer } from "./internal/encoding";
/** CryptoKit.P521.Signing.ECDSASignature. */
export class CRFXP521SigningECDSASignature {
  readonly #brand = undefined;
  readonly rawRepresentation: NSEData;
  constructor(input: { rawRepresentation: NSEData } | { derRepresentation: NSEData }) {
    this.rawRepresentation = signatureRaw(input, 66); Object.freeze(this);
  }
  get derRepresentation(): NSEData { return signatureDer(this.rawRepresentation); }
  withUnsafeBytes<T>(body: (bytes: NSEData) => T): T { return body(NSEData.from(this.rawRepresentation)); }
}
