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
import { CRFXP256SigningECDSASignature } from "./CRFXP256SigningECDSASignature";
import { CRFXP256SigningPublicKey } from "./CRFXP256SigningPublicKey";
import { initPrivate, attachPublic, representation, pemRepresentation, sign } from "./internal/keys";
/** CryptoKit.P256.Signing.PrivateKey. Generation/import begins in the constructor; await an operation or representation to observe native failure. */
export class CRFXP256SigningPrivateKey {
  readonly #brand = undefined;
  readonly publicKey: CRFXP256SigningPublicKey;
  constructor(input?: boolean | { rawRepresentation: NSEData } | { x963Representation: NSEData } | { derRepresentation: NSEData } | { pemRepresentation: string }) {
    initPrivate(this, "P256", "signing", input); this.publicKey = attachPublic(CRFXP256SigningPublicKey, this); Object.freeze(this);
  }
  /** Browser-forced asynchronous property: rawRepresentation. */
  get rawRepresentation(): Promise<NSEData> { return representation(this, "rawRepresentation") as Promise<NSEData>; }
  /** Browser-forced asynchronous property: x963Representation. */
  get x963Representation(): Promise<NSEData> { return representation(this, "x963Representation") as Promise<NSEData>; }
  /** Browser-forced asynchronous property: derRepresentation. */
  get derRepresentation(): Promise<NSEData> { return representation(this, "derRepresentation") as Promise<NSEData>; }
  /** Browser-forced asynchronous property: pemRepresentation. */
  get pemRepresentation(): Promise<string> { return pemRepresentation(this); }
  /** Browser-forced asynchronous signature(for:); digest input is unsupported. */
  async signature(data: NSEData | CRFXDigest): Promise<CRFXP256SigningECDSASignature> { return new CRFXP256SigningECDSASignature({ rawRepresentation: await sign(this, data) }); }
}
