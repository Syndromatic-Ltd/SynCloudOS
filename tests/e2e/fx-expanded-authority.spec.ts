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

test("expanded FX authority stays passive, policy-first and releases a late MIDI port", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/fx-expanded-authority-browser.html");
  const result = await page.evaluate(async () => {
    const [{ BrowserMIDIAdapter }, { MIDIService }, { createMountedMIDIClient }] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserMIDIAdapter.ts"),
      import("/src/SynCloudOS/MIDIFX/MIDIService.ts"),
      import("/src/SynCloudOS/AppSDK/mountedMIDIClient.ts"),
    ]);

    let requestCount = 0;
    let openCount = 0;
    let closeCount = 0;
    let resolveOpen!: () => void;
    const openPromise = new Promise<void>((resolve) => { resolveOpen = resolve; });
    const output = {
      id: "authority-output",
      type: "output" as const,
      manufacturer: "Syn",
      name: "Authority output",
      version: "1",
      state: "connected" as const,
      connection: "closed" as const,
      open() { openCount += 1; return openPromise; },
      close() { closeCount += 1; },
      send(_data: Uint8Array) {},
    };
    const access = {
      inputs: { values: () => [] as unknown[] },
      outputs: { values: () => [output] },
      addEventListener() {},
      removeEventListener() {},
    };
    const adapter = new BrowserMIDIAdapter({
      async requestMIDIAccess() {
        requestCount += 1;
        return access;
      },
    });
    const service = new MIDIService(adapter);
    const mount = new AbortController();
    let policyAllowed = false;
    const client = createMountedMIDIClient(
      service,
      mount.signal,
      () => ["midi.access"],
      () => policyAllowed,
    );
    const midi = client.createAccess();

    const passiveRequestCount = requestCount;
    const denied = await midi.requestAuthorization();
    const deniedRequestCount = requestCount;

    policyAllowed = true;
    const granted = await midi.requestAuthorization();
    const endpoint = midi.getEndpoints().find((candidate) => candidate.direction === "output")!;
    const pendingOutput = midi.acquireOutput(endpoint);
    await Promise.resolve();
    mount.abort(new DOMException("mount revoked", "AbortError"));
    const rejectedName = await pendingOutput.then(() => "resolved", (error) => error?.name ?? "unknown");
    resolveOpen();
    await openPromise;
    await Promise.resolve();
    await Promise.resolve();

    service.dispose();
    return {
      passiveRequestCount,
      denied,
      deniedRequestCount,
      granted,
      requestCount,
      openCount,
      closeCount,
      rejectedName,
    };
  });

  expect(result.passiveRequestCount).toBe(0);
  expect(result.denied).toEqual({ state: "policy-denied", sysex: false });
  expect(result.deniedRequestCount).toBe(0);
  expect(result.granted).toEqual({ state: "granted", sysex: false });
  expect(result.requestCount).toBe(1);
  expect(result.openCount).toBe(1);
  expect(result.rejectedName).toBe("AbortError");
  expect(result.closeCount).toBe(1);
});
