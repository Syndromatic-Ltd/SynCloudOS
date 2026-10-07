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
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNSEAnimationEnvironment } from "../../src/NSE/Animation";
import { createBrowserAnimationLayerHost } from "../../src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerHost";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  cleanup(); vi.restoreAllMocks();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("layer ownership cleanup");
});

it("keeps shell rendering live when an app mount revokes its own renderer", async () => {
  // jsdom has no canvas backend, including the renderer's transient stage.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((kind: string) => kind === "2d"
    ? { clearRect() {}, save() {}, restore() {}, setTransform() {}, drawImage() {} }
    : null) as HTMLCanvasElement["getContext"]);
  const host = createBrowserAnimationLayerHost(document, {
    now: () => 0, requestFrame: () => () => {}, reducedMotion: true, suspended: false,
  });
  const runtime = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), animationLayers: host } });
  runtimes.push(runtime);
  registerTestSynWare(runtime, { schemaVersion: 1, id: "layer-probe", version: "1.0.0", title: "Layer Probe", routes: [{ path: "/layer-probe", primary: true }] });
  const app = runtime.apps.getApp("layer-probe")!;
  const seen = new Map<string, ReturnType<typeof useNSEAnimationEnvironment>>();
  function Probe({ owner }: { owner: string }) { seen.set(owner, useNSEAnimationEnvironment()); return null; }
  const branding = { name: "Layer tests", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null };
  const tree = (mounted: boolean) => <SynCloudOSProvider runtime={runtime}><HostSiteBrandingProvider value={branding}>
    <Probe owner="shell" />
    {mounted && <SynWareRuntimeMount runtime={runtime} app={app} responderId={`application:${app.id}`}><Probe owner="app" /></SynWareRuntimeMount>}
  </HostSiteBrandingProvider></SynCloudOSProvider>;
  const view = render(tree(true));
  const renderer = (owner: string) => {
    const canvas = document.createElement("canvas");
    return seen.get(owner)!.layers!.createRenderer(canvas);
  };
  const shell = renderer("shell"), mounted = renderer("app");
  expect(seen.get("shell")!.layers).not.toBe(seen.get("app")!.layers);
  view.rerender(tree(false));
  await act(async () => { await Promise.resolve(); });
  expect(mounted.disposed).toBe(true);
  expect(shell.disposed).toBe(false);
  expect(() => seen.get("app")!.layers!.createRenderer(document.createElement("canvas"))).toThrow();
  expect(() => shell.render()).not.toThrow();
  await act(async () => { await runtime.dispose("runtime revocation"); });
  expect(shell.disposed).toBe(true);
});
