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

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createElement, StrictMode } from "react";
import {
  SynCloudOSProvider,
  useRuntimeSnapshot,
  useRuntimeSelector,
  useKernelSynCloudOS,
} from "../../src/SynCloudOSReact";
import { createTestRuntime } from "./helpers";

afterEach(() => cleanup());

function Probe() {
  const runtime = useKernelSynCloudOS();
  const route = useRuntimeSelector((snapshot) => snapshot.application.routePath);
  return createElement("output", { "data-route": route }, runtime.runtimeId);
}

describe("SynCloudOS React provider", () => {
  it("selects from the nearest runtime and rejects a missing provider", () => {
    const first = createTestRuntime({ id: "runtime:first" });
    const second = createTestRuntime({ id: "runtime:second" });
    const view = render(
      createElement(SynCloudOSProvider, { runtime: first }, createElement(Probe)),
    );
    expect(screen.getByText("runtime:first")).toBeTruthy();

    view.rerender(createElement(SynCloudOSProvider, { runtime: second }, createElement(Probe)));
    expect(screen.getByText("runtime:second")).toBeTruthy();
    expect(() => render(createElement(Probe))).toThrow(/SynCloudOSProvider/);
  });

  it("does not boot or duplicate listeners when StrictMode remounts the provider", () => {
    const runtime = createTestRuntime({ id: "runtime:strict" });
    render(createElement(StrictMode, null, createElement(SynCloudOSProvider, { runtime }, createElement(Probe))));
    expect(runtime.store.getSnapshot().booted).toBe(false);
    expect(runtime.operations.inspectPending()).toEqual([]);
  });

  it("rejects every public runtime hook outside a provider", () => {
    function SnapshotProbe() {
      return createElement("output", null, useRuntimeSnapshot().runtimeId);
    }

    expect(() => render(createElement(SnapshotProbe))).toThrow(/SynCloudOSProvider/);
  });
});
