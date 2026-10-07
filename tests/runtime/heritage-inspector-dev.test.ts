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
import { build } from "esbuild";
import * as entry from "../../src/SynCloudOS/Inspector/inspectorDevEntry";
import { createTestRuntime, registerTrustedTestSynWare } from "./helpers";
import diagnosticsManifest from "./diagnostics-fixture";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";

describe("heritage development boundary", () => {
  it("scopes Diagnostics translations, dictionary updates and locale revocation to the session", async () => {
    const runtime = createTestRuntime();
    registerTrustedTestSynWare(runtime, diagnosticsManifest, ["diagnostics"]);
    const mount = new AbortController();
    const inspector = (await entry.loadInspector({ enabled: true, runtime, appId: "diagnostics", mountSignal: mount.signal, now: () => 1 }))!;
    const changed = vi.fn(); const remove = inspector.localization.subscribe(changed);
    const original = inspector.localization.getSnapshot();
    runtime.locale.registerTranslations("synapps.diagnostics", "en-GB", { "inspector.title": "Translated Inspector" });
    expect(changed).toHaveBeenCalledOnce();
    expect(inspector.localization.getSnapshot().dictionaryVersion).toBeGreaterThan(original.dictionaryVersion);
    expect(inspector.localization.t("inspector.title", "Fallback")).toBe("Translated Inspector");
    expect(inspector.localization.t("inspector.absent", "{count} records", { count: 3 })).toBe("3 records");
    runtime.locale.setLocale("fr-FR");
    expect(inspector.localization.getSnapshot().locale).toBe("fr-FR");
    mount.abort(); const notifications = changed.mock.calls.length;
    expect(() => inspector.localization.getSnapshot()).toThrow(/revoked/i);
    expect(() => inspector.localization.t("inspector.title", "Fallback")).toThrow(/revoked/i);
    expect(() => inspector.localization.subscribe(changed)).toThrow(/revoked/i);
    runtime.locale.setLocale("en-GB"); expect(changed).toHaveBeenCalledTimes(notifications);
    remove(); inspector.dispose(); await runtime.dispose();
  });
  it("excludes the lazy Inspector graph and CSS from the production host region", async () => {
    const compile = (dev: boolean) => build({ entryPoints: ["src/SynCloudOSReact/DevInspectorRegion.tsx"],
      bundle: true, write: false, metafile: true, format: "esm", platform: "browser", minifySyntax: true,
      external: ["react", "react/jsx-runtime", "../../NSE/*"], loader: { ".css": "empty" }, define: { "import.meta.env.DEV": String(dev) } });
    const development = await compile(true); const production = await compile(false);
    expect(Object.keys(development.metafile!.inputs).some(path => path.endsWith("InspectorView.tsx"))).toBe(true);
    expect(Object.keys(development.metafile!.inputs).some(path => path.endsWith("inspector.css"))).toBe(true);
    expect(Object.keys(production.metafile!.inputs).filter(path => path.includes("/Inspector/"))).toEqual([]);
    expect(production.outputFiles![0].text).not.toMatch(/inspectorDevEntry|InspectorView|syncloudos-inspector|loadInspector/);
  });
  it("has a development-only lazy host entry", () => {
    expect(entry.loadInspector).toBeTypeOf("function");
  });
  it("denies ordinary apps and revokes retained readers, listeners and exports with the mount", async () => {
    const runtime = createTestRuntime();
    const mount = new AbortController();
    const options = { enabled: true, runtime, appId: "diagnostics", mountSignal: mount.signal, now: () => 1 };
    expect(await entry.loadInspector({ ...options, enabled: false })).toBeNull();
    await expect(entry.loadInspector(options)).rejects.toThrow(/provenance/i);
    registerTrustedTestSynWare(runtime, diagnosticsManifest, ["diagnostics"]);
    const inspector = (await entry.loadInspector(options))!;
    const snapshot = inspector.client.getSnapshot();
    expect(Object.keys(inspector.client).sort()).toEqual(["exportSnapshot", "getEvents", "getPage", "getSnapshot", "pause", "resume", "subscribe"].sort());
    expect(JSON.stringify(snapshot)).not.toContain(runtime.runtimeId);
    mount.abort();
    expect(() => inspector.client.getSnapshot()).toThrow(/revoked|disposed/i);
    expect(() => inspector.client.exportSnapshot(snapshot)).toThrow(/revoked|disposed/i);
    expect(() => inspector.client.subscribe(() => {})).toThrow(/revoked|disposed/i);
    inspector.dispose();
    await runtime.dispose();
  });
  it("removes the bridge and UI from the production import graph without a package rebuild", async () => {
    const compile = (dev: boolean) => build({ entryPoints: ["src/SynCloudOS/Inspector/inspectorDevEntry.ts"],
      bundle: true, write: false, metafile: true, format: "esm", platform: "browser", minifySyntax: true,
      external: ["react", "react/jsx-runtime", "../../NSE/*"], loader: { ".css": "empty" }, define: { "import.meta.env.DEV": String(dev) } });
    const production = await compile(false);
    const development = await compile(true);
    const moduleGraph = (result: Awaited<ReturnType<typeof compile>>) => Object.keys(result.metafile!.inputs);
    expect(moduleGraph(development).some(path => path.endsWith("inspectorDevHost.ts"))).toBe(true);
    expect(moduleGraph(development).some(path => path.endsWith("InspectorView.tsx"))).toBe(true);
    expect(moduleGraph(production)).toEqual(["src/SynCloudOS/Inspector/inspectorDevEntry.ts"]);
    const compiled = await import(`data:text/javascript;base64,${Buffer.from(production.outputFiles![0].text).toString("base64")}`);
    expect(await compiled.loadInspector({ enabled: true })).toBeNull();
  });
  it("revokes an open inspector when trusted bundle provenance is removed", async () => {
    const runtime = createTestRuntime();
    registerTrustedTestSynWare(runtime, diagnosticsManifest, ["diagnostics"]);
    const inspector = (await entry.loadInspector({ enabled: true, runtime, appId: "diagnostics", mountSignal: new AbortController().signal, now: () => 1 }))!;
    const snapshot = inspector.client.getSnapshot();
    await runtime.apps.unregister("diagnostics");
    expect(() => inspector.client.getSnapshot()).toThrow(/revoked|provenance/i);
    expect(() => inspector.client.exportSnapshot(snapshot)).toThrow(/revoked|provenance/i);
    inspector.dispose(); await runtime.dispose();
  });
  it("reads the current canonical graph owner without inventing loader settlement", async () => {
    const runtime = createTestRuntime();
    registerTrustedTestSynWare(runtime, diagnosticsManifest, ["diagnostics"]);
    const graph = defineSynWareRoutes({ id: "music", routes: [{ name: "artist", path: ":artist", component: () => null }] }).bind("/music", "music");
    const route = graph.recognize("/music/SECRET_CURRENT_ARTIST");
    if (route.kind !== "match") throw Error("fixture mismatch");
    runtime.routes.routeGraph.commit({ graph, route });
    const inspector = (await entry.loadInspector({ enabled: true, runtime, appId: "diagnostics", mountSignal: new AbortController().signal, now: () => 1 }))!;
    expect(inspector.client.getPage("Routes").rows).toContainEqual(expect.objectContaining({ kind: "route", status: "committed", parameterCount: 1 }));
    expect(inspector.client.getPage("Routes").rows.some(row => row.kind === "loader" && row.status === "ready")).toBe(false);
    expect(inspector.client.getPage("Transitions").rows).toEqual([]);
    expect(inspector.client.getSnapshot().panels.find(panel => panel.id === "Documents")!.status).toBe("supported");
    expect(inspector.client.exportSnapshot(inspector.client.getSnapshot()).content).not.toContain("SECRET_CURRENT_ARTIST");
    inspector.dispose(); await runtime.dispose();
  });
});
