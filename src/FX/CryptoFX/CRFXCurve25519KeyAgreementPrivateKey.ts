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
import { CRFXCurve25519KeyAgreementPublicKey } from "./CRFXCurve25519KeyAgreementPublicKey";
import { CRFXSharedSecret } from "./CRFXSharedSecret";
import { initPrivate, attachPublic, representation, agree } from "./internal/keys";
/** CryptoKit.Curve25519.KeyAgreement.PrivateKey. Generation/import begins in the constructor; await an operation or representation to observe native failure. */
export class CRFXCurve25519KeyAgreementPrivateKey {
  readonly #brand = undefined;
  readonly publicKey: CRFXCurve25519KeyAgreementPublicKey;
  constructor(input?: { rawRepresentation: NSEData }) {
    initPrivate(this, "Curve25519", "agreement", input); this.publicKey = attachPublic(CRFXCurve25519KeyAgreementPublicKey, this); Object.freeze(this);
  }
  /** Browser-forced asynchronous property: rawRepresentation. */
  get rawRepresentation(): Promise<NSEData> { return representation(this, "rawRepresentation") as Promise<NSEData>; }
  /** Browser-forced asynchronous sharedSecretFromKeyAgreement(with:). */
  sharedSecretFromKeyAgreement(publicKey: CRFXCurve25519KeyAgreementPublicKey): Promise<CRFXSharedSecret> { return agree(this, publicKey); }
}
