import { expect, it } from "vitest";
import * as N from "../../../src/FX/NFCFX/public";
import { NSEData } from "../../../src/Foundation/NSEData";

const data = (...bytes: number[]) => NSEData.from(new Uint8Array(bytes));
it("exports CoreNFC classes, status and format constants without the browser client surface", () => {
  expect(Object.keys(N).sort()).toEqual(["NFXReaderSession", "NFXNDEFReaderSession", "NFXNDEFMessage", "NFXNDEFPayload", "NFXNDEFStatus", "NFXTypeNameFormat", "NFXReaderError"].sort());
});
it("encodes actual well-known URI and UTF-8 text payload bytes and decodes locales", () => {
  const uri = N.NFXNDEFPayload.wellKnownTypeURIPayload(new URL("https://www.example.com/path"))!;
  expect(uri.typeNameFormat).toBe(N.NFXTypeNameFormat.nfcWellKnown);
  expect([...uri.type.bytes]).toEqual([0x55]);
  expect([...uri.payload.bytes]).toEqual([2, ...new TextEncoder().encode("example.com/path")]);
  expect(uri.wellKnownTypeURIPayload()?.href).toBe("https://www.example.com/path");
  const text = N.NFXNDEFPayload.wellKnownTypeTextPayload("Café 😀", new Intl.Locale("fr-FR"))!;
  expect([...text.payload.bytes]).toEqual([5, ...new TextEncoder().encode("fr-FRCafé 😀")]);
  const [value, locale] = text.wellKnownTypeTextPayload(); expect(value).toBe("Café 😀"); expect(locale?.toString()).toBe("fr-FR");
  expect(text.wellKnownTypeURIPayload()).toBeNull(); expect(uri.wellKnownTypeTextPayload()).toEqual([null, null]);
});
it("decodes UTF-16 text, rejects malformed payloads and uses Foundation bytes defensively", () => {
  const text = new N.NFXNDEFPayload(N.NFXTypeNameFormat.nfcWellKnown, data(0x54), data(), data(0x82, 101, 110, 0xfe, 0xff, 0, 65));
  expect(text.wellKnownTypeTextPayload()[0]).toBe("A");
  for (const bytes of [[0x40], [10, 101], [1, 0xff], [0x81, 101, 0]]) {
    expect(() => new N.NFXNDEFPayload(N.NFXTypeNameFormat.nfcWellKnown, data(0x54), data(), data(...bytes)).wellKnownTypeTextPayload()).toThrow(N.NFXReaderError);
  }
  expect(() => new N.NFXNDEFPayload(N.NFXTypeNameFormat.nfcWellKnown, data(0x55), data(), data(99)).wellKnownTypeURIPayload()).toThrow(N.NFXReaderError);
  const source = new Uint8Array([1, 2]); const record = new N.NFXNDEFPayload(N.NFXTypeNameFormat.unknown, data(), data(), NSEData.from(source)); source[0] = 99;
  expect([...record.payload.bytes]).toEqual([1, 2]); const message = new N.NFXNDEFMessage([record]); expect(message.length).toBe(5); expect(message.records[0]).toBeInstanceOf(N.NFXNDEFPayload);
});

it("retains text without a language tag and refuses lossy lone-surrogate encoding", () => {
  const record = new N.NFXNDEFPayload(1, data(0x54), data(), data(0, 65)); expect(record.wellKnownTypeTextPayload()).toEqual(["A", null]);
  expect(() => N.NFXNDEFPayload.wellKnownTypeTextPayload("\ud800", new Intl.Locale("en"))).toThrow(N.NFXReaderError);
});
