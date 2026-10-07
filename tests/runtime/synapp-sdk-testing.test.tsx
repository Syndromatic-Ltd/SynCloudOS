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
import { expect, it, vi } from "vitest";
import { defineSynWareServiceToken, createSynWare, useSynWare, useSynWareCommands } from "../../src/SynCloudOS/AppSDK";
import {
  createDeniedFakeServiceClient,
  createDeterministicScheduler,
  createFakeClipboardAdapter,
  createSynWareTestHost,
} from "../../src/SynCloudOS/AppSDK/testing";

const ExampleApp = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.syndromatic.testing-example",
    version: "1.0.0",
    title: "Testing Example",
    routes: [{ path: "/testing-example", primary: true }],
  },
  root() {
    useSynWareCommands([{ id: "com.syndromatic.testing-example.refresh", title: "Refresh", execute: () => undefined }]);
    return <button type="button">New document</button>;
  },
});

const MountedControlApp = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.syndromatic.testing-controls",
    version: "1.0.0",
    title: "Testing Controls",
    routes: [{ path: "/testing-controls", primary: true }],
    services: [{ id: "webspring.runtime", required: false }],
  },
  root() {
    const { services, pasteboards, drag, documents } = useSynWare();
    const [result, setResult] = React.useState("idle");
    const run = (label: string, action: () => void | Promise<void>) => {
      void Promise.resolve().then(action).then(
        () => setResult(`${label}:ok`),
        (error: unknown) => setResult(`${label}:${error instanceof DOMException ? error.name : "error"}`),
      );
    };
    return (
      <>
        <button type="button" onClick={() => run("clipboard", async () => { await pasteboards.system.write([{ type: "text/plain", value: "Control" }]); })}>Copy</button>
        <button type="button" onClick={() => run("documents", () => { documents.workspaceDocuments.getDocument("missing-document"); })}>Inspect document</button>
        <button type="button" onClick={() => run("drag", () => { drag.endpoint(); })}>Create drag endpoint</button>
        <button type="button" onClick={() => run("services", () => { services.optional(defineSynWareServiceToken({ id: "webspring.runtime" })); })}>Resolve service</button>
        <output role="status" aria-live="polite">{result}</output>
      </>
    );
  },
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function flushControlResult() {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

it("boots an app against deterministic adapters and exposes only harness controls", async () => {
  const host = createSynWareTestHost({
    app: ExampleApp,
    permissions: ["clipboard.read", "documents.write"],
    document,
  });
  const view = await host.render();

  expect(view.getByRole("button", { name: "New document" })).toBeTruthy();
  await host.lifecycle.launch();
  expect(host.appContext).not.toHaveProperty("runtime");
  expect(host.adapters.clipboard.calls()).toEqual([]);

  await host.dispose();
  expect(host.resources.active()).toEqual([]);
});

it("renders through the real physical-window host when requested", async () => {
  const host = createSynWareTestHost({
    app: ExampleApp,
    document,
    surface: "window",
  });
  const view = await host.render();

  expect(view.getByRole("button", { name: "New document" })).toBeTruthy();
  expect(view.container.querySelector("[data-window-host]")).toBeTruthy();
  await host.dispose();
});

it("fences an already-ready production render when disposal begins before the React root mounts", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const host = createSynWareTestHost({ app: ExampleApp, document, container });
  const rendering = host.render();
  const disposal = host.dispose();

  await expect(rendering).rejects.toThrow(/disposed|abort|revoked/i);
  await disposal;
  expect(container.querySelector("button")).toBeNull();
  container.remove();
});

it("does not mount a late React root after a delayed real loader is disposed", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const gate = deferred<void>();
  let loadStarted = false;
  const host = createSynWareTestHost({
    app: ExampleApp,
    document,
    container,
    loadGate: () => {
      loadStarted = true;
      return gate.promise;
    },
  });
  const rendering = host.render();
  await vi.waitFor(() => expect(loadStarted).toBe(true));
  const disposal = host.dispose();
  await expect(disposal).resolves.toMatchObject({ runtimeDisposed: true });
  gate.resolve();

  await expect(rendering).rejects.toThrow(/disposed|abort|revoked/i);
  expect(container.querySelector("button")).toBeNull();
  container.remove();
});

