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

import type { PasteboardRepresentation } from "../../SynCloudOS/SynCloudOS";
import { normalisePasteboardRepresentations } from "../../SynCloudOS/nseRuntimeContracts";

export interface NSEDataTransferReadPort {
  readonly types: readonly string[];
  readonly files: {
    readonly length: number;
    item?(index: number): { readonly name: string; readonly type: string; readonly size: number } | null;
  };
  getData(type: string): string;
}

export interface NSEDataTransferWritePort {
  effectAllowed: DataTransfer["effectAllowed"];
  setData(type: string, value: string): void;
}

export interface NSEClipboardEventPort {
  readonly clipboardData: {
    getData(type: string): string;
    setData(type: string, value: string): void;
  };
}

export class NSEBrowserDragSnapshotError extends TypeError {
  readonly name = "NSEBrowserDragSnapshotError";
}

const textTypes = new Set(["text/plain", "text/html", "text/uri-list", "text/rtf"]);
const MAX_NATIVE_FILE_BYTES = 16 * 1024 * 1024;

function denseTypes(input: readonly string[]): readonly string[] {
  if (!Array.isArray(input)) throw new NSEBrowserDragSnapshotError("The native drag MIME list must be a dense data array.");
  const descriptors = Object.getOwnPropertyDescriptors(input) as unknown as PropertyDescriptorMap;
  const length = descriptors.length;
  if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value > 64) {
    throw new NSEBrowserDragSnapshotError("The native drag MIME list is invalid or exceeds the bounded limit.");
  }
  const allowed = new Set<PropertyKey>(["length", ...Array.from({ length: length.value }, (_, index) => String(index))]);
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) {
    throw new NSEBrowserDragSnapshotError("The native drag MIME list must be a dense data array.");
  }
  const result: string[] = [];
  for (let index = 0; index < length.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable || typeof descriptor.value !== "string") {
      throw new NSEBrowserDragSnapshotError("The native drag MIME list must be a dense data array.");
    }
    result.push(descriptor.value);
  }
  return result;
}

function validateNativeFiles(files: NSEDataTransferReadPort["files"]): void {
  if (!Number.isSafeInteger(files.length) || files.length < 0 || files.length > 64) {
    throw new NSEBrowserDragSnapshotError("The native drag file list exceeds the bounded limit.");
  }
  if (files.length === 0) return;
  if (typeof files.item !== "function") throw new NSEBrowserDragSnapshotError("Native drag files require bounded file metadata.");
  for (let index = 0; index < files.length; index += 1) {
    const file = files.item(index);
    if (!file || typeof file.type !== "string" || file.type.length < 3 || file.type.length > 255 || !file.type.includes("/")) {
      throw new NSEBrowserDragSnapshotError("Native drag file type metadata is invalid.");
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_NATIVE_FILE_BYTES) {
      throw new NSEBrowserDragSnapshotError("Native drag file size metadata is invalid or exceeds the bounded limit.");
    }
  }
  throw new NSEBrowserDragSnapshotError("File drops require a document-resource lease and are not accepted by the string bridge.");
}

export function snapshotNSEDataTransfer(port: NSEDataTransferReadPort): readonly PasteboardRepresentation[] {
  validateNativeFiles(port.files);
  const types = denseTypes(port.types);
  const values: PasteboardRepresentation[] = [];
  for (const type of types) {
    if (textTypes.has(type) || type === "application/x-syncloudos-colour") {
      values.push({ type: type as "text/plain", value: port.getData(type) });
      continue;
    }
    if (!type.startsWith("application/x-syncloudos-")) {
      throw new NSEBrowserDragSnapshotError(`Unsupported native drag MIME type ${type}.`);
    }
    try {
      values.push({ type: type as `application/x-syncloudos-${string}`, value: JSON.parse(port.getData(type)) });
    } catch (cause) {
      const error = new NSEBrowserDragSnapshotError(`Native drag data for ${type} is not valid canonical JSON.`);
      (error as Error & { cause?: unknown }).cause = cause;
      throw error;
    }
  }
  return normalisePasteboardRepresentations(values);
}

export function writeNSEDataTransfer(
  port: NSEDataTransferWritePort,
  input: readonly PasteboardRepresentation[],
  effectAllowed: DataTransfer["effectAllowed"] = "copyMove",
): void {
  const values = normalisePasteboardRepresentations(input);
  let fallback: string | null = null;
  for (const representation of values) {
    if (representation.value instanceof Blob) {
      throw new NSEBrowserDragSnapshotError("Native drag files require a document-resource lease.");
    }
    const encoded = typeof representation.value === "string" ? representation.value : JSON.stringify(representation.value);
    port.setData(representation.type, encoded);
    if (representation.type === "text/plain") fallback = encoded;
    else if (fallback === null && typeof representation.value === "string") fallback = encoded;
  }
  if (!values.some(({ type }) => type === "text/plain") && fallback !== null) port.setData("text/plain", fallback);
  port.effectAllowed = effectAllowed;
}

export function readNSEClipboardText(event: NSEClipboardEventPort): string {
  return event.clipboardData.getData("text/plain");
}

export function writeNSEClipboardText(event: NSEClipboardEventPort, value: string): void {
  event.clipboardData.setData("text/plain", value);
}
