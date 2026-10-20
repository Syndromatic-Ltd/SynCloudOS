// @vitest-environment jsdom
import React from "react";
import { act, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { action, useAction } from "../../src/SynCloudOS/AppSDK/actions";
import { createAppSCOS } from "../../src/SynCloudOS/AppSDK/scos/scosFacade";
import type { AppTrustedDiagnosticsClient } from "../../src/SynCloudOS/AppSDK/appTrustedClientTypes";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";
import type { SynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/testHostTypes";

const hosts: SynWareTestHost[] = [];
let sequence = 0;
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });

function fixture(diagnostics?: AppTrustedDiagnosticsClient, permissions: readonly string[] = ["diagnostics.view"]) {
  const id = `com.example.host-diagnostics-${++sequence}`;
  const scos = createAppSCOS(id);
  function View() {
    const refresh = useAction("refreshSnapshot");
    return <button disabled={!refresh.enabled} onClick={() => { void refresh.perform(); }}>Refresh diagnostics</button>;
  }
  class MainWindow extends NSEWindowController { static override view = View; }
  class Application extends NSEApplication {
    static override mainWindow = MainWindow;
    snapshot: unknown;
    get diagnostics() { return scos.trusted.diagnostics; }
    @action async refreshSnapshot() { this.snapshot = await scos.trusted.diagnostics!.refreshConformanceSnapshot(); }
    validateRefreshSnapshot() { return Boolean(scos.trusted.diagnostics); }
    exportSnapshot() { return scos.trusted.diagnostics!.exportConformanceSnapshot(this.snapshot); }
  }
  const host = createSynWareTestHost({
    application: Application,
    manifest: { schemaVersion: 1, bundleIdentifier: id, displayName: "Diagnostics provision", version: "1.0.0", permissions },
    diagnostics,
    document,
  });
  hosts.push(host);
  return { host, application: () => host.application as Application };
}

it("provides a real class application with diagnostics through its normal SCOS trusted boundary", async () => {
  const refreshConformanceSnapshot = vi.fn(async () => ({ revision: 1 }));
  const exportConformanceSnapshot = vi.fn((snapshot: unknown) => ({ snapshot }));
  const { host, application } = fixture({ refreshConformanceSnapshot, exportConformanceSnapshot });
  await host.render();
  await application().refreshSnapshot();
  expect(application().snapshot).toEqual({ revision: 1 });
  expect(refreshConformanceSnapshot).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  expect(application().exportSnapshot()).toEqual({ snapshot: { revision: 1 } });
  expect(exportConformanceSnapshot).toHaveBeenCalledWith({ revision: 1 });
  expect(Object.keys(application().diagnostics!)).toEqual(["refreshConformanceSnapshot", "exportConformanceSnapshot"]);
});

it("does not grant diagnostics when no provider is configured, but admits a later host provision", async () => {
  const { host, application } = fixture();
  await host.render();
  expect(application().diagnostics).toBeUndefined();
  const refreshConformanceSnapshot = vi.fn(async () => ({ revision: 2 }));
  await act(async () => { host.diagnostics.replace({ refreshConformanceSnapshot, exportConformanceSnapshot: value => value }); });
  await application().refreshSnapshot();
  expect(refreshConformanceSnapshot).toHaveBeenCalledOnce();
});

it("requires the real diagnostics.view declaration despite configured host provenance", async () => {
  const refreshConformanceSnapshot = vi.fn(async () => ({}));
  const { host, application } = fixture({ refreshConformanceSnapshot, exportConformanceSnapshot: value => value }, []);
  await host.render();
  expect(application().diagnostics).toBeUndefined();
  await expect(application().refreshSnapshot()).rejects.toThrow();
  expect(refreshConformanceSnapshot).not.toHaveBeenCalled();
  host.diagnostics.replace({ refreshConformanceSnapshot, exportConformanceSnapshot: value => value });
  expect(application().diagnostics).toBeUndefined();
});

