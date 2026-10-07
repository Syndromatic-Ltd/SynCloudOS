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
import { AUFXAudioFormat } from "../../../src/FX/AudioFX/AUFXAudioFormat";
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";
import { createAudioGraphHostService } from "../../../src/SynCloudOS/AudioFX/AudioGraphHostService";
import { createMountedAudioGraphs } from "../../../src/SynCloudOS/AppSDK/mountedAudioGraphs";

it("rolls back graph acquisition when policy subscription revokes the owner synchronously", () => {
  const owner = new AbortController(), unsubscribe = vi.fn();
  const bus = new AUFXSystemFeedbackBus(() => null);
  const host = createAudioGraphHostService(bus, owner.signal, {
    getOwnerPolicy: () => ({ volume: 1, muted: false, paused: false }),
    subscribeMixer: () => { owner.abort(); return unsubscribe; },
  });
  expect(() => host.createEngine(new AUFXAudioFormat(48000, 1), undefined, "owner")).toThrow();
  expect(unsubscribe).toHaveBeenCalledOnce();
  bus.dispose();
});

it("binds graph output to its canonical owner policy and releases the subscription", () => {
  const owner = new AbortController();
  const bus = new AUFXSystemFeedbackBus(() => null);
  const createOutput = bus.createGraphOutput.bind(bus);
  const updates: ReturnType<typeof vi.fn>[] = [];
  vi.spyOn(bus, "createGraphOutput").mockImplementation(signal => {
    const output = createOutput(signal);
    updates.push(vi.spyOn(output, "setOwnerPolicy"));
    return output;
  });
  const listeners = new Set<() => void>();
  let volume = 0.4, paused = false;
  const policy = {
    getOwnerPolicy: (appId: string) => ({ volume: appId === "owned" ? volume : 1, muted: false, paused: appId === "owned" && paused }),
    subscribeMixer: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  const host = createAudioGraphHostService(bus, owner.signal, policy);
  const client = createMountedAudioGraphs(host, owner.signal, () => ["audio.play"], "owned");
  const engine = client.createEngine(new AUFXAudioFormat(48000, 1));
  expect(updates[0]).toHaveBeenLastCalledWith({ volume: 0.4, muted: false, paused: false });
  volume = 0.2; paused = true;
  for (const listener of listeners) listener();
  expect(updates[0]).toHaveBeenLastCalledWith({ volume: 0.2, muted: false, paused: true });
  engine.dispose();
  expect(listeners.size).toBe(0);
  host.dispose(); bus.dispose();
});

it("does not activate audio during acquisition and returns quota after disposal", () => {
  const activate = vi.fn(() => null);
  const runtime = new AbortController(), mount = new AbortController();
  const bus = new AUFXSystemFeedbackBus(activate);
  const host = createAudioGraphHostService(bus, runtime.signal);
  let permissions: string[] = [];
  const client = createMountedAudioGraphs(host, mount.signal, () => permissions);
  const format = new AUFXAudioFormat(48000, 1);
  expect(() => client.createEngine(format)).toThrow(/audio.play/);
  permissions = ["audio.play"];
  const engines = Array.from({ length: 8 }, () => client.createEngine(format));
  expect(() => client.createEngine(format)).toThrow(/limit/);
  engines[0].dispose(); engines[0].dispose();
  expect(() => client.createEngine(format)).not.toThrow();
  expect(activate).not.toHaveBeenCalled();
  runtime.abort(); bus.dispose();
});

it("revokes graphs at mount and runtime boundaries without revoking another owner", async () => {
  const runtime = new AbortController(), mount = new AbortController();
  const bus = new AUFXSystemFeedbackBus(() => null);
  const host = createAudioGraphHostService(bus, runtime.signal);
  const format = new AUFXAudioFormat(48000, 1);
  const owned = createMountedAudioGraphs(host, mount.signal, () => ["audio.play"]).createEngine(format);
  const other = host.createEngine(format);
  mount.abort();
  await expect(owned.renderOffline(4)).rejects.toThrow(/disposed/);
  await expect(other.renderOffline(4)).resolves.toHaveProperty("frameLength", 4);
  runtime.abort();
  await expect(other.renderOffline(4)).rejects.toThrow(/disposed/);
  expect(() => host.createEngine(format)).toThrow(/disposed/);
  bus.dispose();
});

it("passes the mount-issued opaque input capability to the graph host", () => {
  const capability = Object.freeze({}), engine = { dispose: vi.fn() }, createEngine = vi.fn(() => engine);
  const mounted = createMountedAudioGraphs({ createEngine } as any, new AbortController().signal, () => ["audio.play"], "owner", capability);
  const value = mounted.createEngine(new AUFXAudioFormat(48000, 1)); expect(value).toBe(engine); expect(createEngine.mock.calls[0][3]).toBe(capability); expect(Object.keys(value)).not.toContain("capability"); value.dispose();
});

it("tracks the real finite startup receipt and excludes only the live mounted output", async () => {
  const owner = new AbortController();
  let resolveStart!: () => void;
  const startReceipt = new Promise<void>(resolve => { resolveStart = resolve; });
  const release = vi.fn();
  const engine = {
    start: vi.fn(() => startReceipt),
    stop: vi.fn(),
    dispose: vi.fn(),
  };
  const settlement = {
    track: vi.fn(<T,>(receipt: Promise<T>) => receipt),
    exclude: vi.fn(() => ({ id: "audio-live", release })),
  };
  const mounted = createMountedAudioGraphs(
    { createEngine: vi.fn(() => engine) } as any,
    owner.signal,
    () => ["audio.play"],
    "com.syndromatic.audio-probe",
    Object.freeze({}),
    settlement,
  );
  const value = mounted.createEngine(new AUFXAudioFormat(48000, 1));

  const starting = value.start();
  expect(settlement.track).toHaveBeenCalledWith(startReceipt, {
    owner: "audio",
    kind: "start",
    label: "com.syndromatic.audio-probe",
  });
  expect(settlement.exclude).not.toHaveBeenCalled();

  resolveStart();
  await starting;
  expect(settlement.exclude).toHaveBeenCalledWith({
    owner: "audio",
    kind: "stream",
    label: "com.syndromatic.audio-probe",
  });

  value.stop();
  value.stop();
  expect(release).toHaveBeenCalledTimes(1);
  value.dispose();
  expect(release).toHaveBeenCalledTimes(1);
});
