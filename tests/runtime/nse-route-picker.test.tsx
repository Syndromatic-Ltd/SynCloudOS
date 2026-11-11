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
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSERoutePickerView } from "../../src/NSE/Controls/Media/NSERoutePickerView";
import { BrowserVideoPresentationAdapter } from "../../src/SynCloudOS/PlatformAdapters/BrowserVideoPresentationAdapter";
import type { VFXRouteDetector } from "../../src/FX/VideoFX/VFXRouteDetector";

it("uses NSEButton and invokes the native route chooser from the click", () => {
  const prompt = vi.fn(async () => {});
  const detector = { capabilities: { remotePlayback: true }, connectionState: "connected", subscribe: () => () => {}, prompt } as unknown as VFXRouteDetector;
  render(<NSERoutePickerView routeDetector={detector} />);
  const button = screen.getByRole("button", { name: "Choose playback device" });
  expect(button.getAttribute("data-nse-control")).toBe("route-picker-view");
  expect(button.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button); expect(prompt).toHaveBeenCalledTimes(1);
});

afterEach(cleanup);
it("refreshes enablement when capabilities change without a connection-state change", () => {
  let enabled = true;
  const listeners = new Set<() => void>();
  const detector = { get capabilities() { return { remotePlayback: enabled }; }, connectionState: "unknown",
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, prompt: vi.fn(async () => {}) } as unknown as VFXRouteDetector;
  render(<NSERoutePickerView routeDetector={detector} />);
  const button = screen.getByRole("button", { name: "Choose playback device" });
  expect(button.hasAttribute("disabled")).toBe(false);
  act(() => { enabled = false; for (const listener of listeners) listener(); });
  expect(button.hasAttribute("disabled")).toBe(true);
});

it("refreshes the actual browser detector reset and final abort state", async () => {
  const remote = Object.assign(new EventTarget(), { state: "disconnected", watchAvailability: async (callback: (available: boolean) => void) => { callback(false); return 1; }, cancelWatchAvailability: async () => {}, prompt: async () => {} });
  const video = Object.assign(new EventTarget(), { remote }) as unknown as HTMLVideoElement;
  const owner = new AbortController();
  const detector = new BrowserVideoPresentationAdapter(null).createRouteDetector(video, owner.signal, () => true);
  await detector.startDiscovery();
  render(<NSERoutePickerView routeDetector={detector} />);
  const button = screen.getByRole("button", { name: "Choose playback device" });
  expect(button.getAttribute("data-route-state")).toBe("disconnected");
  act(() => detector.stopDiscovery());
  expect(button.getAttribute("data-route-state")).toBe("unknown");
  act(() => owner.abort());
  expect(button.hasAttribute("disabled")).toBe(true);
});
