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

import type { ASAuthorizationBrowserPort } from "../AuthenticationServices";

/** Lazy browser discovery; importing an optional passkey entry never starts a ceremony. */
export const browserPasskeyAuthorization: ASAuthorizationBrowserPort = Object.freeze({
 isSecureContext: () => globalThis.isSecureContext === true,
 create(options: CredentialCreationOptions) {
   if (typeof navigator === "undefined" || !navigator.credentials?.create)
     return Promise.reject(new DOMException("Passkeys are unavailable on this host.", "NotSupportedError"));
   return navigator.credentials.create(options);
 },
 get(options: CredentialRequestOptions) {
   if (typeof navigator === "undefined" || !navigator.credentials?.get)
     return Promise.reject(new DOMException("Passkeys are unavailable on this host.", "NotSupportedError"));
   return navigator.credentials.get(options);
 },
});
export function navigatePasskeyReturnPath(returnPath: string): void {
 if (typeof location !== "undefined") location.assign(returnPath);
}
