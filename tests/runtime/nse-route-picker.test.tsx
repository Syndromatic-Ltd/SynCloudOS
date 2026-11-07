// @vitest-environment jsdom
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

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NSERoutePickerView } from "../../src/NSE/Controls/Media/NSERoutePickerView";
import type { VFXRouteDetector } from "../../src/FX/VideoFX/VFXRouteDetector";

it("uses NSEButton and invokes the native route chooser from the click", () => {
  const prompt = vi.fn(async () => {});
  const detector = { capabilities: { remotePlayback: true }, connectionState: "connected", subscribe: () => () => {}, prompt } as unknown as VFXRouteDetector;
  render(<NSERoutePickerView routeDetector={detector} />);
  const button = screen.getByRole("button", { name: "Choose playback device" });
  expect(button.getAttribute("data-nse-control")).toBe("route-picker");
  expect(button.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button); expect(prompt).toHaveBeenCalledTimes(1);
});
