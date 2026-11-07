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

import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import { NSEData } from "../../../src/Foundation/NSEData";
import { AUFXAudioFile, AUFXAudioFormat, AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/public";
import { GFXDataConsumer, GFXDataProvider, GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { MEFXBlockBuffer } from "../../../src/FX/MediaFX/MEFXBlockBuffer";
import { IFXDataMatrixCodeDescriptor } from "../../../src/FX/ImageFX/IFXBarcodeDescriptor";
import { VFXContainerReader, type VFXContainerReadableBackend } from "../../../src/FX/VideoFX/VFXContainerReader";
import { VFXPixelBuffer } from "../../../src/FX/VideoFX/VFXPixelBuffer";
import { MIFXEncoder } from "../../../src/FX/MIDIFX/MIFXEncoder";
import { MIFXParser } from "../../../src/FX/MIDIFX/MIFXParser";
import { MIFXUniversalPacket } from "../../../src/FX/MIDIFX/MIFXUniversalPacket";

it("delivers encoded audio and PNG files as immutable Foundation data", () => {
  const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 1); pcm.frameLength = 1;
  const wav = AUFXAudioFile.encodeWAV(pcm);
  expect(wav).toBeInstanceOf(NSEData);
  expect(AUFXAudioFile.decodeWAV(wav).frameLength).toBe(1);
  expect(AUFXAudioFile.encodeWAVHeader(pcm.format, 1)).toBeInstanceOf(NSEData);
  expect(AUFXAudioFile.encodePCM16Chunk(pcm)).toBeInstanceOf(NSEData);
  const image = new GFXImage({ width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]), alpha: "straight", colourSpace: "srgb" });
  expect(image.toPNG()).toBeInstanceOf(NSEData);
});

it("copies byte-provider input and consumer writes while returning NSEData", () => {
  const input = new Uint8Array([1, 2, 3]);
  const provider = new GFXDataProvider(NSEData.from(input));
  input[0] = 99;
  const data = provider.read(0, 3);
  expect(data).toBeInstanceOf(NSEData);
  expect([...data.bytes]).toEqual([1, 2, 3]);
  const consumer = new GFXDataConsumer(); consumer.write(data);
  expect(consumer.finish().isEqual(data)).toBe(true);
});

it("encodes MIDI and UMP into NSEData and parses convertible data", () => {
  const encoded = MIFXEncoder.encode({ kind: "note-on", channel: 0, note: 60, velocity: 100 });
  expect(encoded).toBeInstanceOf(NSEData);
  expect(new MIFXParser().push(encoded)).toEqual([expect.objectContaining({ kind: "message", message: { kind: "note-on", channel: 0, note: 60, velocity: 100 } })]);
  const packet = MIFXUniversalPacket.fromMIDI1Message(0, { kind: "timing-clock" });
  expect(packet.toBytes()).toBeInstanceOf(NSEData);
  expect(MIFXUniversalPacket.fromBytes(packet.toBytes()).words).toEqual(packet.words);
});

it("omits native recorder and PDF worker ports from exported constructor declarations", () => {
  for (const path of ["src/FX/AudioFX/AUFXAudioRecorder.ts", "src/FX/GraphicsFX/pdf/GFXPDFDocument.ts"]) {
    const declaration = ts.transpileDeclaration(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    expect(declaration).toContain("private constructor();");
  }
  expect(readFileSync("src/FX/AudioFX/public.ts", "utf8")).not.toContain("createHostAUFXAudioRecorder");
});

it("keeps pixel backing ownership private while exposing numeric pixel copies", () => {
  expect("fromBacking" in VFXPixelBuffer).toBe(false);
});

const foreignByteSources = [
  "new Uint8Array([1, 2]).buffer",
  "new Uint8Array([9, 1, 2, 9]).subarray(1, 3)",
];

it.each(foreignByteSources)("normalises a genuine foreign byte source before provider dispatch: %s", expression => {
  const input = runInNewContext(expression) as ArrayBuffer | Uint8Array;
  expect([...NSEData.from(input).bytes]).toEqual([1, 2]);
  const provider = new GFXDataProvider(input);
  expect([...provider.read(0, 2).bytes]).toEqual([1, 2]);
  provider.release();
});

it.each(foreignByteSources)("normalises a genuine foreign byte source before media segment dispatch: %s", expression => {
  const input = runInNewContext(expression) as ArrayBuffer | Uint8Array;
  const block = new MEFXBlockBuffer(input);
  const bytes = new Uint8Array(2);
  expect(block.copyTo(bytes)).toBe(2);
  expect([...bytes]).toEqual([1, 2]);
  block.close();
  const segment = new MEFXBlockBuffer({ bytes: input, offset: 1, length: 1 });
  segment.copyTo(bytes, { length: 1 });
  expect(bytes[0]).toBe(2);
  segment.close();
});

it.each(foreignByteSources)("normalises a genuine foreign byte source before container stream dispatch: %s", async expression => {
  const input = runInNewContext(expression) as ArrayBuffer | Uint8Array;
  const fragments: NSEData[] = [];
  const backend: VFXContainerReadableBackend = {
    container: "test", capabilities: [], supports: () => true,
    createWriter: () => ({ start: () => [], write: () => [], close: () => [] }),
    createReader: () => ({
      push: bytes => { fragments.push(NSEData.from(bytes)); },
      finish: () => ({ container: "test", track: { id: 1, kind: "audio", codec: "opus", sampleRate: 48000, channelCount: 1, preSkip: 0, timescale: 1000000 }, chunks: [], seekIndex: [] }),
    }),
  };
  await new VFXContainerReader({ backend }).read(input);
  expect(fragments.map(data => [...data.bytes])).toEqual([[1, 2]]);
  await new VFXContainerReader({ backend }).read((async function* () { yield input; })());
  expect(fragments.map(data => [...data.bytes])).toEqual([[1, 2], [1, 2]]);
});

it.each(foreignByteSources)("normalises a genuine foreign byte source before barcode payload dispatch: %s", expression => {
  const input = runInNewContext(expression) as ArrayBuffer | Uint8Array;
  const descriptor = new IFXDataMatrixCodeDescriptor(input, { rows: 12, columns: 12, quietSpace: 2 });
  expect([...descriptor.message.bytes]).toEqual([1, 2]);
});
