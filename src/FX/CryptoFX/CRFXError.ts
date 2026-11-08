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

/** CryptoKitError. Backend failures use Apple's underlyingCoreCryptoError case. */
export class CRFXError extends Error {
  static readonly incorrectKeySize = "incorrectKeySize";
  static readonly invalidParameter = "invalidParameter";
  static readonly incorrectParameterSize = "incorrectParameterSize";
  static readonly underlyingCoreCryptoError = "underlyingCoreCryptoError";
  static readonly authenticationFailure = "authenticationFailure";
  static readonly wrapFailure = "wrapFailure";
  static readonly unwrapFailure = "unwrapFailure";
  constructor(
    readonly code: "incorrectKeySize" | "invalidParameter" | "incorrectParameterSize" | "underlyingCoreCryptoError" | "authenticationFailure" | "wrapFailure" | "unwrapFailure",
    message: string = code,
    readonly error: number = 0,
    options?: ErrorOptions,
  ) { super(message, options); this.name = "CRFXError"; }
}
