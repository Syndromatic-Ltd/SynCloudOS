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
import { describe, expect, it, vi } from "vitest";
import {
  createManagedRouteEntry,
  mergeManagedRouteHistoryState,
  readManagedRouteEntry,
} from "../../src/SynCloudOS/Routing/BrowserRouteHistory";
import { createSynCloudOSBrowserRouteSynchronizer } from "../../src/SynCloudOS/PlatformAdapters/BrowserRouteSync";

describe("Routing II browser entry protocol", () => {
  it("merges the namespaced route entry into unrelated host history state", () => {
    const entry = createManagedRouteEntry({
      runtimeSession: "runtime:test",
      entryKey: "entry:2",
      position: 2,
      routeRevision: 7,
    });
    const merged = mergeManagedRouteHistoryState({ host: { selection: 9 }, another: true }, entry);

    expect(merged).toMatchObject({ host: { selection: 9 }, another: true });
    expect(readManagedRouteEntry(merged)).toEqual(entry);
  });

  it("preserves non-object host state instead of silently discarding it", () => {
    const entry = createManagedRouteEntry({
      runtimeSession: "runtime:test",
      entryKey: "entry:1",
      position: 1,
      routeRevision: 1,
    });
    const merged = mergeManagedRouteHistoryState("host-token", entry);

    expect(merged).toMatchObject({ __syncloudosHostState: "host-token" });
    expect(readManagedRouteEntry(merged)).toEqual(entry);
  });

  it("updates state on the current href with replaceState and never manufactures a push", () => {
    window.history.replaceState({ host: "keep" }, "", "/software?q=air");
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    const synchronizer = createSynCloudOSBrowserRouteSynchronizer({
      getWindow: () => window,
      getLocation: () => ({
        href: window.location.href,
        origin: window.location.origin,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      }),
    });
    const state = mergeManagedRouteHistoryState(window.history.state, createManagedRouteEntry({
      runtimeSession: "runtime:test",
      entryKey: "entry:1",
      position: 1,
      routeRevision: 2,
    }));

    const result = synchronizer.syncRoute("/software?q=air", {
      replace: true,
      dispatchPopState: false,
      state,
    });

    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.history.state.host).toBe("keep");
    expect(result).toMatchObject({ changed: false, replaced: true });
    push.mockRestore();
    replace.mockRestore();
  });

  it("can create a distinct managed history entry for an intentional same-href push", () => {
    window.history.replaceState({ host: "keep" }, "", "/software");
    const push = vi.spyOn(window.history, "pushState");
    const synchronizer = createSynCloudOSBrowserRouteSynchronizer({
      getWindow: () => window,
      getLocation: () => ({
        href: window.location.href,
        origin: window.location.origin,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      }),
    });
    const state = mergeManagedRouteHistoryState(window.history.state, createManagedRouteEntry({
      runtimeSession: "runtime:test",
      entryKey: "entry:2",
      position: 2,
      routeRevision: 3,
    }));

    const result = synchronizer.syncRoute("/software", {
      dispatchPopState: false,
      state,
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(window.history.state.host).toBe("keep");
    expect(readManagedRouteEntry(window.history.state)).toMatchObject({ entryKey: "entry:2", position: 2 });
    expect(result).toMatchObject({ changed: true, replaced: false, dispatchedPopState: false });
    push.mockRestore();
  });
});
