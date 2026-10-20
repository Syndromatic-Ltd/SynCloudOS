import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error Static tooling is ESM.
import { validateSynWareDirectory, validateSynWareDirectories } from "../../scripts/synware/validate-synware.mjs";
const roots: string[] = [];
function project() {
  const root = mkdtempSync(join(tmpdir(), "synapp-cli-")); roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "2.0.0" }));
  return root;
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function scaffold(target: string, ...options: string[]) {
  return execFileSync(process.execPath, ["scripts/synware/create-synware.mjs", target, ...options], { encoding: "utf8", stdio: "pipe" });
}

describe("folder authoring CLI", () => {
  it.each(["Cloud.app", "Billing.prefPane", "Latest.widget", "Journal.integration.ts"])("creates and validates %s", name => {
    const target = join(project(), name);
    scaffold(target, ...(name.endsWith(".integration.ts") ? ["--owners", "com.example.journal"] : []));
    const result = validateSynWareDirectory(target);
    expect(result.ok).toBe(true);
    if (name.endsWith(".app")) expect(result.manifest).toMatchObject({ bundleIdentifier: "com.example.cloud", displayName: "Cloud", version: "1.0.0", webspring: { visible: true } });
  });
  it("scaffolds explicit identity and version independently of the project package", () => {
    const target = join(project(), "JournalPublisher.app");
    scaffold(target, "--organisation", "org.Example");
    const result = validateSynWareDirectory(target);
    expect(result.ok).toBe(true);
    expect(result.manifest).toMatchObject({ bundleIdentifier: "org.Example.journalpublisher", displayName: "Journal Publisher", version: "1.0.0", schemaVersion: 1 });
  });
  it("refuses occupied folders and unsupported options", () => {
    const root = project(), target = join(root, "Cloud.app");
    mkdirSync(target); writeFileSync(join(target, "occupied.txt"), "occupied");
    expect(() => scaffold(target)).toThrow(/non-empty/);
    expect(() => scaffold(join(root, "Other.app"), "--unknown", "value")).toThrow(/Expected --fx/);
  });
  it("aggregates all discovered folder kinds and reports invalid entries", () => {
    const root = project();
    scaffold(join(root, "Alpha.app")); scaffold(join(root, "Zeta.app")); scaffold(join(root, "Billing.prefPane"));
    const broken = join(root, "Broken.app", "Contents"); mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "index.tsx"), "export const broken = true;");
    const result = validateSynWareDirectories(root);
    expect(result).toMatchObject({ valid: 3, invalid: 1, ok: false });
    expect(result.results.filter((entry: { ok: boolean }) => entry.ok).map((entry: { bundleIdentifier?: string | null; kind: string }) => entry.bundleIdentifier ?? entry.kind).sort()).toEqual(["com.example.alpha", "com.example.zeta", "preferencePane"]);
  });
  it("accepts reviewed imports and rejects undeclared packages", () => {
    const target = join(project(), "Dependencies.app"); scaffold(target);
    const entry = join(target, "Contents/index.tsx");
    writeFileSync(entry, 'import { createPortal } from "react-dom"; import { motion } from "framer-motion"; export default function App() { return null; }');
    expect(validateSynWareDirectory(target).ok).toBe(true);
    writeFileSync(entry, 'import thing from "not-a-reviewed-runtime-package"; export default function App() { return null; }');
    expect(validateSynWareDirectory(target).error).toMatch(/unsupported package/);
  });
});
