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

import { expect, test } from "playwright/test";

test("browser haptic capability labels keep approximation, disabled vibration and no-device states distinct", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ createRuntimeHapticsService }, { AUFXSystemFeedbackBus }] = await Promise.all([
      import("/src/SynCloudOS/HapticsFX/HapticsService.ts"),
      import("/src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus.ts"),
    ]);
    const make = (navigatorLike: Pick<Navigator, "vibrate"> | null) => {
      const bus = new AUFXSystemFeedbackBus(() => null);
      const engine = createRuntimeHapticsService(bus, { navigator: navigatorLike, document: null, audio: "off" });
      return { bus, engine };
    };
    const actualSupported = typeof navigator.vibrate === "function";
    const actual = make(actualSupported ? navigator : null);
    const actualCapabilities = actual.engine.capabilities;

    const fakePatterns: (number | number[])[] = [];
    const enabled = make({ vibrate: pattern => { fakePatterns.push(Array.isArray(pattern) ? [...pattern] : pattern); return true; } } as Pick<Navigator, "vibrate">);
    const enabledCapabilities = enabled.engine.capabilities;
    enabled.engine.setVibrationEnabled(false);
    const callsAfterDisable = fakePatterns.length;
    const patternsAfterDisable = [...fakePatterns];
    await enabled.engine.trigger("selection", { audio: false });
    const callsAfterDisabledTrigger = fakePatterns.length;

    const unavailable = make(null);
    const unavailableCapabilities = unavailable.engine.capabilities;
    const record = { actualSupported, actualCapabilities, enabledCapabilities, patternsAfterDisable, callsAfterDisable, callsAfterDisabledTrigger, unavailableCapabilities };
    actual.engine.dispose(); actual.bus.dispose(); enabled.engine.dispose(); enabled.bus.dispose(); unavailable.engine.dispose(); unavailable.bus.dispose();
    return record;
  });

  console.log(`HFX browser capability observation: ${JSON.stringify(result)}`);
  expect(result.actualCapabilities.state).toBe(result.actualSupported ? "available" : "unavailable");
  expect(result.enabledCapabilities).toMatchObject({
    state: "available", timing: true, amplitude: false, sharpness: false,
    fidelity: { timing: "approximate", amplitude: "timing-approximation", sharpness: "unavailable", dynamicParameters: "timing-approximation" },
  });
  expect(result.patternsAfterDisable).toEqual([0]);
  expect(result.callsAfterDisable).toBe(1);
  expect(result.callsAfterDisabledTrigger).toBe(1);
  expect(result.unavailableCapabilities).toMatchObject({
    state: "unavailable", timing: false, amplitude: false, sharpness: false,
    fidelity: { timing: "unavailable", amplitude: "unavailable", sharpness: "unavailable", dynamicParameters: "unavailable" },
  });
});
