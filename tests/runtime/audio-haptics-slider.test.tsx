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

// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSESlider } from "../../src/NSE/Controls/Values/NSESlider";
import { HFXHapticEngine } from "../../src/FX/HapticsFX/HFXHapticEngine";
import { NSEFeedbackProvider } from "../../src/NSE/Feedback";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("attracts pointer values, breaks away, and keeps keyboard values precise", () => {
  const haptic = vi.fn();
  const engine = new HFXHapticEngine({ supported: true, trigger: haptic, cancel: vi.fn(), dispose: vi.fn() });
  render(<NSEFeedbackProvider value={engine}><NSESlider defaultValue={0} detents={[10, 20]} detentThreshold={2} aria-label="Volume" /></NSEFeedbackProvider>);
  const slider = screen.getByRole("slider") as HTMLInputElement;
  fireEvent.pointerDown(slider);
  fireEvent.change(slider, { target: { value: "9" } });
  expect(slider.value).toBe("10");
  fireEvent.change(slider, { target: { value: "11" } });
  expect(haptic).toHaveBeenCalledTimes(1);
  fireEvent.change(slider, { target: { value: "14" } });
  expect(slider.value).toBe("14");
  fireEvent.change(slider, { target: { value: "9" } });
  expect(haptic).toHaveBeenCalledTimes(2);
  fireEvent.pointerUp(slider);
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(slider.value).toBe("11");
  expect(haptic).toHaveBeenCalledTimes(2);
  fireEvent.change(slider, { target: { value: "19" } });
  expect(slider.value).toBe("19");
});

it("retains hard ticks when detents are also supplied", () => {
  render(<NSESlider defaultValue={0} ticks={[0, 50, 100]} detents={[10]} />);
  const slider = screen.getByRole("slider") as HTMLInputElement;
  fireEvent.pointerDown(slider);
  fireEvent.change(slider, { target: { value: "12" } });
  expect(slider.value).toBe("0");
});
