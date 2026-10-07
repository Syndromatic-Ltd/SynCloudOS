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
import {
  AUFXAudioFile,
  AUFXAudioEngine,
  AUFXAudioFormat,
  AUFXAudioPCMBuffer,
  AUFXAudioPlayerNode,
  AUFXClockObservation,
} from "../../../src/FX/AudioFX/public";

function scheduledEngine(frames = 23) {
  const format = new AUFXAudioFormat(48_000, 1);
  const buffer = new AUFXAudioPCMBuffer(format, frames);
  buffer.frameLength = frames;
  for (let frame = 0; frame < frames; frame++) buffer.setSample(0, frame, frame / Math.max(1, frames - 1));
  const engine = new AUFXAudioEngine(format);
  const player = new AUFXAudioPlayerNode(format);
  engine.attach(player);
  engine.connect(player, engine.mainMixerNode);
  player.scheduleBuffer(buffer);
  player.play();
  return { engine, format };
}

describe("AUFX chunk streams and clock observations", () => {
  it("retains explicit clock-domain provenance without changing AUFXAudioTime", () => {
    const observation = new AUFXClockObservation({
      samplePosition: 96_000,
      sampleRate: 48_000,
      domain: "output",
      hostAnchorSeconds: 12.5,
      uncertaintySeconds: 0.002,
      discontinuityGeneration: 7,
    });

    expect(observation.seconds).toBe(2);
    expect(observation.domain).toBe("output");
    expect(observation.hostAnchorSeconds).toBe(12.5);
    expect(observation.uncertaintySeconds).toBe(0.002);
    expect(observation.discontinuityGeneration).toBe(7);
    expect(() => new AUFXClockObservation({ ...observation, uncertaintySeconds: -1 })).toThrow(RangeError);
  });

  it("renders exact variable-size chunks without allocating the whole duration", async () => {
    const { engine, format } = scheduledEngine();
    const chunks = [];
    for await (const chunk of engine.renderOfflineChunks(23, { chunkFrames: 7 })) chunks.push(chunk);

    expect(chunks.map(chunk => chunk.buffer.frameLength)).toEqual([7, 7, 7, 2]);
    expect(chunks.map(chunk => chunk.observation.samplePosition)).toEqual([0, 7, 14, 21]);
    expect(chunks.every(chunk => chunk.buffer.frameCapacity <= 7)).toBe(true);
    expect(chunks.every(chunk => chunk.observation.sampleRate === format.sampleRate && chunk.observation.domain === "render")).toBe(true);
    expect(chunks[0]!.buffer.getSample(0, 0)).toBeCloseTo(0);
    expect(chunks.at(-1)!.buffer.getSample(0, 1)).toBeCloseTo(1);
    engine.dispose();
  });

  it("observes source-file positions and treats explicit seeks as discontinuities", () => {
    const format = new AUFXAudioFormat(48_000, 1), pcm = new AUFXAudioPCMBuffer(format, 8); pcm.frameLength = 8;
    const file = new AUFXAudioFile(pcm);
    expect(file.observeClock()).toMatchObject({ samplePosition: 0, sampleRate: 48_000, domain: "source", discontinuityGeneration: 0 });
    file.readFrames(2);
    expect(file.observeClock()).toMatchObject({ samplePosition: 2, discontinuityGeneration: 0 });
    file.framePosition = 6;
    expect(file.observeClock()).toMatchObject({ samplePosition: 6, discontinuityGeneration: 1 });
  });

  it("simulates multi-hour output with storage bounded by the selected chunk size", async () => {
    const engine = new AUFXAudioEngine(new AUFXAudioFormat(1, 1));
    const durationFrames = 4 * 60 * 60;
    let frames = 0, chunks = 0, largestCapacity = 0;
    for await (const chunk of engine.renderOfflineChunks(durationFrames, { chunkFrames: 257 })) {
      frames += chunk.buffer.frameLength;
      chunks++;
      largestCapacity = Math.max(largestCapacity, chunk.buffer.frameCapacity);
    }
    expect(frames).toBe(durationFrames);
    expect(chunks).toBe(Math.ceil(durationFrames / 257));
    expect(largestCapacity).toBe(257);
    engine.dispose();
  });

  it("cancels promptly and rejects chunks from a reset generation", async () => {
    const { engine } = scheduledEngine(64);
    const stream = engine.renderOfflineChunks(64, { chunkFrames: 8 });
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value?.observation.discontinuityGeneration).toBe(0);

    engine.reset();
    await expect(iterator.next()).rejects.toMatchObject({ name: "InvalidStateError" });

    const controller = new AbortController();
    const cancelled = engine.renderOfflineChunks(64, { chunkFrames: 8, signal: controller.signal })[Symbol.asyncIterator]();
    controller.abort();
    await expect(cancelled.next()).rejects.toMatchObject({ name: "AbortError" });
    engine.dispose();
  });
});