it("gates mounted public SDK operations through real deterministic adapters", async () => {
  const host = createSynWareTestHost({
    app: MountedControlApp,
    // The system pasteboard crosses the runtime boundary, so it is governed by
    // the canonical transfer capability rather than an out-of-band test-only
    // clipboard entitlement.
    permissions: ["app.open.public", "transfer.cross-application"],
    document,
  });
  const view = await host.render();

  expect(host.adapters).toMatchObject({
    browser: expect.objectContaining({ mode: "allow" }),
    media: expect.objectContaining({ mode: "allow" }),
    viewport: expect.objectContaining({ mode: "allow" }),
    navigation: expect.objectContaining({ mode: "deny" }),
    storage: expect.objectContaining({
      local: expect.objectContaining({ mode: "deny" }),
      session: expect.objectContaining({ mode: "deny" }),
    }),
    clipboard: expect.objectContaining({ mode: "deny" }),
    drag: expect.objectContaining({ mode: "deny" }),
    credentials: expect.objectContaining({ mode: "deny" }),
    files: expect.objectContaining({ mode: "deny" }),
    documents: expect.objectContaining({ mode: "deny" }),
    recovery: expect.objectContaining({ mode: "deny" }),
    windows: expect.objectContaining({ mode: "allow" }),
    panels: expect.objectContaining({ mode: "allow" }),
    overlays: expect.objectContaining({ mode: "allow" }),
    workspace: expect.objectContaining({ mode: "allow" }),
    services: expect.objectContaining({ mode: "deny" }),
    permissions: expect.objectContaining({ mode: "deny" }),
    policy: expect.objectContaining({ mode: "deny" }),
    image: expect.objectContaining({ mode: "deny" }),
    text: expect.objectContaining({ mode: "allow" }),
    animation: expect.objectContaining({ mode: "allow" }),
    audio: expect.objectContaining({ mode: "deny" }),
    webContent: expect.objectContaining({ mode: "deny" }),
  });

  expect(() => host.appContext.navigation.openRoute("/testing-controls")).toThrowError(DOMException);
  expect(host.adapters.navigation.calls()).toEqual([expect.objectContaining({ operation: "navigation.navigate" })]);

  view.getByRole("button", { name: "Copy" }).click();
  await flushControlResult();
  expect(view.getByRole("status").textContent).toBe("clipboard:SecurityError");
  expect(host.adapters.clipboard.calls()).toEqual([expect.objectContaining({ operation: "clipboard.write" })]);
  host.adapters.clipboard.allow();
  view.getByRole("button", { name: "Copy" }).click();
  await flushControlResult();
  expect(view.getByRole("status").textContent).toBe("clipboard:ok");
  expect(host.adapters.clipboard.values()).toEqual([{ type: "text/plain" }]);

  host.adapters.workspace.deny();
  view.getByRole("button", { name: "Inspect document" }).click();
  await flushControlResult();
  expect(view.getByRole("status").textContent).toBe("documents:SecurityError");
  expect(host.adapters.workspace.calls()).toEqual([expect.objectContaining({ operation: "workspace.switch" })]);
  host.adapters.workspace.allow();
  view.getByRole("button", { name: "Inspect document" }).click();
  await flushControlResult();
  expect(view.getByRole("status").textContent).toBe("documents:ok");

  await expect(host.adapters.documents.run("document.read")).rejects.toMatchObject({ name: "SecurityError" });
  host.adapters.documents.allow();
  await expect(host.adapters.documents.run("document.read")).resolves.toBeUndefined();
  expect(host.adapters.documents.calls()).toEqual([
    expect.objectContaining({ operation: "document.read" }),
    expect.objectContaining({ operation: "document.read" }),
  ]);
  await expect(host.adapters.files.run("file.read")).rejects.toMatchObject({ name: "SecurityError" });
  host.adapters.files.allow();
  await expect(host.adapters.files.run("file.read")).resolves.toBeUndefined();

  view.getByRole("button", { name: "Create drag endpoint" }).click();
  await flushControlResult();
  expect(view.getByRole("status").textContent).toBe("drag:SecurityError");
  host.adapters.drag.allow();
  view.getByRole("button", { name: "Create drag endpoint" }).click();
  await flushControlResult();
  expect(view.getByRole("status").textContent).toBe("drag:ok");
  expect(host.adapters.drag.calls()).toEqual(expect.arrayContaining([expect.objectContaining({ operation: "drag.authorise" })]));

  view.getByRole("button", { name: "Resolve service" }).click();
  await flushControlResult();
  expect(view.getByRole("status").textContent).toBe("services:SecurityError");
  host.adapters.permissions.allow();
  host.adapters.policy.allow();
  host.adapters.services.allow();
  view.getByRole("button", { name: "Resolve service" }).click();
  await flushControlResult();
  expect(view.getByRole("status").textContent).toBe("services:ok");
  expect(host.adapters.policy.calls()).toEqual(expect.arrayContaining([expect.objectContaining({ operation: "policy.evaluate" })]));
  expect(host.adapters.services.calls()).toEqual([expect.objectContaining({ operation: "service.resolve" })]);

  host.adapters.navigation.interrupt("mounted navigation cancelled by test");
  expect(() => host.appContext.navigation.openRoute("/testing-controls")).toThrowError(DOMException);

  host.adapters.navigation.fail(new Error("mounted navigation backend unavailable"));
  expect(() => host.appContext.navigation.openRoute("/testing-controls")).toThrow("mounted navigation backend unavailable");

  host.adapters.navigation.allow();
  const route = host.appContext.navigation.openRoute("/testing-controls") as { readonly result: Promise<unknown> };
  await expect(route.result).resolves.toBeDefined();
  expect(host.adapters.navigation.calls()).toEqual(expect.arrayContaining([
    expect.objectContaining({ operation: "navigation.navigate" }),
  ]));

  await host.dispose();
});

