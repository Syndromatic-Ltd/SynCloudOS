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
import { createTestRuntime } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
const runtime = () => { const value = createTestRuntime(); runtimes.push(value); return value; };
afterEach(async () => { for (const value of runtimes.splice(0)) await value.dispose({ reason: "recovery test", inFlight: "cancel" }); });

describe("existing ErrorManager recovery classifications", () => {
  it("keeps app deadlines on the app's identity and offers a real retry", () => {
    const host = runtime();
    const retry = vi.fn();
    const app = { bundleIdentifier: "com.example.notes", displayName: "Notes", packageName: "Notes.app" };
    const error = host.errors.createNotRespondingError(app, { reason: "request-timeout", durationMs: 15000 }, retry);
    expect(error).toMatchObject({ code: "APP_NOT_RESPONDING", title: "Notes has stopped responding.", appId: "com.example.notes", category: "app", recoverable: true, retry });
    expect(error.context).toMatchObject({ scope: "app", reason: "request-timeout", durationMs: 15000 });
    error.retry?.();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("uses the configured site name for a server deadline without claiming a dropped connection", () => {
    const error = runtime().errors.createNotRespondingError(null, { siteName: "Example Site", reason: "request-timeout" });
    expect(error).toMatchObject({ code: "SITE_NOT_RESPONDING", title: "Example Site has stopped responding.", category: "watchdog", context: { scope: "site" } });
    expect(error.message).toContain("reply");
    expect(error.message).not.toMatch(/connection (?:dropped|lost)|internet (?:dropped|lost)/i);
  });

  it("distinguishes an unreachable destination from a known offline connection", () => {
    const host = runtime();
    const failure = host.errors.createConnectionError(null, new TypeError("Failed to fetch"), { siteName: "Example Site", reason: "transport-failure" });
    expect(failure).toMatchObject({ code: "CONNECTION_ERROR", title: "Connection Error", context: { scope: "site" } });
    expect(failure.message).toContain("connect");
    expect(failure.message).not.toContain("offline");
    const offline = host.errors.createConnectionError(null, new Error("Offline"), { reason: "offline" });
    expect(offline.message).toContain("offline");
  });

  it("classifies an existing app launch timeout but leaves ordinary failures and cancellation alone", () => {
    const host = runtime();
    const app = { bundleIdentifier: "com.example.notes", displayName: "Notes", packageName: "Notes.app" };
    expect(host.errors.createAppLaunchFailedError(app, new DOMException("Route preparation timed out.", "TimeoutError")).code).toBe("APP_NOT_RESPONDING");
    expect(host.errors.createAppLaunchFailedError(app, new Error("Invalid module")).code).toBe("APP_LAUNCH_FAILED");
    expect(host.errors.createAppLaunchFailedError(app, new DOMException("Cancelled", "AbortError")).code).toBe("APP_LAUNCH_FAILED");
  });
});
