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

import { expect, it, vi } from "vitest";
import { AUFXAudioEngine } from "../../../src/FX/AudioFX/AUFXAudioEngine";
import { AUFXAudioFormat } from "../../../src/FX/AudioFX/AUFXAudioFormat";
import { AUFXAudioMixerNode } from "../../../src/FX/AudioFX/AUFXAudioMixerNode";
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";
import { createAudioGraphHostService } from "../../../src/SynCloudOS/AudioFX/AudioGraphHostService";

const format = new AUFXAudioFormat(48000, 1);

it("revokes every host graph when the first graph has a throwing node disposer", async () => {
  const bus = new AUFXSystemFeedbackBus(() => null);
  const host = createAudioGraphHostService(bus, new AbortController().signal);
  const first = host.createEngine(format), second = host.createEngine(format);
  first.mainMixerNode.dispose = () => { throw new Error("Node cleanup failed."); };
  expect(() => host.dispose()).not.toThrow();
  await expect(second.renderOffline(1)).rejects.toThrow(/disposed/);
  expect(() => host.dispose()).not.toThrow();
  bus.dispose();
});

it("finishes node ownership cleanup and cancels rendering despite output and node failures", async () => {
  const output = { start: vi.fn(), stop: vi.fn(() => { throw Error("Stop failed."); }), dispose: vi.fn(() => { throw Error("Output disposal failed."); }) };
  const engine = new AUFXAudioEngine(format, output);
  const node = new AUFXAudioMixerNode(format);
  const disposeNode = vi.spyOn(node, "dispose");
  engine.attach(node);
  engine.mainMixerNode.dispose = () => { engine.dispose(); throw Error("Mixer disposal failed."); };
  const pending = engine.renderOffline(128);
  expect(() => engine.dispose()).not.toThrow();
  await expect(pending).rejects.toThrow(/disposed/);
  expect(output.stop).toHaveBeenCalledTimes(1);
  expect(output.dispose).toHaveBeenCalledTimes(1);
  expect(disposeNode).toHaveBeenCalledTimes(1);
  expect(engine.lastError).toBeInstanceOf(AggregateError);
  const replacement = new AUFXAudioEngine(format);
  expect(() => replacement.attach(node)).not.toThrow();
  replacement.dispose();
  engine.dispose();
  expect(output.dispose).toHaveBeenCalledTimes(1);
});

it("releases graphs even when a policy unsubscribe throws", async () => {
  const bus = new AUFXSystemFeedbackBus(() => null);
  const unsubscribe = vi.fn(() => { throw Error("Unsubscribe failed."); });
  const host = createAudioGraphHostService(bus, new AbortController().signal, {
    getOwnerPolicy: () => ({ volume: 1, muted: false, paused: false }),
    subscribeMixer: () => unsubscribe,
  });
  const first = host.createEngine(format, undefined, "first"), second = host.createEngine(format, undefined, "second");
  expect(() => host.dispose()).not.toThrow();
  expect(unsubscribe).toHaveBeenCalledTimes(2);
  await expect(first.renderOffline(1)).rejects.toThrow(/disposed/);
  await expect(second.renderOffline(1)).rejects.toThrow(/disposed/);
  bus.dispose();
});
