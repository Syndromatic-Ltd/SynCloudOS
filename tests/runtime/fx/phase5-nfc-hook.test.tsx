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
import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BrowserNFCAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserNFCAdapter";
import { createMountedNFCClient } from "../../../src/SynCloudOS/AppSDK/mountedNFCClient";
import { useNFC } from "../../../src/SynCloudOS/AppSDK/hooks/useNFC";

const facade = vi.hoisted(() => ({ current: {} as { nfc?: ReturnType<typeof createMountedNFCClient> } }));
vi.mock("../../../src/SynCloudOS/AppSDK/scos/useSCOS", () => ({ useSCOS: () => facade.current }));

it("useNFC mounts passively under StrictMode and aborts its sessions at component unmount", async () => {
  let signal: AbortSignal | undefined;
  let constructions = 0;
  class Reader extends EventTarget {
    constructor() { super(); constructions++; }
    async scan(options: { signal: AbortSignal }) { signal = options.signal; }
    async write() {}
  }
  facade.current = { nfc: createMountedNFCClient(new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }), new AbortController().signal, () => ["nfc.read"], () => true) };
  const hook = renderHook(() => useNFC(), { wrapper: StrictMode });
  const original = hook.result.current;
  expect(constructions).toBe(0);
  hook.rerender();
  expect(hook.result.current).toBe(original);
  const session = hook.result.current.createReaderSession();
  await act(() => session.scan(() => {}));
  expect(signal?.aborted).toBe(false);
  hook.unmount();
  expect(signal?.aborted).toBe(true);
  await expect(session.scan(() => {})).rejects.toMatchObject({ name: "AbortError" });
  expect(() => original.createReaderSession()).toThrow("not mounted");
});
