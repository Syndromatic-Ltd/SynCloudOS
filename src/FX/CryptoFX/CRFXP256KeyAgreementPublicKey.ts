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
import { initPublic, representation, pemRepresentation } from "./internal/keys";
/** CryptoKit.P256.KeyAgreement.PublicKey. Native import failure is reported by the first awaited member. */
export class CRFXP256KeyAgreementPublicKey {
  readonly #brand = undefined;
  constructor(input: { rawRepresentation: NSEData } | { x963Representation: NSEData } | { derRepresentation: NSEData } | { pemRepresentation: string } | { compressedRepresentation: NSEData } | { compactRepresentation: NSEData }) { initPublic(this, "P256", "agreement", input); Object.freeze(this); }
  /** Browser-forced asynchronous property: rawRepresentation. */
  get rawRepresentation(): Promise<NSEData> { return representation(this, "rawRepresentation") as Promise<NSEData>; }
  /** Browser-forced asynchronous property: x963Representation. */
  get x963Representation(): Promise<NSEData> { return representation(this, "x963Representation") as Promise<NSEData>; }
  /** Browser-forced asynchronous property: derRepresentation. */
  get derRepresentation(): Promise<NSEData> { return representation(this, "derRepresentation") as Promise<NSEData>; }
  /** Browser-forced asynchronous property: pemRepresentation. */
  get pemRepresentation(): Promise<string> { return pemRepresentation(this); }
  /** Browser-forced asynchronous property: compressedRepresentation. */
  get compressedRepresentation(): Promise<NSEData> { return representation(this, "compressedRepresentation") as Promise<NSEData>; }
  /** Browser-forced asynchronous property: compactRepresentation. */
  get compactRepresentation(): Promise<NSEData | null> { return representation(this, "compactRepresentation") as Promise<NSEData | null>; }
}
