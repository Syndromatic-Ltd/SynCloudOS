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
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const cleanups: Array<() => unknown | Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture() {
  const runtime = createTestRuntime();
  registerTestSynWare(runtime, { schemaVersion: 1, id: "remote-notes", version: "1.0.0", title: "Remote Notes" });
  const mount = mountTestSynWareRuntime(runtime, "remote-notes");
  cleanups.push(() => runtime.dispose({ reason: "app error test", inFlight: "cancel" }), () => mount.dispose("app error test"));
  return { runtime, mount, errors: createSynWareContextValue(mount.runtime).errors };
}

describe("mounted app error recovery", () => {
  it("reports a remote app deadline with immutable application ownership", () => {
    const { runtime, errors } = fixture();
    errors.capture(new DOMException("Server deadline", "TimeoutError"), { operation: "notes.read", code: "APP_NOT_RESPONDING", timeoutMs: 5000 });
    expect(runtime.errors.getLatest()).toMatchObject({ code: "APP_NOT_RESPONDING", appId: "remote-notes", title: "Remote Notes has stopped responding.", context: { scope: "app", durationMs: 5000 } });
  });

  it("runs the real retry, reports another failure, and dismisses the recovered error", async () => {
    const { runtime, errors } = fixture();
    const retry = vi.fn().mockRejectedValueOnce(new TypeError("Still unreachable")).mockResolvedValueOnce(undefined);
    errors.capture(new TypeError("Failed to fetch"), { operation: "notes.read", code: "CONNECTION_ERROR", retry });
    await runtime.errors.getLatest()?.retry?.();
    expect(runtime.errors.getLatest()).toMatchObject({ code: "CONNECTION_ERROR", appId: "remote-notes", technicalMessage: "Still unreachable" });
    await runtime.errors.getLatest()?.retry?.();
    expect(retry).toHaveBeenCalledTimes(2);
    expect(runtime.errors.getHistory()).toEqual([]);
  });

  it("removes recovery callbacks on owner disposal and ignores a late retry result", async () => {
    const { runtime, mount, errors } = fixture();
    let reject!: (error: unknown) => void;
    errors.capture(new Error("No connection"), { operation: "notes.read", code: "CONNECTION_ERROR", retry: () => new Promise<void>((_, fail) => { reject = fail; }) });
    const pending = runtime.errors.getLatest()?.retry?.();
    mount.dispose("owner closed");
    reject(new TypeError("Late transport failure"));
    await pending;
    expect(runtime.errors.getHistory()).toEqual([]);
    expect(() => errors.capture(new Error("Revoked"), { operation: "notes.read" })).toThrow();
  });

  it("reports an in-flight retry failure even when bounded history evicts the original alert", async () => {
    const { runtime, errors } = fixture();
    let reject!: (error: unknown) => void;
    errors.capture(new Error("No connection"), { operation: "notes.read", code: "CONNECTION_ERROR", retry: () => new Promise<void>((_, fail) => { reject = fail; }) });
    const original = runtime.errors.getLatest()!;
    const pending = original.retry?.();
    for (let index = 0; index < 24; index += 1) runtime.errors.capture({ code: "UNKNOWN_RUNTIME_ERROR", title: `Other failure ${index}`, message: "Unrelated" });
    expect(runtime.errors.getHistory().some(error => error.id === original.id)).toBe(false);
    reject(new TypeError("Retry still unreachable"));
    await pending;
    expect(runtime.errors.getLatest()).toMatchObject({ code: "CONNECTION_ERROR", appId: "remote-notes", technicalMessage: "Retry still unreachable" });
  });

  it("does not start an obsolete retry after the alert is dismissed", async () => {
    const { runtime, errors } = fixture();
    const retry = vi.fn();
    errors.capture(new Error("No connection"), { operation: "notes.read", code: "CONNECTION_ERROR", retry });
    const original = runtime.errors.getLatest()!;
    runtime.errors.dismiss(original.id);
    await original.retry?.();
    expect(retry).not.toHaveBeenCalled();
  });

  it("does not mistake an arbitrary TypeError for a connection failure", () => {
    const { runtime, errors } = fixture();
    errors.capture(new TypeError("Cannot read property"), { operation: "notes.format" });
    expect(runtime.errors.getLatest()).toMatchObject({ code: "APP_CONTENT_FAILED", category: "app", appId: "remote-notes" });
  });
});
