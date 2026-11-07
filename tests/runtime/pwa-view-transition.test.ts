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

import { expect, it, vi } from "vitest";
import { startBrowserViewTransition } from "../../src/SynCloudOS/PlatformAdapters/BrowserViewTransitionBackend";
it("uses the native snapshot lifecycle and removes its temporary styling", async () => {
  const element = document.createElement("div"); document.body.append(element);
  const update = vi.fn();
  const finished = Promise.resolve();
  const start = vi.fn((callback: () => void) => { queueMicrotask(callback); return { ready: finished, finished, updateCallbackDone: finished, skipTransition: vi.fn() }; });
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
  const handle = startBrowserViewTransition(element, update, { duration: 0.2, reducedMotion: false, signal: new AbortController().signal });
  expect(handle).not.toBeNull(); await handle!.finished;
  expect(start).toHaveBeenCalledOnce(); expect(update).toHaveBeenCalledOnce();
  expect(element.style.viewTransitionName).toBe("");
  expect(document.querySelector("[data-syncloudos-view-transition]")).toBeNull();
  element.remove();
});
it("leaves reduced motion and unsupported hosts to the existing AFX backend", () => {
  const element = document.createElement("div"), update = vi.fn();
  expect(startBrowserViewTransition(element, update, { duration: 0.2, reducedMotion: true, signal: new AbortController().signal })).toBeNull();
  expect(update).not.toHaveBeenCalled();
});
