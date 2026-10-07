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

import { describe, expect, it, vi } from "vitest";
import {
  AUFXAudioEngine,
  AUFXAudioFormat,
  AUFXAudioMixerNode,
  AUFXAudioPCMBuffer,
  AUFXAudioPlayerNode,
} from "../../../src/FX/AudioFX/public";
import type { AUFXAudioGraphOutput } from "../../../src/FX/AudioFX/AUFXAudioGraphOutput";

function constantBuffer(format: AUFXAudioFormat, frames: number, value: number) {
  const buffer = new AUFXAudioPCMBuffer(format, frames);
  buffer.frameLength = frames;
  for (let channel = 0; channel < format.channelCount; channel++) {
    for (let frame = 0; frame < frames; frame++) buffer.setSample(channel, frame, value);
  }
  return buffer;
}

describe("AudioFX bus connections", () => {
  it("exposes immutable exact edges and disconnects one named destination bus", () => {
    const format = new AUFXAudioFormat(48_000, 2);
    const engine = new AUFXAudioEngine(format);
    const player = new AUFXAudioPlayerNode(format);
    const mixer = new AUFXAudioMixerNode(format);
    engine.attach(player);
    engine.attach(mixer);

    const first = engine.connect(player, mixer, { destinationBus: 0 });
    const second = engine.connect(player, mixer, { destinationBus: 1 });
    engine.connect(mixer, engine.mainMixerNode);

    expect(first).toMatchObject({ source: player, destination: mixer, sourceBus: 0, destinationBus: 0 });
    expect(second).toMatchObject({ source: player, destination: mixer, sourceBus: 0, destinationBus: 1 });
    expect(Object.isFrozen(first)).toBe(true);
    expect(engine.connections).toEqual(expect.arrayContaining([first, second]));
    expect(() => engine.connect(player, mixer, { destinationBus: 1 })).toThrow(/duplicate/i);
    expect(() => engine.connect(player, mixer, { destinationBus: 32 })).toThrow(/bus/i);

    engine.disconnect(first);
    expect(engine.connections).not.toContain(first);
    expect(engine.connections).toContain(second);
    engine.dispose();
  });

  it("converts a 44.1 kHz mono edge to 48 kHz stereo in the canonical renderer", async () => {
    const sourceFormat = new AUFXAudioFormat(44_100, 1);
    const outputFormat = new AUFXAudioFormat(48_000, 2);
    const engine = new AUFXAudioEngine(outputFormat);
    const player = new AUFXAudioPlayerNode(sourceFormat);
    engine.attach(player);
    const connection = engine.connect(player, engine.mainMixerNode, {
      channelMap: [
        [1],
        [1],
      ],
    });

    expect(connection.sourceFormat.isEqual(sourceFormat)).toBe(true);
    expect(connection.destinationFormat.isEqual(outputFormat)).toBe(true);
    player.scheduleBuffer(constantBuffer(sourceFormat, 441, 0.75), 0, true);
    player.play();

    const rendered = await engine.renderOffline(480);
    expect(rendered.frameLength).toBe(480);
    for (const frame of [0, 1, 127, 128, 255, 479]) {
      expect(rendered.getSample(0, frame)).toBeCloseTo(0.75, 5);
      expect(rendered.getSample(1, frame)).toBeCloseTo(0.75, 5);
    }
    engine.dispose();
  });

  it("keeps the running plan intact when a live connection mutation is rejected", async () => {
    const format = new AUFXAudioFormat(48_000, 1);
    let source: any;
    const output: AUFXAudioGraphOutput = {
      start: vi.fn(async (_format, next) => {
        source = next;
        next.snapshot();
      }),
      stop: vi.fn(),
      dispose: vi.fn(),
    };
    const engine = new AUFXAudioEngine(format, output);
    const player = new AUFXAudioPlayerNode(format);
    const mixer = new AUFXAudioMixerNode(format);
    engine.attach(player);
    engine.attach(mixer);
    engine.connect(player, mixer);
    engine.connect(mixer, engine.mainMixerNode);
    await engine.start();

    const before = source.snapshot();
    expect(() => engine.connect(engine.mainMixerNode, mixer)).toThrow(/cycle/i);
    const after = source.snapshot();
    expect(after.nodes.map((node: any) => [node.id, node.kind, node.inputs])).toEqual(
      before.nodes.map((node: any) => [node.id, node.kind, node.inputs]),
    );
    expect(engine.isRunning).toBe(true);
    engine.dispose();
  });
});
