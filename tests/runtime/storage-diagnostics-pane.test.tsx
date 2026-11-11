// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RuntimeInputBoundary, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { SystemUILayer } from "../../src/Webspring/SystemUILayer";
import { StorageDiagnosticsController } from "../../src/Webspring/Preferences/Storage.prefPane/StorageDiagnosticsController";
import { createTestRuntime, createTestRuntimeEnvironment, unlockRuntime } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const runtime of runtimes.splice(0)) await runtime.dispose(); });
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture(storage: unknown) {
  const env = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ authenticationPolicy: "disabled", environment: { ...env, browser: { ...env.browser, getNavigator: () => ({ storage }) as Navigator } } });
  runtimes.push(runtime); runtime.store.mutate(draft => { draft.booted = true; });
  return runtime;
}
function view(runtime: ReturnType<typeof createTestRuntime>) {
  render(<SynCloudOSProvider runtime={runtime}><RuntimeInputBoundary><SystemUILayer /></RuntimeInputBoundary></SynCloudOSProvider>);
  act(() => runtime.systemUI.preferences.open("storage"));
}
describe("owned Storage preference pane", () => {
  it("queries only on explicit check/refresh, reports approximate scope/limits and keeps stored settings/readiness unchanged", async () => {
    const estimate = vi.fn(async () => ({ usage: 0, quota: 123 })), persisted = vi.fn(async () => false), persist = vi.fn();
    const runtime = fixture({ estimate, persisted, persist }); const write = vi.spyOn(runtime.settings, "set"), readiness = runtime.updateReadiness.getSnapshot();
    view(runtime); expect(estimate).not.toHaveBeenCalled(); expect(persisted).not.toHaveBeenCalled(); expect(screen.getByRole("status").textContent).toBe("Storage has not been checked.");
    const check = screen.getByRole("button", { name: "Check storage status" }); check.focus();
    await act(async () => { fireEvent.click(check); });
    expect(screen.getByText("About 0 bytes")).toBeTruthy(); expect(screen.getByText("About 123 bytes")).toBeTruthy();
    expect(screen.getByText("The browser does not report persistent storage")).toBeTruthy(); expect(screen.getByText(/not a backup or a guarantee of offline availability or update readiness/)).toBeTruthy();
    const refresh = screen.getByRole("button", { name: "Refresh storage status" }); expect(document.activeElement).toBe(refresh);
    await act(async () => { fireEvent.click(refresh); }); expect(estimate).toHaveBeenCalledTimes(2); expect(persisted).toHaveBeenCalledTimes(2); expect(persist).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
    expect(runtime.updateReadiness.getSnapshot()).toBe(readiness);
    expect(screen.queryByRole("button", { name: /persist|delete|clear|install|reload|update now/i })).toBeNull();
  });
  it("keeps the explicit check keyboard-focusable while pending so a refresh can supersede it", async () => {
    const pending = deferred<object>(), runtime = fixture({ estimate: () => pending.promise, persisted: async () => false }); view(runtime);
    const check = screen.getByRole("button", { name: "Check storage status" }); check.focus();
    act(() => { fireEvent.click(check); });
    try { expect(check.hasAttribute("disabled")).toBe(false); expect(document.activeElement).toBe(check); }
    finally { await act(async () => { pending.resolve({ usage: 1, quota: 2 }); await pending.promise; }); }
  });
  it("shows unsupported, denied and failed facts without reporting zero bytes", async () => {
    const runtime = fixture({ estimate: async () => { throw new DOMException("private-generated", "SecurityError"); }, persisted: async () => { throw Error("private-generated"); } }); view(runtime);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check storage status" })); });
    expect(screen.getAllByText("The browser refused this query")).toHaveLength(2); expect(screen.getByText("The query failed")).toBeTruthy(); expect(screen.queryByText(/About 0 bytes/)).toBeNull(); expect(document.body.textContent).not.toContain("private-generated");
  });
  it("disposes on close and never publishes a delayed result into a reopened pane", async () => {
    const pending = deferred<object>(), estimate = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ usage: 7, quota: 9 });
    const runtime = fixture({ estimate, persisted: async () => true }); view(runtime);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Check storage status" })); }); expect(screen.getByRole("status").textContent).toContain("Checking");
    act(() => runtime.systemUI.preferences.close());
    await act(async () => { pending.resolve({ usage: 111, quota: 222 }); await pending.promise; });
    act(() => runtime.systemUI.preferences.open("storage"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Storage has not been checked."));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check storage status" })); });
    expect(screen.getByText("About 7 bytes")).toBeTruthy(); expect(screen.queryByText("About 111 bytes")).toBeNull();
  });
  it("fences overlapping refreshes by generation and discards a superseded completion", async () => {
    const first = deferred<object>(), second = deferred<object>(), estimate = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const runtime = fixture({ estimate, persisted: async () => true }); runtime.systemUI.preferences.open("storage");
    const controller = new StorageDiagnosticsController(runtime); const a = controller.refresh(), b = controller.refresh();
    second.resolve({ usage: 5, quota: 6 }); await b; first.resolve({ usage: 111, quota: 222 }); await a;
    expect(controller.getSnapshot()).toMatchObject({ state: "completed", generation: 2, observation: { estimate: { usageBytes: 5, quotaBytes: 6 } } });
    controller.dispose(); expect(controller.getSnapshot()).toMatchObject({ state: "ended", observation: null });
  });
  it.each(["account", "window", "runtime", "explicit"])("clears settled/pending observations on %s owner disposal and cannot refresh the retired controller", async mode => {
    const pending = deferred<object>(), estimate = vi.fn(() => pending.promise), runtime = fixture({ estimate, persisted: async () => false });
    unlockRuntime(runtime); await runtime.identity.session.refresh(); runtime.systemUI.preferences.open("storage"); const controller = new StorageDiagnosticsController(runtime), changes = vi.fn(); controller.subscribe(changes);
    const request = controller.refresh();
    if (mode === "account") await runtime.identity.session.end({ reason: "Generated account transition" });
    else if (mode === "window") runtime.systemUI.preferences.close();
    else if (mode === "runtime") await runtime.dispose();
    else controller.dispose();
    await request; expect(controller.getSnapshot()).toMatchObject({ state: "ended", observation: null }); const ended = controller.getSnapshot(), count = changes.mock.calls.length;
    pending.resolve({ usage: 111, quota: 222 }); await Promise.resolve(); await Promise.resolve();
    await controller.refresh(); expect(controller.getSnapshot()).toBe(ended); expect(changes).toHaveBeenCalledTimes(count); expect(estimate).toHaveBeenCalledOnce();
  });
});