it("reports deliberate resource leaks after the disposal graph and cleans them idempotently", async () => {
  const host = createSynWareTestHost({ app: ExampleApp, document });
  const lease = host.resources.acquire("web-content request");

  expect(host.resources.active()).toEqual(expect.arrayContaining([
    expect.stringContaining("test-resource:web-content-request"),
  ]));
  const report = await host.dispose();
  expect(report.remaining).toEqual(expect.arrayContaining([
    expect.stringContaining("test-resource:web-content-request"),
  ]));
  expect(report.leaked).toEqual(report.remaining);
  expect(report.runtimeDisposed).toBe(true);
  expect(await host.dispose()).toBe(report);
  expect(host.resources.active()).toEqual([]);
  expect(() => lease.release()).not.toThrow();
});

it("runs two hosts without shared commands, preferences or clocks", async () => {
  const first = createSynWareTestHost({ app: ExampleApp, now: "2026-01-01T00:00:00Z", document });
  const second = createSynWareTestHost({ app: ExampleApp, now: "2030-01-01T00:00:00Z", document });

  first.persistence.setPreference("mode", "first");
  expect(second.persistence.getPreference("mode")).toBeUndefined();
  expect(first.clock.now()).not.toEqual(second.clock.now());
  await first.render();
  expect(first.commands.inspect()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "com.syndromatic.testing-example.refresh" }),
  ]));
  expect(second.commands.inspect()).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "com.syndromatic.testing-example.refresh" }),
  ]));
  await second.render();

  await first.dispose();
  expect(second.commands.inspect()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "com.syndromatic.testing-example.refresh" }),
  ]));
  await second.dispose();
});

it("supports StrictMode and HMR-style remount without retaining registrations", async () => {
  const host = createSynWareTestHost({ app: ExampleApp, strictMode: true, document });
  const first = await host.render();
  expect(host.commands.inspect().filter(({ id }) => id === "com.syndromatic.testing-example.refresh")).toHaveLength(1);

  first.unmount();
  expect(host.commands.inspect().filter(({ id }) => id === "com.syndromatic.testing-example.refresh")).toHaveLength(0);

  await host.render();
  expect(host.commands.inspect().filter(({ id }) => id === "com.syndromatic.testing-example.refresh")).toHaveLength(1);
  await host.dispose();
});

it("requires explicit fake capability admission and records interrupted calls", async () => {
  const clock = createDeterministicScheduler("2026-01-01T00:00:00Z");
  const clipboard = createFakeClipboardAdapter(clock);
  const services = createDeniedFakeServiceClient();
  expect(services).not.toHaveProperty("resolve");
  expect(() => services.require(defineSynWareServiceToken({ id: "example.private" }))).toThrow();

  await expect(clipboard.adapter.read(["text/plain"])).rejects.toMatchObject({ name: "SecurityError" });
  clipboard.control.allow();
  await clipboard.adapter.write([{ type: "text/plain", value: "Hello" }]);
  expect(clipboard.control.values()).toEqual([{ type: "text/plain" }]);
  clipboard.control.interrupt();
  await expect(clipboard.adapter.read(["text/plain"])).rejects.toMatchObject({ name: "AbortError" });
  expect(clipboard.control.calls().map(({ operation }) => operation)).toEqual([
    "clipboard.read",
    "clipboard.write",
    "clipboard.read",
  ]);
  expect(services.optional(defineSynWareServiceToken({ id: "example.private" }))).toEqual(expect.objectContaining({
    available: false,
    client: null,
    denial: expect.objectContaining({ code: "unavailable" }),
  }));
  clock.dispose();
});
