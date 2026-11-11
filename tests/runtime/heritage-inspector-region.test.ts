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
import { StrictMode, createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestRuntime, registerTrustedTestSynWare } from "./helpers";
import diagnosticsManifest from "./diagnostics-fixture";
import * as region from "../../src/SynCloudOSReact/DevInspectorRegion";

const { loadInspector } = vi.hoisted(() => ({ loadInspector: vi.fn() }));
vi.mock("../../src/SynCloudOS/Inspector/inspectorDevEntry", () => ({ loadInspector }));
const runtimes: ReturnType<typeof createTestRuntime>[] = [];
function runtime(trusted = true, privileges: string[] = ["diagnostics"]) {
  const value = createTestRuntime(); runtimes.push(value);
  if (trusted) registerTrustedTestSynWare(value, diagnosticsManifest, privileges);
  return value;
}
function session(label: string) {
  return { client: Object.freeze({}), View: () => createElement("p", null, label), dispose: vi.fn(), localization: undefined };
}
function props(value = runtime()) {
  return { runtime: value, appId: "com.example.diagnostics", enabled: true, mountSignal: new AbortController().signal };
}
beforeEach(() => { loadInspector.mockReset(); });
afterEach(async () => { cleanup(); for (const value of runtimes.splice(0)) await value.dispose(); });

describe("private Inspector host region", () => {
  it("exports the host-owned region", () => { expect(region.DevInspectorRegion).toBeTypeOf("function"); });
  it("does not import the session for ordinary, disabled or aborted mounts", async () => {
    const ordinary = props(runtime(false));
    const mounted = render(createElement(region.DevInspectorRegion, ordinary));
    await act(async () => {}); expect(loadInspector).not.toHaveBeenCalled();
    mounted.rerender(createElement(region.DevInspectorRegion, { ...props(), enabled: false }));
    await act(async () => {}); expect(loadInspector).not.toHaveBeenCalled();
    const abort = new AbortController(); abort.abort();
    mounted.rerender(createElement(region.DevInspectorRegion, { ...props(), mountSignal: abort.signal }));
    await act(async () => {}); expect(loadInspector).not.toHaveBeenCalled();
    expect(mounted.container.textContent).toBe("");
  });
  it("does not import the session for a trusted bundle that lacks the diagnostics privilege", async () => {
    const mounted = render(createElement(region.DevInspectorRegion, props(runtime(true, ["conformance"]))));
    await act(async () => {}); expect(loadInspector).not.toHaveBeenCalled();
    expect(mounted.container.textContent).toBe("");
  });
  it("aborts pending imports on unmount and disposes any session returned late", async () => {
    let resolve!: (value: ReturnType<typeof session>) => void;
    loadInspector.mockImplementation(() => new Promise(done => { resolve = done; }));
    const mounted = render(createElement(region.DevInspectorRegion, props()));
    await waitFor(() => expect(loadInspector).toHaveBeenCalledOnce());
    const signal = loadInspector.mock.calls[0][0].mountSignal as AbortSignal;
    mounted.unmount(); expect(signal.aborted).toBe(true);
    const late = session("stale import"); await act(async () => { resolve(late); });
    expect(late.dispose).toHaveBeenCalledOnce(); expect(screen.queryByText("stale import")).toBeNull();
  });
  it("prevents an old runtime's late session from replacing the current one", async () => {
    let resolve!: (value: ReturnType<typeof session>) => void;
    loadInspector.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const mounted = render(createElement(region.DevInspectorRegion, props()));
    await waitFor(() => expect(loadInspector).toHaveBeenCalledOnce());
    const current = session("current runtime"); loadInspector.mockResolvedValueOnce(current);
    mounted.rerender(createElement(region.DevInspectorRegion, props()));
    await screen.findByText("current runtime");
    const stale = session("previous runtime"); await act(async () => { resolve(stale); });
    expect(stale.dispose).toHaveBeenCalledOnce(); expect(screen.queryByText("previous runtime")).toBeNull();
    expect(screen.getByText("current runtime")).toBeTruthy(); mounted.unmount(); expect(current.dispose).toHaveBeenCalledOnce();
  });
  it("releases StrictMode sessions and revokes visible content on the actual mount signal", async () => {
    const created: ReturnType<typeof session>[] = [];
    loadInspector.mockImplementation(async () => { const value = session("active Inspector"); created.push(value); return value; });
    const controller = new AbortController();
    const request = { ...props(), mountSignal: controller.signal };
    const mounted = render(createElement(StrictMode, null, createElement(region.DevInspectorRegion, request)));
    await screen.findByText("active Inspector");
    await act(async () => { controller.abort(); });
    expect(screen.queryByText("active Inspector")).toBeNull();
    mounted.unmount(); expect(created.every(value => value.dispose.mock.calls.length === 1)).toBe(true);
  });
  it("rechecks real bundle provenance after async loading and suppresses private error text", async () => {
    const request = props();
    let resolve!: (value: ReturnType<typeof session>) => void;
    loadInspector.mockImplementation(() => new Promise(done => { resolve = done; }));
    const mounted = render(createElement(region.DevInspectorRegion, request));
    await waitFor(() => expect(loadInspector).toHaveBeenCalledOnce());
    await act(async () => { await request.runtime.apps.unregister("com.example.diagnostics"); });
    const late = session("revoked bundle"); await act(async () => { resolve(late); });
    expect(late.dispose).toHaveBeenCalledOnce(); expect(mounted.container.textContent).not.toContain("revoked bundle");
    loadInspector.mockRejectedValueOnce(new Error("SECRET_MODULE_LOCATION"));
    mounted.rerender(createElement(region.DevInspectorRegion, props()));
    await waitFor(() => expect(loadInspector).toHaveBeenCalledTimes(2));
    await act(async () => {}); expect(mounted.container.textContent).not.toContain("SECRET_MODULE_LOCATION");
  });
});
