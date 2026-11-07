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
import { routeInstalledApplicationLaunch } from "../../src/SynCloudOS/InstalledApplications/installedApplicationLaunch";
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
});
