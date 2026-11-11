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
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createSynWare } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";
import { createSynWareTesting } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTesting";
import type { SynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/testHostTypes";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}
const hosts: SynWareTestHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });
function app(root: () => React.ReactNode = () => <button>Ready</button>) {
  return createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "com.example.settlement.host", displayName: "Settlement Host", version: "1.0.0",
    routes: [{ path: "/settlement-host", primary: true }] }, root });
}

describe("actual test-host finite settlement", () => {
  it("holds settlement during the real host definition load without advancing its application clock", async () => {
    const entered = deferred<void>(); const load = deferred<void>();
    const host = createSynWareTestHost({ app: app(), document, loadGate: () => { entered.resolve(); return load.promise; } });
    hosts.push(host);
    const testing = createSynWareTesting(host);
    const rendering = host.render(); await entered.promise;
    const now = host.clock.now();
    const pending = testing.getSettledState().pending;
    expect(pending).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: "test-host", kind: "lazy-load" }),
      expect.objectContaining({ owner: "test-host", kind: "render" }),
    ]));
    let done = false; const settled = testing.settled().then(result => { done = true; return result; });
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(done).toBe(false); expect(host.clock.now()).toBe(now);
    load.resolve(); const view = await rendering;
    await expect(settled).resolves.toMatchObject({ status: "settled" });
    expect(view.getByRole("button", { name: "Ready" })).toBeTruthy();
    testing.dispose();
  });

  it("acknowledges actual React layout commitment before removing host render work", async () => {
    let host!: SynWareTestHost;
    let pendingAtCommit = false;
    const commit = deferred<void>();
    host = createSynWareTestHost({ document, strictMode: true, app: app(() => {
      React.useLayoutEffect(() => {
        pendingAtCommit = host.settlement.getState().pending.some(item => item.owner === "test-host" && item.kind === "render");
        commit.resolve();
      }, []);
      return <button>Committed root</button>;
    }) });
    hosts.push(host);
    const rendered = host.render(); await commit.promise;
    expect(pendingAtCommit).toBe(true);
    await rendered;
    expect(host.settlement.getState().pending.filter(item => item.owner === "test-host")).toEqual([]);
    expect(host.settlement.getState().recent.filter(item => item.owner === "test-host" && item.kind === "render")).toHaveLength(1);
  });

  it("releases deferred NSE disposal resources before reporting host leaks", async () => {
    const host = createSynWareTestHost({ app: app(), document }); hosts.push(host);
    await host.render();
    const report = await host.dispose();
    expect(report.remaining).toEqual([]);
  });

  it("drives visits through host route authority while app navigation remains denied", async () => {
    const host = createSynWareTestHost({ app: app(), document }); hosts.push(host);
    const testing = createSynWareTesting(host);
    await host.render();
    expect(host.adapters.navigation.mode).toBe("deny");
    await expect(testing.visit("/settlement-host")).resolves.toMatchObject({
      navigation: { status: "completed" },
      settlement: { status: "settled" },
    });
    expect(host.adapters.navigation.calls()).toEqual([]);
    testing.dispose();
  });

  it("captures the forgotten waiter before teardown cancels it and releases its watchdog", async () => {
    const host = createSynWareTestHost({ app: app(), document }); hosts.push(host);
    const testing = createSynWareTesting(host);
    const forgotten = testing.waiter("editor autosave response");
    const finished = testing.waiter("finished import"); finished.end();
    const report = await host.dispose();
    expect(report.leaked).toEqual([expect.stringContaining("editor autosave response")]);
    expect(report.leaked[0]).toContain(forgotten.id);
    expect(report.leaked.join(" ")).not.toContain("finished import");
    expect(report.remaining).toEqual([]);
    expect(host.settlement.getState()).toMatchObject({ disposed: true, pending: [] });
    expect(forgotten.end()).toBe(false); testing.dispose();
  });
});
