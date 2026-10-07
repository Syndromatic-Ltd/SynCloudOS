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

import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeTFXFont, inspectTFXFontInput } from "../../../src/SynCloudOS/TextFX/TFXFontCodec";

function makeWoff(decodedByteLength = 32, originalLength = 2): Uint8Array {
  const bytes = new Uint8Array(65);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x774f4646, false);
  view.setUint32(4, 0x00010000, false);
  view.setUint32(8, bytes.byteLength, false);
  view.setUint16(12, 1, false);
  view.setUint32(16, decodedByteLength, false);
  view.setUint32(44, 0x6e616d65, false);
  view.setUint32(48, 64, false);
  view.setUint32(52, 1, false);
  view.setUint32(56, originalLength, false);
  return bytes;
}

function installInflateReader(reader: {
  read(): Promise<ReadableStreamReadResult<Uint8Array>>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
}) {
  vi.stubGlobal("Blob", class {
    stream() {
      return { pipeThrough: () => ({ getReader: () => reader }) };
    }
  });
  vi.stubGlobal("DecompressionStream", class {});
}

afterEach(() => vi.unstubAllGlobals());

describe("TFX WOFF codec bounds and cancellation", () => {
  it("rejects output smaller than the SFNT directory and oversized table lengths", async () => {
    const signal = new AbortController().signal;
    const short = makeWoff(12);
    await expect(decodeTFXFont(short, inspectTFXFontInput(short), signal)).rejects.toThrow(/table directory/i);

    const oversized = makeWoff(32, 0xffffffff);
    await expect(decodeTFXFont(oversized, inspectTFXFontInput(oversized), signal)).rejects.toThrow(/table bounds/i);
  });

  it("cancels the inflate reader when decoded output exceeds its table allocation", async () => {
    const reader = {
      read: vi.fn(async () => ({ done: false as const, value: new Uint8Array(3) })),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    installInflateReader(reader);
    const bytes = makeWoff();
    await expect(decodeTFXFont(bytes, inspectTFXFontInput(bytes), new AbortController().signal)).rejects.toThrow(/exceeds/i);
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(reader.releaseLock).toHaveBeenCalledTimes(1));
  });

  it("promptly rejects an abort while inflate read remains pending", async () => {
    const reader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
      cancel: vi.fn(() => new Promise<void>(() => undefined)),
      releaseLock: vi.fn(),
    };
    installInflateReader(reader);
    const controller = new AbortController();
    const bytes = makeWoff();
    const pending = decodeTFXFont(bytes, inspectTFXFontInput(bytes), controller.signal);
    await vi.waitFor(() => expect(reader.read).toHaveBeenCalledTimes(1));
    controller.abort(new DOMException("scope retired", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).not.toHaveBeenCalled();
  });
});
