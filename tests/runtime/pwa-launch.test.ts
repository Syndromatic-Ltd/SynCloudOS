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

import { expect, it, vi } from "vitest";
import { installedApplicationRoute, routeInstalledApplicationLaunch } from "../../src/SynCloudOS/InstalledApplications/installedApplicationLaunch";
import { createInstalledApplicationRuntimePort } from "../../src/SynCloudOS/InstalledApplications/installedApplicationRuntimePort";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
const info = { schemaVersion: 1 as const, bundleIdentifier: "com.example.notes", displayName: "Notes", version: "1", routes: [{ path: "/notes" }], documentTypes: [{ id: "com.example.note", extensions: ["note"], mimeTypes: ["application/x-note"] }], urlTypes: [{ name: "Note", schemes: ["web+note"] }], linkCapture: { paths: ["/notes"] } };
it("launches the declared application before opening file contents through the document controller", async () => {
  const calls: string[] = [];
  const file = new File(["hello"], "hello.note", { type: "application/x-note" });
  const openDocument = vi.fn(async () => { calls.push("document"); });
  await routeInstalledApplicationLaunch({ targetURL: "https://site.test/notes", files: [{ getFile: async () => file }] }, [info], {
    origin: "https://site.test", base: "/", signal: new AbortController().signal,
    launch: async () => { calls.push("launch"); }, openDocument, openURLs: vi.fn(),
  });
  expect(calls).toEqual(["launch", "document"]);
  expect(openDocument).toHaveBeenCalledWith(expect.objectContaining({ typeId: "com.example.note", withContentsOf: file, applicationId: "com.example.notes" }));
});
it("routes only declared protocols to the application delegate", async () => {
  const openURLs = vi.fn();
  const port = { origin: "https://site.test", base: "/", signal: new AbortController().signal, launch: vi.fn(), openDocument: vi.fn(), openURLs };
  await routeInstalledApplicationLaunch({ targetURL: "https://site.test/notes?scos-protocol=web%2Bnote%3Ahello" }, [info], port);
  expect(openURLs.mock.calls[0][1][0].href).toBe("web+note:hello");
  await expect(routeInstalledApplicationLaunch({ targetURL: "https://site.test/notes?scos-protocol=javascript%3Aalert(1)" }, [info], port)).rejects.toThrow(/protocol/);
});
it("rejects unowned URLs and ambiguous file associations instead of guessing an application", async () => {
  const port = { origin: "https://site.test", base: "/", signal: new AbortController().signal, launch: vi.fn(), openDocument: vi.fn(), openURLs: vi.fn() };
  await expect(routeInstalledApplicationLaunch({ targetURL: "https://other.test/notes" }, [info], port)).rejects.toThrow(/origin/);
  await expect(routeInstalledApplicationLaunch({ targetURL: "https://site.test/outside/notes" }, [info], { ...port, base: "/product/" })).rejects.toThrow(/deployment/);
});
it("chooses the longest matching route rather than an unrelated route on another app", async () => {
  const launch = vi.fn(), openURLs = vi.fn();
  const apps = [{ ...info, routes: [{ path: "/notes" }, { path: "/unrelated/very/long/route" }] }, { ...info, bundleIdentifier: "editor", routes: [{ path: "/notes/editor" }], linkCapture: { paths: ["/notes/editor"] } }];
  await routeInstalledApplicationLaunch({ targetURL: "https://site.test/notes/editor" }, apps, { origin: "https://site.test", base: "/", signal: new AbortController().signal, launch, openURLs, openDocument: vi.fn() });
  expect(launch).toHaveBeenCalledWith("editor", "/notes/editor");
});
it("waits for the real route operation result and refuses an unmounted receiver", async () => {
  let resolve!: (value: unknown) => void;
  const result = new Promise(complete => { resolve = complete; });
  const runtime = { runtimeId: "pwa-launch-operation", signal: new AbortController().signal, routes: { openRoute: () => ({ result }) } } as unknown as SynCloudOSRuntime;
  const port = createInstalledApplicationRuntimePort(runtime, "https://site.test", "/");
  let settled = false;
  const pending = port.launch("com.example.notes", "/notes").then(() => { settled = true; });
  await Promise.resolve(); expect(settled).toBe(false);
  resolve({ status: "completed", value: { kind: "app", appId: "com.example.notes" } });
  await pending; expect(settled).toBe(true);
  await expect(port.openURLs("com.example.notes", [new URL("https://site.test/notes")], { sharedItems: { files: [] } })).rejects.toThrow(/receiver|application/);
});
it("consumes fixed launch envelopes before typed-query routing and retains normal app query fields", () => {
  expect(installedApplicationRoute("/notes?mode=edit&scos-share=one&scos-action=reply", [info])).toBe("/notes?mode=edit");
  const share = { ...info, shareTarget: { action: "/notes/share", method: "GET" as const, params: { text: "sharedText" } } };
  expect(installedApplicationRoute("/notes/share?sharedText=hello&mode=edit", [share])).toBe("/notes/share?mode=edit");
  expect(installedApplicationRoute("/notes?sharedText=keep", [share])).toBe("/notes?sharedText=keep");
});
