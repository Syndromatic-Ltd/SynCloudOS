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
import type { CRFXDigest } from "./CRFXDigest";
import { initPublic, representation, verify } from "./internal/keys";
/** CryptoKit.Curve25519.Signing.PublicKey. Native import failure is reported by the first awaited member. */
export class CRFXCurve25519SigningPublicKey {
  readonly #brand = undefined;
  constructor(input: { rawRepresentation: NSEData }) { initPublic(this, "Curve25519", "signing", input); Object.freeze(this); }
  /** Browser-forced asynchronous property: rawRepresentation. */
  get rawRepresentation(): Promise<NSEData> { return representation(this, "rawRepresentation") as Promise<NSEData>; }
  /** Browser-forced asynchronous isValidSignature(_:for:); digest input is unsupported. */
  isValidSignature(signature: NSEData, data: NSEData): Promise<boolean> { return verify(this, signature, data); }
}