it("revokes in-flight work and retained exports without falling back to runtime diagnostics", async () => {
  let providerSignal!: AbortSignal;
  const { promise: providerResult, resolve: complete } = Promise.withResolvers<unknown>();
  const exportConformanceSnapshot = vi.fn((value: unknown) => value);
  const { host, application } = fixture({
    refreshConformanceSnapshot: options => {
      providerSignal = options!.signal!;
      return providerResult;
    },
    exportConformanceSnapshot,
  });
  await host.render();
  const retained = application().diagnostics!;
  const pending = retained.refreshConformanceSnapshot();
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await act(async () => { host.diagnostics.revoke(); });
  expect(providerSignal.aborted).toBe(true);
  await rejected;
  complete({ stale: true });
  await Promise.resolve();
  expect(application().diagnostics).toBeUndefined();
  expect(() => retained.exportConformanceSnapshot({})).toThrowError(/revoked|replaced/i);
  await expect(retained.refreshConformanceSnapshot()).rejects.toThrowError(/revoked|replaced/i);
  expect(exportConformanceSnapshot).not.toHaveBeenCalled();
});

it("replaces provider authority, aborts old work, and routes later work to only the new provider", async () => {
  let providerSignal!: AbortSignal;
  const { promise: providerResult } = Promise.withResolvers<unknown>();
  const oldExport = vi.fn((value: unknown) => value);
  const { host, application } = fixture({
    refreshConformanceSnapshot: options => { providerSignal = options!.signal!; return providerResult; },
    exportConformanceSnapshot: oldExport,
  });
  await host.render();
  const retained = application().diagnostics!;
  const pending = retained.refreshConformanceSnapshot();
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const refreshConformanceSnapshot = vi.fn(async () => ({ revision: 3 }));
  await act(async () => { host.diagnostics.replace({ refreshConformanceSnapshot, exportConformanceSnapshot: value => value }); });
  expect(providerSignal.aborted).toBe(true);
  await rejected;
  expect(application().diagnostics).not.toBe(retained);
  expect(() => retained.exportConformanceSnapshot({})).toThrow();
  await expect(retained.refreshConformanceSnapshot()).rejects.toThrow();
  await application().refreshSnapshot();
  expect(application().snapshot).toEqual({ revision: 3 });
  expect(refreshConformanceSnapshot).toHaveBeenCalledOnce();
  expect(oldExport).not.toHaveBeenCalled();
});

it("preserves caller cancellation and refuses late results from a non-cooperative provider", async () => {
  let providerSignal!: AbortSignal;
  const { promise: providerResult, resolve: complete } = Promise.withResolvers<unknown>();
  const refreshConformanceSnapshot = vi.fn((options?: Readonly<{ signal?: AbortSignal }>) => {
    providerSignal = options!.signal!;
    return providerResult;
  });
  const { host, application } = fixture({ refreshConformanceSnapshot, exportConformanceSnapshot: value => value });
  await host.render();
  const caller = new AbortController();
  const pending = application().diagnostics!.refreshConformanceSnapshot({ signal: caller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  caller.abort();
  expect(providerSignal.aborted).toBe(true);
  await rejected;
  complete({ stale: true });
  await Promise.resolve();
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await expect(application().diagnostics!.refreshConformanceSnapshot({ signal: alreadyAborted.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(refreshConformanceSnapshot).toHaveBeenCalledOnce();
});

it("revalidates useAction availability on host replacement and revocation without an app hook bridge", async () => {
  const { host } = fixture();
  const view = await host.render();
  const button = view.getByRole("button", { name: "Refresh diagnostics" }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(true));
  await act(async () => { host.diagnostics.replace({ refreshConformanceSnapshot: async () => ({}), exportConformanceSnapshot: value => value }); });
  await waitFor(() => expect(button.disabled).toBe(false));
  await act(async () => { host.diagnostics.revoke(); });
  await waitFor(() => expect(button.disabled).toBe(true));
  await act(async () => { host.diagnostics.replace({ refreshConformanceSnapshot: async () => ({}), exportConformanceSnapshot: value => value }); });
  await waitFor(() => expect(button.disabled).toBe(false));
});
