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

export const SESSION_COOKIE = "__Host-syncloudos_session";
export const TRANSACTION_COOKIE = "__Host-syncloudos_auth";

export function readCookie(request: Request, name: string) {
  for (const entry of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    const value = entry.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]+$/u.test(value) ? value : null;
  }
  return null;
}

export function secureCookie(name: string, value: string, maxAgeSeconds: number) {
  return `${name}=${value}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Secure; HttpOnly; SameSite=Lax`;
}

export function clearCookie(name: string) {
  return secureCookie(name, "", 0);
}
