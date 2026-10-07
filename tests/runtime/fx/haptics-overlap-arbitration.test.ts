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

import { afterEach, expect, it, vi } from "vitest";
import { HFXHapticPattern } from "../../../src/FX/HapticsFX/public";
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";
import { createRuntimeHapticsHostService } from "../../../src/SynCloudOS/HapticsFX/HapticsHostService";

afterEach(() => vi.useRealTimers());

function fixture() {
  vi.useFakeTimers();
  const vibrate = vi.fn(() => true);
  const host = createRuntimeHapticsHostService(new AUFXSystemFeedbackBus(() => null), {
    navigator: { vibrate } as Pick<Navigator, "vibrate">,
    document: null,
    audio: "off",
  });
  const session = host.createSession();
  return { host, session, vibrate };
}

it("does not let an older overlapping player cancel the current browser actuator owner", async () => {
  const { host, session, vibrate } = fixture();
  const pattern = new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 1 }]);
  const older = session.makeAdvancedPlayer(pattern), newer = session.makeAdvancedPlayer(pattern);
  older.start(); await vi.advanceTimersByTimeAsync(0); newer.start(); await vi.advanceTimersByTimeAsync(0);
  vibrate.mockClear();
  older.stop();
  expect(vibrate).not.toHaveBeenCalled();
  newer.stop();
  expect(vibrate).toHaveBeenLastCalledWith(0);
  session.dispose(); host.dispose();
});

it("does not let an older delayed event reclaim a newer-started active player", async () => {
  const { host, session, vibrate } = fixture();
  const older = session.makeAdvancedPlayer(new HFXHapticPattern([{ type: "transient", relativeTime: 0.1 }]));
  const newer = session.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 1 }]));
  older.start(); newer.start(); await vi.advanceTimersByTimeAsync(0);
  const currentCalls = vibrate.mock.calls.length;
  await vi.advanceTimersByTimeAsync(100);
  expect(vibrate).toHaveBeenCalledTimes(currentCalls);
  newer.stop(); older.stop(); session.dispose(); host.dispose();
});

it("orders player starts across sessions and keeps a later direct emission authoritative", async () => {
  const { host, session: olderSession, vibrate } = fixture();
  const newerSession = host.createSession();
  const older = olderSession.makeAdvancedPlayer(new HFXHapticPattern([{ type: "transient", relativeTime: 0.1 }]));
  const newer = newerSession.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 1 }]));
  older.start(); newer.start(); await vi.advanceTimersByTimeAsync(0);
  const afterNewer = vibrate.mock.calls.length;
  await vi.advanceTimersByTimeAsync(100);
  expect(vibrate).toHaveBeenCalledTimes(afterNewer);

  newer.stop();
  const direct = olderSession.makeAdvancedPlayer(new HFXHapticPattern([{ type: "transient", relativeTime: 0.1 }]));
  direct.start();
  host.system.emit({ type: "continuous", relativeTime: 0, duration: 1 });
  const afterDirect = vibrate.mock.calls.length;
  await vi.advanceTimersByTimeAsync(100);
  expect(vibrate).toHaveBeenCalledTimes(afterDirect);
  direct.stop(); older.stop(); olderSession.dispose(); newerSession.dispose(); host.dispose();
});

it("ignores stale haptic parameter updates without blocking current-owner updates", async () => {
  const { host, session, vibrate } = fixture();
  const pattern = new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 1 }]);
  const older = session.makeAdvancedPlayer(pattern), newer = session.makeAdvancedPlayer(pattern);
  older.start(); await vi.advanceTimersByTimeAsync(0); newer.start(); await vi.advanceTimersByTimeAsync(0); vibrate.mockClear();
  older.sendParameters([{ parameterID: "intensity", value: 0.2, relativeTime: 0 }]);
  expect(vibrate).not.toHaveBeenCalled();
  newer.sendParameters([{ parameterID: "intensity", value: 0.6, relativeTime: 0 }]);
  expect(vibrate).toHaveBeenCalledOnce();
  older.stop(); newer.stop(); session.dispose(); host.dispose();
});

it("does not renew an older looping player's host order at an internal rollover", async () => {
  const { host, session, vibrate } = fixture();
  const older = session.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 0.1 }]));
  older.loopEnabled = true;
  const newer = session.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 1 }]));
  older.start(); await vi.advanceTimersByTimeAsync(0); newer.start(); await vi.advanceTimersByTimeAsync(0);
  const callsAfterNewer = vibrate.mock.calls.length;
  await vi.advanceTimersByTimeAsync(100);
  await vi.advanceTimersByTimeAsync(0);
  expect(vibrate).toHaveBeenCalledTimes(callsAfterNewer);
  older.stop(); newer.stop(); session.dispose(); host.dispose();
});
