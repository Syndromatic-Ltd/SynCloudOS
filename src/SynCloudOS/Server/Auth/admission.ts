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

import type { AuthAdmissionPolicy } from "./types";

export function createEmailAllowlistAdmissionPolicy(emails: readonly string[], roles: readonly string[] = ["member"]): AuthAdmissionPolicy {
  const allowed = new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  if (allowed.size === 0) throw new TypeError("Authentication admission allowlist must not be empty.");
  return {
    async admit(identity) {
      const email = identity.email?.trim().toLowerCase();
      return { allowed: identity.emailVerified === true && typeof email === "string" && allowed.has(email), roles: [...roles] };
    },
  };
}
