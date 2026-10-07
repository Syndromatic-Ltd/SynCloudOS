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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import {
  createTestRuntime,
  createTestRuntimeEnvironment,
  mountTestSynWareRuntime,
  registerTestSynWare,
} from "./helpers";

const activeRuntimes: ReturnType<typeof createTestRuntime>[] = [];
const activeMounts: ReturnType<typeof mountTestSynWareRuntime>[] = [];

afterEach(async () => {
  for (const mounted of activeMounts.splice(0)) mounted.dispose("test complete");
  for (const runtime of activeRuntimes.splice(0)) await runtime.dispose("test complete");
});

function createFixture(nativeShare?: (request: ShareData) => Promise<void>, permissions: readonly string[] = ["web.share"]) {
  const environment = createTestRuntimeEnvironment();
  Object.assign(environment.browser, {
    getNavigator: () => nativeShare ? ({ share: nativeShare } as Navigator) : ({} as Navigator),
  });
  const runtime = createTestRuntime({ environment });
  activeRuntimes.push(runtime);
  registerTestSynWare(runtime, {
    schemaVersion: 1,
    id: "share-reader",
    version: "1.0.0",
    title: "Share reader",
    routes: [{ path: "/share-reader", primary: true }],
    permissions,
  });
  const mounted = mountTestSynWareRuntime(runtime, "share-reader");
  activeMounts.push(mounted);
  return createSynWareContextValue(mounted.runtime).share;
}

const request = Object.freeze({
  title: "A shared document",
  text: "Published document excerpt",
  url: "https://example.test/documents/example",
});

describe("mounted AppSDK share client", () => {
  it("rejects sharing without its manifest capability before accessing the native API", async () => {
    const nativeShare = vi.fn(async () => undefined);
    const share = createFixture(nativeShare, []);
    await expect(share.share(request)).rejects.toMatchObject({ name: "SecurityError" });
    expect(nativeShare).not.toHaveBeenCalled();
  });
  it("reports a completed native share as shared", async () => {
    const nativeShare = vi.fn(async () => undefined);
    const share = createFixture(nativeShare);

    await expect(share.share(request)).resolves.toBe("shared");
    expect(nativeShare).toHaveBeenCalledWith(request);
  });

  it("reports only a genuine AbortError cancellation as cancelled", async () => {
    const share = createFixture(vi.fn(async () => {
      throw new DOMException("The user cancelled sharing.", "AbortError");
    }));

    await expect(share.share(request)).resolves.toBe("cancelled");
  });

  it("reports unavailable native sharing without attempting a native call", async () => {
    const share = createFixture();

    expect(share.available()).toBe(false);
    await expect(share.share(request)).resolves.toBe("cancelled");
  });

  it("rejects an unexpected native share failure for the mounted app to present", async () => {
    const failure = new DOMException("Sharing is forbidden by platform policy.", "NotAllowedError");
    const share = createFixture(vi.fn(async () => {
      throw failure;
    }));

    await expect(share.share(request)).rejects.toBe(failure);
  });
});
