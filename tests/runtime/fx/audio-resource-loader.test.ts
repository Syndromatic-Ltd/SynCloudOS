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
import { createBrowserAudioResourceLoader } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAudioResourceLoader";

it("rejects non-owned cross-origin resources before fetch", async () => {
  const fetch = vi.fn(), load = createBrowserAudioResourceLoader({ location: { href: "https://syncloud.test/app", origin: "https://syncloud.test" }, fetch } as unknown as Window);
  await expect(load("https://other.test/tone.wav", new AbortController().signal)).rejects.toMatchObject({ name: "SecurityError" }); expect(fetch).not.toHaveBeenCalled();
});

it("settles promptly when an in-flight fetch ignores abort", async () => {
  let finish!: (response: Response) => void; const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  const load = createBrowserAudioResourceLoader({ location: { href: "https://syncloud.test/app", origin: "https://syncloud.test" }, fetch } as unknown as Window), controller = new AbortController(), pending = load("/tone.wav", controller.signal);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled()); controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  finish({ ok: true, status: 200, headers: { get: () => "audio/wav" }, body: null } as unknown as Response); await Promise.resolve();
});

it("cancels a continuing response body that arrives after fetch abort", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const load = createBrowserAudioResourceLoader({ location: { href: "https://syncloud.test/app", origin: "https://syncloud.test" }, fetch } as unknown as Window);
  const controller = new AbortController(), pending = load("/tone.wav", controller.signal);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  finish({ ok: true, status: 200, headers: { get: () => "audio/wav" }, body: { cancel } } as unknown as Response);
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
});

it("settles promptly when an in-flight body read and cancellation ignore abort", async () => {
  const read = vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {}));
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const releaseLock = vi.fn();
  const fetch = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => "audio/wav" }, body: { getReader: () => ({ read, cancel, releaseLock }) } } as unknown as Response));
  const load = createBrowserAudioResourceLoader({ location: { href: "https://syncloud.test/app", origin: "https://syncloud.test" }, fetch } as unknown as Window);
  const controller = new AbortController(), pending = load("/tone.wav", controller.signal);
  await vi.waitFor(() => expect(read).toHaveBeenCalled());
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(cancel).toHaveBeenCalled();
});
