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
import { createMountedHapticsClient } from "../../../src/SynCloudOS/AppSDK/mountedHapticsClient";
import { createRuntimeHapticsHostService } from "../../../src/SynCloudOS/HapticsFX/HapticsHostService";
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";

it("checks current bundle permission before acquiring any haptic authority", () => {
  const createSession = vi.fn();
  const client = createMountedHapticsClient({ createSession }, new AbortController().signal, () => []);
  expect(() => client.createEngine()).toThrow(/haptics.play/);
  expect(createSession).not.toHaveBeenCalled();
});

it("revokes only the owning mount and hides global policy", async () => {
  const host = createRuntimeHapticsHostService(new AUFXSystemFeedbackBus(() => null), { navigator: null, audio: "off" });
  const a = new AbortController(), b = new AbortController();
  const client = createMountedHapticsClient(host, a.signal, () => ["haptics.play"]);
  const first = client.createEngine();
  const other = createMountedHapticsClient(host, b.signal, () => ["haptics.play"]).createEngine();
  expect(Object.isFrozen(first)).toBe(true);
  expect("setButtonSoundEnabled" in first).toBe(false);
  a.abort();
  await expect(first.trigger("medium")).rejects.toThrow(expect.objectContaining({ code: "HFX_HAPTIC_ENGINE_DISPOSED" }));
  await expect(other.trigger("medium")).resolves.toBeUndefined();
  expect(() => client.createEngine()).toThrow();
  host.dispose();
});

it("returns lease capacity on caller abort and explicit disposal", () => {
  const host = createRuntimeHapticsHostService(new AUFXSystemFeedbackBus(() => null), { navigator: null, audio: "off" });
  const owner = new AbortController();
  const client = createMountedHapticsClient(host, owner.signal, () => ["haptics.play"]);
  const caller = new AbortController();
  const first = client.createEngine(caller.signal);
  for (let i = 0; i < 7; i++) client.createEngine();
  expect(() => client.createEngine()).toThrow(/limit/);
  caller.abort(); first.dispose();
  const replacement = client.createEngine();
  replacement.dispose(); replacement.dispose();
  expect(() => client.createEngine()).not.toThrow();
  owner.abort(); host.dispose();
});
