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

import type {
  BrowserCookiePort,
  IdentityCookieAdapter,
  IdentityCookieScope,
  IdentityCookieWriteRequest,
} from "./identityCookieAdapterTypes";
import { IdentityCookieAdapterError } from "./identityCookieAdapterTypes";

const cookieNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function validateName(name: string) {
  if (!cookieNamePattern.test(name)) throw new IdentityCookieAdapterError("invalid-cookie-name", "Cookie name contains an invalid character.");
}

function validateValue(value: string) {
  if (/[\u0000-\u001F\u007F;\r\n]/u.test(value)) {
    throw new IdentityCookieAdapterError("invalid-cookie-value", "Cookie value contains a control or delimiter character.");
  }
}

function validateScope(scope: IdentityCookieScope) {
  if (scope.path !== undefined && (!scope.path.startsWith("/") || /[;\r\n]/u.test(scope.path))) {
    throw new IdentityCookieAdapterError("invalid-cookie-path", "Cookie path must be an absolute path without delimiters.");
  }
  if (scope.domain !== undefined && /[;\s\r\n]/u.test(scope.domain)) {
    throw new IdentityCookieAdapterError("invalid-cookie-domain", "Cookie domain contains an invalid character.");
  }
  if (scope.sameSite === "none" && scope.secure !== true) {
    throw new IdentityCookieAdapterError("same-site-none-requires-secure", "SameSite=None cookies must be Secure.");
  }
}

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readCookieString(cookieString: string, name: string) {
  validateName(name);
  for (const segment of cookieString.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const candidateName = decode(segment.slice(0, separator).trim());
    if (candidateName !== name) continue;
    return decode(segment.slice(separator + 1).trim());
  }
  return null;
}

function serialiseWrite(request: IdentityCookieWriteRequest) {
  validateName(request.name);
  validateValue(request.value);
  validateScope(request);
  const parts = [`${encodeURIComponent(request.name)}=${encodeURIComponent(request.value)}`];
  if (request.maxAge !== undefined) parts.push(`Max-Age=${Math.trunc(request.maxAge)}`);
  if (request.expiresAt !== undefined) parts.push(`Expires=${new Date(request.expiresAt).toUTCString()}`);
  if (request.domain) parts.push(`Domain=${request.domain}`);
  if (request.path) parts.push(`Path=${request.path}`);
  if (request.sameSite) parts.push(`SameSite=${request.sameSite[0].toUpperCase()}${request.sameSite.slice(1)}`);
  if (request.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Browser document access is supplied by the caller's runtime environment. */
export function createBrowserDocumentCookiePort(documentPort: Pick<Document, "cookie"> | null): BrowserCookiePort {
  return {
    read: () => documentPort?.cookie ?? "",
    write: (serialized) => {
      if (documentPort) documentPort.cookie = serialized;
    },
  };
}

export function createBrowserIdentityCookieAdapter(port: BrowserCookiePort): IdentityCookieAdapter {
  let disposed = false;
  const ensureActive = () => {
    if (disposed) throw new IdentityCookieAdapterError("adapter-disposed", "Identity cookie adapter is disposed.");
  };
  return {
    async read(name) {
      ensureActive();
      return readCookieString(port.read(), name);
    },
    async write(request) {
      ensureActive();
      port.write(serialiseWrite(request));
    },
    async remove(name, options) {
      ensureActive();
      port.write(serialiseWrite({ ...options, name, value: "", maxAge: 0 }));
    },
    dispose() {
      disposed = true;
    },
  };
}
