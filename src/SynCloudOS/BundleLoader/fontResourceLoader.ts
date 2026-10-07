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
  TFXFontResourceMimeType,
  TFXPackagedFontResource,
  TFXPackagedFontResourceLoader,
} from "../../FX/TextFX/textLayoutTypes";

export const maximumTFXFontResourceBytes = 32 * 1024 * 1024;

export interface RegisteredFontResource {
  readonly url: string;
  readonly mimeType: TFXFontResourceMimeType;
}

const mimeTypeByExtension: Readonly<Record<string, TFXFontResourceMimeType>> = Object.freeze({
  otf: "font/otf",
  ttf: "font/ttf",
  woff: "font/woff",
  woff2: "font/woff2",
});

export function validateTFXFontResourcePath(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new TypeError("A packaged font resource path must be a non-empty string of at most 512 UTF-16 units.");
  }
  if (value.includes("\0") || value.includes("\\") || value.includes("%") || value.includes(":") || value.startsWith("/")) {
    throw new TypeError("A packaged font resource path must not be absolute, remote, encoded, or contain NUL or backslash characters.");
  }
  if (!value.startsWith("Resources/")) {
    throw new TypeError("A packaged font resource path must begin with Resources/.");
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new TypeError("A packaged font resource path cannot contain empty, current-directory, or parent-directory segments.");
  }
  const extension = segments.at(-1)!.split(".").at(-1)!.toLowerCase();
  if (!mimeTypeByExtension[extension]) throw new TypeError("A packaged font resource must use a supported font extension.");
  return value;
}

export function validateTFXFontResource(resource: TFXPackagedFontResource, path: string): TFXPackagedFontResource {
  if (!resource || !(resource.bytes instanceof Uint8Array)) throw new TypeError("A packaged font loader must return Uint8Array bytes.");
  if (resource.bytes.byteLength > maximumTFXFontResourceBytes) throw new RangeError("A packaged font resource exceeds the 32 MiB source limit.");
  const extension = path.split(".").at(-1)!.toLowerCase();
  if (resource.mimeType !== mimeTypeByExtension[extension]) throw new TypeError("A packaged font resource MIME type does not match its registered extension.");
  return Object.freeze({ bytes: resource.bytes.slice(), mimeType: resource.mimeType });
}

async function readBoundedResponse(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.ok) throw new DOMException("The packaged font resource was not found.", "NotFoundError");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumTFXFontResourceBytes) {
    await response.body?.cancel();
    throw new RangeError("A packaged font resource exceeds the 32 MiB source limit.");
  }
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const result = await reader.read();
      signal.throwIfAborted();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maximumTFXFontResourceBytes) throw new RangeError("A packaged font resource exceeds the 32 MiB source limit.");
      chunks.push(result.value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** Host-private factory. Applications receive only a logical resource path. */
export function createRegisteredFontResourceLoader(
  resources: Readonly<Record<string, RegisteredFontResource>>,
): TFXPackagedFontResourceLoader | undefined {
  const entries = new Map(Object.entries(resources));
  if (entries.size === 0) return undefined;
  return async (requestedPath, signal) => {
    const path = validateTFXFontResourcePath(requestedPath);
    signal.throwIfAborted();
    const registered = entries.get(path);
    if (!registered) throw new DOMException("The packaged font resource is not registered in this application bundle.", "NotFoundError");
    const bytes = await readBoundedResponse(await fetch(registered.url, { signal }), signal);
    return validateTFXFontResource({ bytes, mimeType: registered.mimeType }, path);
  };
}

export function fontResourceMimeTypeForPath(path: string): TFXFontResourceMimeType {
  const validated = validateTFXFontResourcePath(path);
  return mimeTypeByExtension[validated.split(".").at(-1)!.toLowerCase()]!;
}
