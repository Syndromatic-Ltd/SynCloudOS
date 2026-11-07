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
