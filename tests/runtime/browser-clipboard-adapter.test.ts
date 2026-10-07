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

import { describe, expect, it } from "vitest";
import { BrowserClipboardAdapter, type BrowserClipboardPort } from "../../src/SynCloudOS/PlatformAdapters/BrowserClipboardAdapter";

class RecordingClipboardItem implements ClipboardItem {
  readonly presentationStyle: PresentationStyle = "unspecified";
  readonly types: string[];
  constructor(private readonly values: Readonly<Record<string, Blob>>) {
    this.types = Object.keys(values);
  }
  async getType(type: string): Promise<Blob> {
    const value = this.values[type];
    if (!value) throw new DOMException("Missing representation", "NotFoundError");
    return value;
  }
}

describe("browser clipboard adapter", () => {
  it("round-trips typed colour, document and canonical custom MIME values when ClipboardItem is available", async () => {
    let item: ClipboardItem | null = null;
    const clipboard: BrowserClipboardPort = {
      write: async (items) => { item = items[0] ?? null; },
      read: async () => item ? [item] : [],
    };
    const adapter = new BrowserClipboardAdapter({
      clipboard,
      isSecureContext: () => true,
      isUserActive: () => true,
      createItem: (values) => new RecordingClipboardItem(values),
    });
    const signal = new AbortController().signal;
    const values = [
      { type: "application/x-syncloudos-colour" as const, value: "rgb(51 102 153)" },
      { type: "application/x-syncloudos-document" as const, value: { documentId: "one", typeId: "note" } },
      { type: "application/x-syncloudos-fixture" as const, value: { order: [1, 2, 3] } },
    ];
    await adapter.write(values, signal);
    await expect(adapter.read(values.map(({ type }) => type), signal)).resolves.toEqual(values);
  });

  it("reports secure-context, activation and browser permission denials", async () => {
    const signal = new AbortController().signal;
    const insecure = new BrowserClipboardAdapter({ clipboard: {}, isSecureContext: () => false, isUserActive: () => true, createItem: null });
    await expect(insecure.read(["text/plain"], signal)).rejects.toMatchObject({ name: "PasteboardUnavailableError" });
    const inactive = new BrowserClipboardAdapter({ clipboard: {}, isSecureContext: () => true, isUserActive: () => false, createItem: null });
    await expect(inactive.write([{ type: "text/plain", value: "value" }], signal)).rejects.toMatchObject({ name: "PasteboardUnavailableError" });
    const denied = new BrowserClipboardAdapter({
      clipboard: { readText: async () => { throw new DOMException("denied", "NotAllowedError"); } },
      isSecureContext: () => true,
      isUserActive: () => true,
      createItem: null,
    });
    await expect(denied.read(["text/plain"], signal)).rejects.toMatchObject({
      name: "PasteboardUnavailableError",
      message: expect.stringMatching(/denied/i),
    });
  });

  it("rejects writes when no browser write authority can represent the request", async () => {
    const adapter = new BrowserClipboardAdapter({
      clipboard: { writeText: async () => undefined },
      isSecureContext: () => true,
      isUserActive: () => true,
      createItem: null,
    });
    const signal = new AbortController().signal;

    await expect(adapter.write([
      { type: "application/x-syncloudos-fixture", value: { id: "custom-only" } },
    ], signal)).rejects.toMatchObject({ name: "PasteboardUnavailableError" });
    await expect(adapter.write([
      { type: "text/html", value: "<strong>rich</strong>" },
    ], signal)).rejects.toMatchObject({ name: "PasteboardUnavailableError" });
  });

  it("reports an explicit partial result for a host-safe fallback", async () => {
    const written: string[] = [];
    const adapter = new BrowserClipboardAdapter({
      clipboard: { writeText: async (value) => { written.push(value); } },
      isSecureContext: () => true,
      isUserActive: () => true,
      createItem: null,
    });

    await expect(adapter.write([
      { type: "application/x-syncloudos-fixture", value: { id: "local" } },
      { type: "text/plain", value: "plain" },
    ], new AbortController().signal)).resolves.toEqual({
      writtenTypes: ["text/plain"],
      omittedTypes: ["application/x-syncloudos-fixture"],
      partial: true,
    });
    expect(written).toEqual(["plain"]);
  });

  it("falls back from a rejected typed item to the exact browser-supported subset", async () => {
    const written: string[][] = [];
    const adapter = new BrowserClipboardAdapter({
      clipboard: {
        write: async (items) => {
          const types = [...(items[0]?.types ?? [])];
          written.push(types);
          if (types.includes("application/x-syncloudos-fixture")) {
            throw new DOMException("unsupported custom clipboard type", "NotSupportedError");
          }
        },
      },
      isSecureContext: () => true,
      isUserActive: () => true,
      createItem: (values) => new RecordingClipboardItem(values),
    });

    await expect(adapter.write([
      { type: "application/x-syncloudos-fixture", value: { id: "local" } },
      { type: "text/html", value: "<strong>rich</strong>" },
      { type: "text/plain", value: "plain" },
    ], new AbortController().signal)).resolves.toEqual({
      writtenTypes: ["text/html", "text/plain"],
      omittedTypes: ["application/x-syncloudos-fixture"],
      partial: true,
    });
    expect(written).toEqual([
      ["application/x-syncloudos-fixture", "text/html", "text/plain"],
      ["text/html", "text/plain"],
    ]);
  });
});
