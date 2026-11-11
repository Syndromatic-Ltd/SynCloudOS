import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
// @ts-expect-error Plain ESM build tooling.
import { synCloudOS } from "../../../scripts/synware/vite-plugin.mjs";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "fx-app-plugin-")); roots.push(root);
  const put = (path: string, source: string) => { const file = resolve(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, source); return file; };
  put("package.json", '{"version":"1.0.0"}');
  const entry = put("src/SynWare/Probe.app/Contents/index.tsx", "export default function Probe() { return null; }");
  const info = put("src/SynWare/Probe.app/Contents/Info.ts", 'export default {bundleIdentifier:"com.example.Probe",displayName:"Probe",version:"1.0.0"};');
  return { root, entry, info, put };
}

describe("per-application FX virtual modules", () => {
  it("resolves focused family entries only from discovered application code", async () => {
    const f = fixture(), plugin = synCloudOS({ webspringEntry: false });
    await plugin.configResolved({ root: f.root, command: "serve" });
    const id = "\0virtual:syncloudos/app/com.example.probe/fx/crypto";
    expect(plugin.resolveId("@syndromatic/syncloudos/fx/crypto", f.entry + "?t=1")).toBe(id);
    expect(plugin.resolveId("@syndromatic/syncloudos/fx/crypto", resolve(f.root, "src/shared.ts"))).toBeNull();
    expect(plugin.resolveId("@syndromatic/syncloudos/fx/crypto", id)).toBeNull();
    expect(plugin.resolveId("@syndromatic/syncloudos/fx/video/webm", f.entry)).toBeNull();
    const source = plugin.load(id);
    expect(source).toContain('export * from "@syndromatic/syncloudos/fx/crypto"');
    expect(source).toContain("bindFXFamily");
    expect(source).toContain("CRFXSHA256");
    expect(source).not.toMatch(/export const CRFXDigest\b/);
    const dispatch = plugin.resolveId("@syndromatic/syncloudos/fx/dispatch", f.entry);
    expect(dispatch).toBe("\0virtual:syncloudos/app/com.example.probe/fx/dispatch");
    expect(plugin.load(dispatch)).toContain("export const DFXQueue = bound.DFXQueue");
    expect(plugin.load(dispatch)).not.toContain("export const DFXSourceProtocol");
    expect(plugin.load("\0virtual:syncloudos/app/com.example.probe")).toContain("createAppSCOS");
  });

  it("invalidates every resolved per-app FX and SCOS module when discovery changes", async () => {
    const f = fixture(), plugin = synCloudOS({ webspringEntry: false });
    await plugin.configResolved({ root: f.root, command: "serve" });
    const ids = [plugin.resolveId("@syndromatic/syncloudos/fx/crypto", f.entry), plugin.resolveId("@syndromatic/syncloudos/fx/motion", f.entry), plugin.resolveId("@syndromatic/syncloudos/fx/dispatch", f.entry), plugin.resolveId("@syndromatic/syncloudos", f.entry)];
    const invalidateModule = vi.fn();
    const server = { middlewares: { use: vi.fn() }, watcher: { add: vi.fn(), on: vi.fn(), off: vi.fn(), once: vi.fn() }, moduleGraph: { getModuleById: (id: string) => ({ id }), invalidateModule }, ws: { send: vi.fn() } };
    plugin.configureServer(server);
    f.put("src/SynWare/Probe.app/Contents/Info.ts", 'export default {bundleIdentifier:"com.example.Renamed",displayName:"Probe",version:"1.0.0"};');
    await plugin.handleHotUpdate({ file: f.info, server });
    for (const id of ids) expect(invalidateModule).toHaveBeenCalledWith({ id });
    expect(plugin.resolveId("@syndromatic/syncloudos/fx/crypto", f.entry)).toBe("\0virtual:syncloudos/app/com.example.renamed/fx/crypto");
  });
});

it("delegates the private runtime to Vite's canonical resolver including dependency version queries", async () => {
  const plugin = synCloudOS({ webspringEntry: false });
  const resolve = vi.fn(async (id: string) => ({ id: `${id}?v=dependency-version` }));
  const runtime = await plugin.resolveId.call({ resolve }, "virtual:syncloudos/fx-runtime", "/consumer/app.ts");
  expect(resolve).toHaveBeenCalledWith(expect.stringMatching(/\/src\/SynCloudOS\/AppSDK\/fx\/runtime\.ts$/), "/consumer/app.ts", { skipSelf: true });
  expect(runtime.id).toMatch(/\/src\/SynCloudOS\/AppSDK\/fx\/runtime\.ts\?v=dependency-version$/);
  expect(runtime.id).not.toContain("\\");
});
