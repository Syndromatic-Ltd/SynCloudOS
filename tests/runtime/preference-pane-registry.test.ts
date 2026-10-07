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

import { describe, expect, it, vi } from "vitest";
import type { PreferencePaneDescriptor } from "../../src/SynCloudOS/Preferences";
import { registerSystemPreferencePane } from "../../src/SynCloudOS/Preferences/preferencePaneRegistry";
import { createTestRuntime } from "./helpers";

function pane(id: string, order: number): PreferencePaneDescriptor {
  return { id, order, bundleIdentifier: `com.syndromatic.syncloudos.preference.${id}.prefpane`, create: () => id };
}

describe("runtime Preference Pane registry", () => {
  it("does not expose system pane registration to arbitrary runtime consumers", () => {
    const runtime = createTestRuntime();
    expect((runtime.preferencePanes as unknown as { register?: unknown }).register).toBeUndefined();
  });
  it("publishes an immutable stable order and rejects duplicate IDs", () => {
    const runtime = createTestRuntime();
    registerSystemPreferencePane(runtime.preferencePanes, pane("language", 500));
    registerSystemPreferencePane(runtime.preferencePanes, pane("appearance", 100));
    const snapshot = runtime.preferencePanes.getSnapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.map(({ id }) => id)).toEqual(["appearance", "language"]);
    expect(() => registerSystemPreferencePane(runtime.preferencePanes, pane("appearance", 900))).toThrow(/already registered/);
    expect(() => registerSystemPreferencePane(runtime.preferencePanes, { ...pane("other", 900), bundleIdentifier: "com.syndromatic.syncloudos.preference.appearance.prefpane" })).toThrow(/bundle identifier/);
  });

  it("contains throwing descriptors and stale cleanup without corrupting a later registration", () => {
    const runtime = createTestRuntime();
    const changed = vi.fn();
    runtime.preferencePanes.subscribe(changed);
    const first = registerSystemPreferencePane(runtime.preferencePanes, pane("motion", 300));
    first.dispose();
    const second = registerSystemPreferencePane(runtime.preferencePanes, pane("motion", 300));
    first.dispose();
    expect(runtime.preferencePanes.getSnapshot().map(({ id }) => id)).toEqual(["motion"]);
    const idGetter = vi.fn(() => "failure");
    const accessorDescriptor = Object.create(null, {
      id: { get: idGetter },
      order: { value: 1 },
      bundleIdentifier: { value: "com.syndromatic.syncloudos.preference.failure.prefpane" },
      create: { value: () => null },
    }) as PreferencePaneDescriptor;
    expect(() => registerSystemPreferencePane(runtime.preferencePanes, accessorDescriptor)).toThrow(/data properties/);
    expect(idGetter).not.toHaveBeenCalled();
    expect(runtime.preferencePanes.getSnapshot().map(({ id }) => id)).toEqual(["motion"]);
    second.dispose();
    expect(changed).toHaveBeenCalledTimes(4);
  });

  it("isolates two runtimes and deterministically refuses work after disposal", async () => {
    const first = createTestRuntime({ id: "runtime:preferences:first" });
    const second = createTestRuntime({ id: "runtime:preferences:second" });
    registerSystemPreferencePane(first.preferencePanes, pane("appearance", 100));
    expect(second.preferencePanes.getSnapshot()).toEqual([]);
    await first.dispose("test");
    expect(first.preferencePanes.getSnapshot()).toEqual([]);
    expect(() => registerSystemPreferencePane(first.preferencePanes, pane("motion", 300))).toThrow(/disposed|foreign/);
    expect(second.preferencePanes.getSnapshot()).toEqual([]);
  });

  it("keeps .prefpane exclusive to valid system bundle identifiers", () => {
    const runtime = createTestRuntime();
    expect(() => registerSystemPreferencePane(runtime.preferencePanes, { ...pane("bad", 1), bundleIdentifier: "com.example.third-party.prefpane" })).toThrow(/system-owned/);
  });
});
