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
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { validateSynWareManifest } from "../../src/SynCloudOS/AppSDK/manifest/validateManifest";
import { createTestRuntime } from "./helpers";

const Root = () => null;

function routeBundle(
  id: string,
  routes: readonly Readonly<{ path: string; primary?: boolean; match?: "exact" | "prefix" }>[],
) {
  return createSynWareBundle(createSynWare({
    manifest: {
      schemaVersion: 1,
      bundleIdentifier: id,
      version: "1.0.0",
      displayName: id,
      routes,
      permissions: ["app.open.public"],
    },
    root: Root,
  }));
}

describe("Routing II static ownership", () => {
  it("validates exact/prefix claims and projects every static claim", () => {
    const validation = validateSynWareManifest({
      schemaVersion: 1,
      bundleIdentifier: "com.example.routing-claims",
      version: "1.0.0",
      displayName: "Routing claims",
      routes: [
        { path: "/music", primary: true, match: "prefix" },
        { path: "/listen", match: "exact" },
        { path: "/library" },
      ],
    });

    expect(validation).toMatchObject({ ok: true });
    const bundle = routeBundle("com.example.routing-claims", [
      { path: "/music", primary: true, match: "prefix" },
      { path: "/listen", match: "exact" },
      { path: "/library" },
    ]);

    expect(bundle.manifest.route).toBe("/music");
    expect(bundle.manifest.routeClaims).toEqual([
      { path: "/music", match: "prefix" },
      { path: "/listen", match: "exact" },
      { path: "/library", match: "exact" },
    ]);
  });

  it("matches prefix claims only on path-segment boundaries", () => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(routeBundle("com.example.music-owner", [
      { path: "/music", primary: true, match: "prefix" },
      { path: "/listen", match: "exact" },
    ]));

    expect(runtime.apps.getAppForRoute("/music")?.bundleIdentifier).toBe("com.example.music-owner");
    expect(runtime.apps.getAppForRoute("/music/artist/justice")?.bundleIdentifier).toBe("com.example.music-owner");
    expect(runtime.apps.getAppForRoute("/listen")?.bundleIdentifier).toBe("com.example.music-owner");
    expect(runtime.apps.getAppForRoute("/musicology")).toBeNull();
    expect(runtime.apps.getAppForRoute("/listen/artist")).toBeNull();

    expect(runtime.routes.resolveRoute("/music/artist/justice?view=albums#bio")).toMatchObject({
      kind: "app",
      app: { bundleIdentifier: "com.example.music-owner" },
      pathname: "/music/artist/justice",
    });
  });

  it("rejects overlapping foreign ownership atomically regardless of insertion order", () => {
    for (const reverse of [false, true]) {
      const runtime = createTestRuntime({ id: `runtime:route-owner-${reverse}` });
      const broad = routeBundle("com.example.music-broad", [{ path: "/music", primary: true, match: "prefix" }]);
      const nested = routeBundle("com.example.music-nested", [{ path: "/music/artist", primary: true, match: "exact" }]);
      const first = reverse ? nested : broad;
      const second = reverse ? broad : nested;

      expect(runtime.apps.registerBundle(first)?.bundleIdentifier).toBe(first.manifest.bundleIdentifier);
      expect(runtime.apps.registerBundle(second)).toBeNull();
      expect(runtime.apps.getAllApps()).toHaveLength(1);
      expect(runtime.apps.getAppForRoute("/music/artist")?.bundleIdentifier).toBe(first.manifest.bundleIdentifier);
      runtime.dispose();
    }
  });

  it("keeps adjacent paths independent and never evaluates bundle code during recognition", () => {
    const runtime = createTestRuntime();
    const loadModule = vi.fn(async () => ({ default: createSynWare({
      manifest: {
        schemaVersion: 1,
        bundleIdentifier: "com.example.music-loader",
        version: "1.0.0",
        displayName: "Music loader",
        routes: [{ path: "/music", primary: true, match: "prefix" }],
      },
      root: Root,
    }) }));
    const bundle = routeBundle("com.example.music-loader", [{ path: "/music", primary: true, match: "prefix" }]);
    runtime.apps.registerBundle(Object.freeze({ ...bundle, loadModule }));
    runtime.apps.registerBundle(routeBundle("com.example.musicology", [{ path: "/musicology", primary: true }]));

    expect(runtime.apps.getAppForRoute("/musicology")?.bundleIdentifier).toBe("com.example.musicology");
    expect(runtime.apps.getAppForRoute("/music/track/one")?.bundleIdentifier).toBe("com.example.music-loader");
    expect(loadModule).not.toHaveBeenCalled();
  });

  it("rejects a prefix claim for the reserved root", () => {
    const validation = validateSynWareManifest({
      schemaVersion: 1,
      bundleIdentifier: "com.example.root-owner",
      version: "1.0.0",
      displayName: "Root owner",
      routes: [{ path: "/", primary: true, match: "prefix" }],
    });

    expect(validation).toMatchObject({ ok: false });
  });
});
