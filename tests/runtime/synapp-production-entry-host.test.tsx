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
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { useSCOS } from "../../src/SynCloudOS/AppSDK/scos/useSCOS"
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { HostSiteBrandingProvider } from "../../src/SynCloudOSReact";
import { SynWareEntryRenderer } from "../../src/Webspring/SynWareEntryRenderer";
import { createTestRuntime } from "./helpers";

function definition(id: string, root = () => null) {
  return createSynWare({
    manifest: {
      schemaVersion: 1,
      id,
      version: "1.0.0",
      title: id,
      routes: [{ path: `/${id}`, primary: true }],
    },
    root,
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("production SynWare definition entries", () => {

  it("loads a captured definition without evaluating its callable root", async () => {
    const root = vi.fn(() => null);
    const app = definition("com.syndromatic.definition-entry", root);
    const runtime = createTestRuntime({ id: "runtime:definition-entry" });
    runtime.apps.register({
      ...createSynWareBundle(app),
      loadModule: async () => ({ default: app }),
    });

    const loaded = await runtime.bundles.loadBundle(app.manifest.id);

    expect(loaded.definition).toBe(app);
    expect(root).not.toHaveBeenCalled();
  });

  it("builds a component default from the registered manifest without rendering it during loading", async () => {
    const app = definition("com.syndromatic.component-default");
    const runtime = createTestRuntime({ id: "runtime:component-default" });
    const component = vi.fn(() => <p>Notes</p>);
    try {
      runtime.apps.register({
        ...createSynWareBundle(app),
        loadModule: async () => ({ default: component }),
      });
      const loaded = await runtime.bundles.loadBundle(app.manifest.id);
      expect(loaded.definition?.manifest).toEqual(app.manifest);
      expect(loaded.definition?.root).toBeTypeOf("function");
      expect(component).not.toHaveBeenCalled();
    } finally { await runtime.dispose("test"); }
  });

  it("rejects a non-enumerable module default before inspecting a definition", async () => {
    const app = definition("com.syndromatic.hidden-definition-default");
    const runtime = createTestRuntime({ id: "runtime:hidden-definition-default" });
    const hiddenDefault = Object.defineProperty({}, "default", {
      configurable: true,
      enumerable: false,
      value: app,
    });
    runtime.apps.register({
      ...createSynWareBundle(app),
      loadModule: async () => hiddenDefault as never,
    });

    await expect(runtime.bundles.loadBundle(app.manifest.id)).rejects.toMatchObject({
      code: "BUNDLE_INVALID_MODULE",
    });
  });

  it("rejects a lazy definition whose canonical V1 manifest does not match its registration", async () => {
    const registered = definition("com.syndromatic.registered-entry");
    const imported = definition("com.syndromatic.imported-entry");
    const runtime = createTestRuntime({ id: "runtime:manifest-mismatch" });
    runtime.apps.register({
      ...createSynWareBundle(registered),
      loadModule: async () => ({ default: imported }),
    });

    await expect(runtime.bundles.loadBundle(registered.manifest.id)).rejects.toMatchObject({
      code: "BUNDLE_INVALID_MODULE",
      message: expect.stringMatching(/\/id/u),
    });
  });

  it("accepts semantically equal lazy manifests regardless of object key order", async () => {
    const registered = createSynWare({
      manifest: {
        schemaVersion: 1,
        id: "com.syndromatic.semantic-entry",
        version: "1.0.0",
        title: "Semantic entry",
        routes: [{ path: "/semantic-entry", primary: true }],
      },
      root: () => null,
    });
    const imported = createSynWare({
      manifest: {
        routes: [{ primary: true, path: "/semantic-entry" }],
        title: "Semantic entry",
        version: "1.0.0",
        id: "com.syndromatic.semantic-entry",
        schemaVersion: 1,
      },
      root: () => null,
    });
    const runtime = createTestRuntime({ id: "runtime:semantic-entry" });
    runtime.apps.register({
      ...createSynWareBundle(registered),
      loadModule: async () => ({ default: imported }),
    });

    await expect(runtime.bundles.loadBundle(registered.manifest.id)).resolves.toMatchObject({
      definition: imported,
    });
  });

  it("runs definition migrations before declared background tasks through the real loader", async () => {
    const order: string[] = [];
    const migration = {
      fromVersion: 1,
      toVersion: 2,
      migrate: vi.fn((value: unknown, context: { readonly signal: AbortSignal }) => {
        expect(context.signal.aborted).toBe(false);
        order.push("migration");
        return { migrated: value === undefined };
      }),
    };
    const handler = { handle: vi.fn(async (taskId: string, context: { readonly signal: AbortSignal }) => {
      expect(context.signal.aborted).toBe(false);
      order.push(`background:${taskId}`);
    }) };
    const createBackgroundHandler = vi.fn(() => handler);
    const app = createSynWare({
      manifest: {
        schemaVersion: 1,
        id: "com.syndromatic.definition-lifecycle",
        version: "1.0.0",
        title: "Definition lifecycle",
        routes: [{ path: "/definition-lifecycle", primary: true }],
        migrationVersion: 2,
        background: { enabled: true, tasks: ["com.syndromatic.definition-lifecycle.refresh"] },
      },
      root: () => null,
      migrations: [migration],
      createBackgroundHandler,
    });
    const runtime = createTestRuntime({ id: "runtime:definition-lifecycle" });
    runtime.apps.register({
      ...createSynWareBundle(app),
      loadModule: async () => ({ default: app }),
    });

    const loaded = await runtime.bundles.loadBundle(app.manifest.id);

    expect(loaded.definition).toBe(app);
    expect(migration.migrate).toHaveBeenCalledWith(undefined, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(createBackgroundHandler).toHaveBeenCalledTimes(1);
    expect(handler.handle).toHaveBeenCalledWith(
      "com.syndromatic.definition-lifecycle.refresh",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(order).toEqual(["migration", "background:com.syndromatic.definition-lifecycle.refresh"]);
  });

  it.each(["same-ID bundle replacement", "runtime disposal"])(
    "does not publish a definition when deferred lifecycle work is revoked by %s",
    async (revocation) => {
      const lifecycleGate = deferred<unknown>();
      let operationSignal: AbortSignal | undefined;
      const app = createSynWare({
        manifest: {
          schemaVersion: 1,
          id: `com.syndromatic.definition-lifecycle-revocation-${revocation.replace(/[^a-z]+/gu, "-")}`,
          version: "1.0.0",
          title: "Definition lifecycle revocation",
          routes: [{ path: "/definition-lifecycle-revocation", primary: true }],
          migrationVersion: 2,
        },
        root: () => null,
        migrations: [{
          fromVersion: 1,
          toVersion: 2,
          migrate: (_value, context) => {
            operationSignal = context.signal;
            return lifecycleGate.promise;
          },
        }],
      });
      const runtime = createTestRuntime({ id: `runtime:definition-lifecycle-revocation:${revocation}` });
      runtime.apps.register({
        ...createSynWareBundle(app),
        loadModule: async () => ({ default: app }),
      });

      const loading = runtime.bundles.loadBundle(app.manifest.id);
      await vi.waitFor(() => expect(operationSignal).toBeDefined());
      if (revocation === "same-ID bundle replacement") {
        runtime.apps.register({
          ...createSynWareBundle(app),
          loadModule: async () => ({ default: app }),
        });
      } else {
        await runtime.dispose("definition lifecycle test disposal");
      }
      expect(operationSignal?.aborted).toBe(true);
      lifecycleGate.resolve(undefined);

      await expect(loading).rejects.toThrow(/abort|revoked|changed|replaced|disposed/i);
      expect(runtime.bundles.getLoadedBundle(app.manifest.id)).toBeNull();
    },
  );

  it("renders a loaded definition through the shared provider-owned entry renderer", async () => {
    const app = definition("com.syndromatic.shared-entry-renderer", function Root() {
      return <output>{useSCOS().app.id}</output>;
    });
    const runtime = createTestRuntime({ id: "runtime:shared-entry-renderer" });
    runtime.apps.register({
      ...createSynWareBundle(app),
      loadModule: async () => ({ default: app }),
    });
    await runtime.bundles.loadBundle(app.manifest.id);
    const registered = runtime.apps.getApp(app.manifest.id);
    if (!registered) throw new Error("The test app did not register.");
    const container = document.createElement("div");
    const root = createRoot(container);
    const branding = { name: "Entry test host", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null };

    flushSync(() => root.render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={branding}>
        <SynWareEntryRenderer
          runtime={runtime}
          app={registered}
          responderId={`application:${registered.id}`}
          isLoading={false}
          loadingClassName="test-loading"
          loadingLabel="Loading"
          loadingPackageLabel="Loading package"
          missingComponentLabel="Missing"
        />
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    ));

    expect(container.querySelector("output")?.textContent).toBe(app.manifest.id);
    flushSync(() => root.unmount());
    await runtime.dispose("shared entry renderer test complete");
  });
});
