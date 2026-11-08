/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NSEData } from "../../../Foundation/NSEData";
import { NFXReaderError } from "../NFXReaderError";
export const uriPrefixes = ["", "http://www.", "https://www.", "http://", "https://", "tel:", "mailto:", "ftp://anonymous:anonymous@", "ftp://ftp.", "ftps://", "sftp://", "smb://", "nfs://", "ftp://", "dav://", "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:", "sip:", "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://", "tcpobex://", "irdaobex://", "file://", "urn:epc:id:", "urn:epc:tag:", "urn:epc:pat:", "urn:epc:raw:", "urn:epc:", "urn:nfc:"] as const;
export const utf8 = (value: string): NSEData => NSEData.from(new TextEncoder().encode(value));
export const invalidNDEF = (message: string): NFXReaderError => new NFXReaderError("readerErrorInvalidParameter", message);
export function decodeText(payload: NSEData): [string, Intl.Locale | null] {
  const bytes = payload.bytes; const status = bytes[0]; if (status === undefined || (status & 0x40)) throw invalidNDEF("Malformed NDEF text status.");
  const length = status & 63; if (length + 1 > bytes.length) throw invalidNDEF("Malformed NDEF language length.");
  const language = bytes.slice(1, 1 + length); if (language.some(value => value > 127)) throw invalidNDEF("NDEF language must be ASCII.");
  let locale: Intl.Locale | null = null; try { if (length) locale = new Intl.Locale(new TextDecoder().decode(language)); } catch { throw invalidNDEF("Malformed NDEF locale."); }
  const text = bytes.slice(1 + length); let encoding = "utf-8";
  if (status & 128) { if (text.length % 2) throw invalidNDEF("Malformed UTF-16 NDEF text."); encoding = text[0] === 0xff && text[1] === 0xfe ? "utf-16le" : "utf-16be"; }
  try { return [new TextDecoder(encoding, { fatal: true }).decode(text), locale]; } catch { throw invalidNDEF("Malformed NDEF text encoding."); }
}
