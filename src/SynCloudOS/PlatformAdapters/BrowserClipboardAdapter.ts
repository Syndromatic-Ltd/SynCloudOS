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

import { canonicalDocumentJson, immutableDocumentValue } from "../Documents/documentTypes";
import { PasteboardUnavailableError } from "../Pasteboard/pasteboardErrors";
import type { PasteboardAdapter, PasteboardCanonicalValue, PasteboardRepresentation, PasteboardWriteResult } from "../Pasteboard/pasteboardTypes";

const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_BINARY_BYTES = 16 * 1024 * 1024;

export interface BrowserClipboardPort {
  read?(): Promise<readonly ClipboardItem[]>;
  readText?(): Promise<string>;
  write?(items: readonly ClipboardItem[]): Promise<void>;
  writeText?(value: string): Promise<void>;
}

export interface BrowserClipboardAdapterOptions {
  readonly clipboard: BrowserClipboardPort | null;
  readonly isSecureContext: () => boolean;
  readonly isUserActive: () => boolean;
  readonly createItem: ((values: Record<string, Blob>) => ClipboardItem) | null;
}

function unavailable(message: string, cause?: unknown) {
  const error = new PasteboardUnavailableError(message);
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

async function decodeBlob(type: string, blob: Blob): Promise<PasteboardRepresentation> {
  if (blob.type && blob.type !== type) throw unavailable(`The browser returned mismatched MIME data for ${type}.`);
  if (type.startsWith("image/") || type === "application/octet-stream") {
    if (blob.size > MAX_BINARY_BYTES) throw unavailable("Browser pasteboard binary data exceeds the byte limit.");
    return { type: type as `image/${string}` | "application/octet-stream", value: blob.slice(0, blob.size, type) };
  }
  if (blob.size > MAX_TEXT_BYTES) throw unavailable("Browser pasteboard text data exceeds the byte limit.");
  const text = await blob.text();
  if (type.startsWith("text/") || type === "application/x-syncloudos-colour") {
    return { type: type as "text/plain", value: text };
  }
  if (type.startsWith("application/x-syncloudos-")) {
    try {
      const value = immutableDocumentValue(JSON.parse(text), `pasteboard.browser.${type}`) as PasteboardCanonicalValue;
      return { type: type as `application/x-syncloudos-${string}`, value };
    } catch (cause) {
      throw unavailable(`Browser pasteboard data for ${type} is not bounded canonical JSON.`, cause);
    }
  }
  throw unavailable(`The browser returned unsupported MIME data ${type}.`);
}

function encodeRepresentation(representation: PasteboardRepresentation): Blob {
  if (typeof representation.value === "string") {
    const blob = new Blob([representation.value], { type: representation.type });
    if (blob.size > MAX_TEXT_BYTES) throw unavailable("Browser pasteboard text data exceeds the byte limit.");
    return blob;
  }
  if (representation.value instanceof Blob) {
    if (representation.value.size > MAX_BINARY_BYTES) throw unavailable("Browser pasteboard binary data exceeds the byte limit.");
    return representation.value.slice(0, representation.value.size, representation.type);
  }
  const json = canonicalDocumentJson(representation.value, `pasteboard.browser.${representation.type}`, {
    maxDepth: 32,
    maxNodes: 4_096,
    maxBytes: MAX_TEXT_BYTES,
  });
  return new Blob([json], { type: representation.type });
}

export class BrowserClipboardAdapter implements PasteboardAdapter {
  constructor(private readonly options: BrowserClipboardAdapterOptions) {}

  private requireClipboard(signal: AbortSignal) {
    signal.throwIfAborted();
    if (!this.options.isSecureContext()) {
      throw unavailable("System pasteboard access requires a secure browser context.");
    }
    if (!this.options.clipboard) {
      throw unavailable("The browser does not expose the Clipboard API.");
    }
    return this.options.clipboard;
  }

  async read(types: readonly string[], signal: AbortSignal = new AbortController().signal): Promise<readonly PasteboardRepresentation[]> {
    const clipboard = this.requireClipboard(signal);
    try {
      if (clipboard.read) {
        const items = await clipboard.read();
        signal.throwIfAborted();
        const values: PasteboardRepresentation[] = [];
        const seen = new Set<string>();
        for (const type of types) {
          for (const item of items) {
            if (seen.has(type) || !item.types.includes(type)) continue;
            const blob = await item.getType(type);
            signal.throwIfAborted();
            values.push(await decodeBlob(type, blob));
            signal.throwIfAborted();
            seen.add(type);
          }
        }
        return values;
      }
      if (types.includes("text/plain") && clipboard.readText) {
        const value = await clipboard.readText();
        signal.throwIfAborted();
        return [{ type: "text/plain", value }];
      }
      throw unavailable("The browser cannot read the requested pasteboard representations.");
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof PasteboardUnavailableError) throw error;
      throw unavailable("The browser denied system pasteboard read access.", error);
    }
  }

  async write(values: readonly PasteboardRepresentation[], signal: AbortSignal = new AbortController().signal): Promise<void | PasteboardWriteResult> {
    const clipboard = this.requireClipboard(signal);
    if (!this.options.isUserActive()) {
      throw unavailable("System pasteboard writes require current user activation.");
    }
    try {
      const hostSafe = values.filter((value) =>
        value.type === "text/plain" ||
        value.type === "text/html" ||
        value.type === "text/uri-list" ||
        value.type.startsWith("image/"));
      const canWriteTypedItem = Boolean(clipboard.write && this.options.createItem);
      const resultFor = (written: readonly PasteboardRepresentation[]): PasteboardWriteResult | undefined => {
        const omittedTypes = values.filter((value) => !written.includes(value)).map(({ type }) => type);
        if (omittedTypes.length === 0) return undefined;
        return Object.freeze({
          writtenTypes: Object.freeze(written.map(({ type }) => type)),
          omittedTypes: Object.freeze(omittedTypes),
          partial: true,
        });
      };
      const writeTyped = async (writable: readonly PasteboardRepresentation[]) => {
        if (!clipboard.write || !this.options.createItem) {
          throw unavailable("The browser cannot write typed pasteboard representations.");
        }
        const blobs: Record<string, Blob> = Object.create(null);
        for (const representation of writable) blobs[representation.type] = encodeRepresentation(representation);
        await clipboard.write([this.options.createItem(blobs)]);
        signal.throwIfAborted();
      };
      const writePlain = async (plain: PasteboardRepresentation | undefined) => {
        if (!plain || plain.type !== "text/plain" || typeof plain.value !== "string" || !clipboard.writeText) {
          throw unavailable("The browser cannot write the requested pasteboard representations.");
        }
        await clipboard.writeText(plain.value);
        signal.throwIfAborted();
      };
      const plain = values.find((value) => value.type === "text/plain");

      if (!canWriteTypedItem) {
        await writePlain(plain);
        return resultFor([plain!]);
      }

      try {
        await writeTyped(values);
        return undefined;
      } catch (initialError) {
        if (signal.aborted) throw signal.reason;
        // ClipboardItem support is not a promise that every MIME is accepted.
        // Retry only subsets whose successful write we can represent exactly.
        let fallbackError = initialError;
        if (hostSafe.length > 0 && hostSafe.length < values.length) {
          try {
            await writeTyped(hostSafe);
            return resultFor(hostSafe);
          } catch (error) {
            if (signal.aborted) throw signal.reason;
            fallbackError = error;
          }
        }
        if (plain && typeof plain.value === "string" && clipboard.writeText) {
          try {
            await writePlain(plain);
            return resultFor([plain]);
          } catch (error) {
            if (signal.aborted) throw signal.reason;
            fallbackError = error;
          }
        }
        throw fallbackError;
      }
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof PasteboardUnavailableError) throw error;
      throw unavailable("The browser denied system pasteboard write access.", error);
    }
  }
}
