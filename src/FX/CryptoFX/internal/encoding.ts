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

import { NSEData } from "../../../Foundation/NSEData";
import { CRFXError } from "../CRFXError";
import { concat, copy } from "./bytes";

export function der(tag: number, bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const length: number[] = []; let n = bytes.length;
  do { length.unshift(n & 255); n >>>= 8; } while (n);
  return concat(Uint8Array.of(tag, ...(bytes.length < 128 ? [bytes.length] : [0x80 | length.length, ...length])), bytes);
}
export const sequence = (...parts: Uint8Array[]) => der(0x30, concat(...parts));
export function parseDer(bytes: Uint8Array, offset = 0): { tag: number; bytes: Uint8Array; end: number } {
  const tag = bytes[offset++]; let length = bytes[offset++];
  if (length === undefined) throw new CRFXError("invalidParameter", "Truncated DER.");
  if (length & 128) {
    const count = length & 127;
    if (count === 0 || count > 4 || offset + count > bytes.length || bytes[offset] === 0) throw new CRFXError("invalidParameter", "Invalid DER length.");
    length = 0; for (let i = 0; i < count; i++) length = length * 256 + bytes[offset++];
    if (length < 128) throw new CRFXError("invalidParameter", "Noncanonical DER length.");
  }
  const end = offset + length;
  if (end > bytes.length) throw new CRFXError("invalidParameter", "Truncated DER value.");
  return { tag, bytes: bytes.slice(offset, end), end };
}
/** Validate the complete DER tree, including canonical primitive values, before native key import. */
export function canonicalDer(bytes: Uint8Array): ReturnType<typeof parseDer> {
  const root = parseDer(bytes);
  if (root.end !== bytes.length) throw new CRFXError("invalidParameter", "Trailing DER data.");
  const pending = [{ node: root, depth: 1 }];
  while (pending.length) {
    const { node, depth } = pending.pop()!, value = node.bytes;
    if (node.tag === 0 || (node.tag & 31) === 31) throw new CRFXError("invalidParameter", "Invalid DER tag.");
    if (node.tag & 32) {
      // Apple counts the root as depth 1. Reject depth 11 before parseDer can copy its subtree.
      if (depth >= 10 && value.length) throw new CRFXError("invalidParameter", "DER nesting exceeds the maximum depth of 10.");
      for (let offset = 0; offset < value.length;) {
        const child = parseDer(value, offset); pending.push({ node: child, depth: depth + 1 }); offset = child.end;
      }
    } else if (node.tag === 2) {
      if (!value.length || (value.length > 1 && ((value[0] === 0 && !(value[1] & 128)) || (value[0] === 255 && (value[1] & 128))))) throw new CRFXError("invalidParameter", "Noncanonical DER integer.");
    } else if (node.tag === 3) {
      if (!value.length || value[0] > 7 || (value.length === 1 && value[0] !== 0) || (value[value.length - 1] & ((1 << value[0]) - 1))) throw new CRFXError("invalidParameter", "Invalid DER bit string.");
    } else if (node.tag === 5 && value.length) throw new CRFXError("invalidParameter", "Invalid DER NULL.");
    else if (node.tag === 6) {
      if (!value.length || (value[value.length - 1] & 128)) throw new CRFXError("invalidParameter", "Invalid DER object identifier.");
      for (let i = 0; i < value.length; i++) if ((i === 0 || !(value[i - 1] & 128)) && value[i] === 128) throw new CRFXError("invalidParameter", "Noncanonical DER object identifier.");
    }
  }
  return root;
}
export function derSequence(bytes: Uint8Array): ReturnType<typeof parseDer>[] {
  const top = canonicalDer(bytes);
  if (top.tag !== 0x30) throw new CRFXError("invalidParameter", "Expected a DER sequence.");
  const children: ReturnType<typeof parseDer>[] = [];
  for (let offset = 0; offset < top.bytes.length;) { const child = parseDer(top.bytes, offset); children.push(child); offset = child.end; }
  return children;
}
export function signatureRaw(input: { rawRepresentation: NSEData } | { derRepresentation: NSEData }, size: number): NSEData {
  if (!input || typeof input !== "object" || Object.keys(input).length !== 1) throw new CRFXError("invalidParameter", "Supply exactly one signature representation.");
  if ("rawRepresentation" in input) {
    const raw = copy(input.rawRepresentation);
    if (raw.length !== 2 * size) throw new CRFXError("incorrectParameterSize");
    return NSEData.from(raw);
  }
  const inputBytes = copy(input.derRepresentation), top = parseDer(inputBytes);
  if (top.tag !== 0x30 || top.end !== inputBytes.length) throw new CRFXError("invalidParameter", "Invalid ECDSA signature sequence.");
  const r = parseDer(top.bytes), s = parseDer(top.bytes, r.end);
  if (s.end !== top.bytes.length) throw new CRFXError("invalidParameter", "Trailing ECDSA signature data.");
  const parts = [r, s].map(part => {
    let bytes = part.bytes;
    if (part.tag !== 2 || bytes.length === 0 || (bytes[0] & 128) || (bytes.length > 1 && bytes[0] === 0 && !(bytes[1] & 128))) throw new CRFXError("invalidParameter", "Invalid DER integer.");
    if (bytes[0] === 0 && bytes.length > 1) bytes = bytes.slice(1);
    if (bytes.length > size) throw new CRFXError("incorrectParameterSize");
    const result = new Uint8Array(size); result.set(bytes, size - bytes.length); return result;
  });
  return NSEData.from(concat(...parts));
}
export function signatureDer(data: NSEData): NSEData {
  const raw = copy(data), size = raw.length / 2;
  const parts = [raw.slice(0, size), raw.slice(size)].map(part => {
    let start = 0; while (start < part.length - 1 && part[start] === 0) start++;
    const bytes = part.slice(start);
    return der(2, bytes[0] & 128 ? concat(Uint8Array.of(0), bytes) : bytes);
  });
  return NSEData.from(sequence(...parts));
}
export function pem(data: NSEData, label: "PRIVATE KEY" | "PUBLIC KEY"): string {
  return `-----BEGIN ${label}-----\n${data.base64EncodedString().match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----`;
}
export function parsePem(text: string, privateKey: boolean): NSEData {
  const match = /^-----BEGIN (PUBLIC KEY|PRIVATE KEY|EC PRIVATE KEY)-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END \1-----\s*$/u.exec(text);
  if (!match || (privateKey ? match[1] === "PUBLIC KEY" : match[1] !== "PUBLIC KEY")) throw new CRFXError("invalidParameter", "Invalid PEM representation.");
  try { return NSEData.fromBase64(match[2].replace(/\s/g, "")); }
  catch (error) { throw new CRFXError("invalidParameter", "Invalid PEM encoding.", 0, { cause: error }); }
}
export function base64url(bytes: Uint8Array): string { return NSEData.from(bytes).base64EncodedString().replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
export function fromBase64url(text: string): Uint8Array<ArrayBuffer> { return copy(NSEData.fromBase64(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4))); }
