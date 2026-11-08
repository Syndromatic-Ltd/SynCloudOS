/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NSEData } from "../../Foundation/NSEData";
import { NFXTypeNameFormat } from "./NFXTypeNameFormat";
import { NFXReaderError } from "./NFXReaderError";
import { uriPrefixes, decodeText, utf8, invalidNDEF } from "./internal/ndefEncoding";

/** NFCNDEFPayload. The bytes are NDEF record fields, not browser record descriptors. */
export class NFXNDEFPayload {
  typeNameFormat: NFXTypeNameFormat;
  type: NSEData;
  identifier: NSEData;
  payload: NSEData;
  constructor(format: NFXTypeNameFormat, type: NSEData, identifier: NSEData, payload: NSEData) {
    if (!Object.values(NFXTypeNameFormat).includes(format) || !(type instanceof NSEData) || !(identifier instanceof NSEData) || !(payload instanceof NSEData)) throw invalidNDEF("NDEF requires a type-name format and Foundation data fields.");
    if (type.count > 255 || identifier.count > 255) throw new NFXReaderError("readerErrorInvalidParameterLength", "An NDEF type or identifier exceeds 255 bytes.");
    if ((format === 0 && (type.count || identifier.count || payload.count)) || ((format === 5 || format === 6) && type.count)) throw invalidNDEF("NDEF fields do not match the type-name format.");
    this.typeNameFormat = format; this.type = NSEData.from(type); this.identifier = NSEData.from(identifier); this.payload = NSEData.from(payload);
  }
  static wellKnownTypeURIPayload(url: URL | string): NFXNDEFPayload | null {
    let value: string; try { value = new URL(typeof url === "string" ? url : url.href).href; } catch { return null; }
    let prefix = 0; for (let index = 1; index < uriPrefixes.length; index++) if (value.startsWith(uriPrefixes[index]!) && uriPrefixes[index]!.length > uriPrefixes[prefix]!.length) prefix = index;
    return new NFXNDEFPayload(1, utf8("U"), utf8(""), NSEData.from(new Uint8Array([prefix, ...new TextEncoder().encode(value.slice(uriPrefixes[prefix]!.length))])));
  }
  static wellKnownTypeTextPayload(string: string, locale: Intl.Locale): NFXNDEFPayload | null {
    if (typeof string !== "string") return null;
    if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(string)) !== string) throw invalidNDEF("NDEF text cannot contain unpaired Unicode surrogates.");
    let language: string; try { language = new Intl.Locale(locale.toString()).toString(); } catch { return null; }
    const bytes = new TextEncoder().encode(language); if (bytes.length > 63) return null;
    return new NFXNDEFPayload(1, utf8("T"), utf8(""), NSEData.from(new Uint8Array([bytes.length, ...bytes, ...new TextEncoder().encode(string)])));
  }
  wellKnownTypeURIPayload(): URL | null {
    if (this.typeNameFormat !== 1 || !this.type.isEqual(utf8("U"))) return null;
    const bytes = this.payload.bytes; if (!bytes.length || bytes[0]! >= uriPrefixes.length) throw invalidNDEF("Malformed NDEF URI prefix.");
    try { return new URL(uriPrefixes[bytes[0]!]! + new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(1))); } catch { throw invalidNDEF("Malformed NDEF URI payload."); }
  }
  wellKnownTypeTextPayload(): [string | null, Intl.Locale | null] {
    if (this.typeNameFormat !== 1 || !this.type.isEqual(utf8("T"))) return [null, null];
    return decodeText(this.payload);
  }
}
