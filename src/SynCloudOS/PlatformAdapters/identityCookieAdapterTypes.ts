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

export type IdentityCookieSameSite = "strict" | "lax" | "none";

export interface IdentityCookieScope {
  readonly domain?: string;
  readonly path?: string;
  readonly sameSite?: IdentityCookieSameSite;
  readonly secure?: boolean;
}

export interface IdentityCookieWriteRequest extends IdentityCookieScope {
  readonly name: string;
  readonly value: string;
  readonly maxAge?: number;
  readonly expiresAt?: number;
}

export interface IdentityCookieAdapter {
  read(name: string): Promise<string | null>;
  write(request: IdentityCookieWriteRequest): Promise<void>;
  remove(name: string, options: IdentityCookieScope): Promise<void>;
  dispose(): void | Promise<void>;
}

export interface BrowserCookiePort {
  read(): string;
  write(serialized: string): void;
}

export class IdentityCookieAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IdentityCookieAdapterError";
    this.code = code;
  }
}
