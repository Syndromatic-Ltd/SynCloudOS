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

import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { auditSynWareCapabilityUsage, main } from "../../scripts/synware/audit-capability-usage.mjs";
import { auditSynWareImports } from "../../scripts/synware/audit-sdk-imports.mjs";

const roots: string[] = [];
function fixture(source: string, permissions: string[] = [], helpers: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "synware-fx-capabilities-")); roots.push(root);
  const files = { "Info.ts": `export default {schemaVersion:1,id:"com.example.fx",version:"1.0.0",permissions:${JSON.stringify(permissions)}} as const;`, "index.ts": source, ...helpers };
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, "src/SynWare/Example.app/Contents", name);
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content);
  }
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) { expect(root.startsWith(join(tmpdir(), "synware-fx-capabilities-"))).toBe(true); rmSync(root, { recursive: true, force: true }); } });

it("enforces imported scoped client operations through aliases, destructuring and local helpers", () => {
  const root = fixture(`import { useSCOS as useApp, useMIDI } from "@syndromatic/syncloudos/sdk";
import { locate } from "./helper";
export function Root() {
  const { location, lumina, video } = useApp();
  locate(location.createManager());
  const index = lumina.createIndex(); index.query({text:"hello"}); index.delete("item","mutation");
  video.createCaptureSession().requestDisplay();
  const midi = useMIDI(); midi.requestAuthorization({ sysex: true });
}`, [], { "helper.ts": "export function locate(manager: unknown) { return manager.current(); }" });
  const audit = auditSynWareCapabilityUsage(root);
  expect(new Set(audit.fxViolations.flatMap((record: any) => record.missing))).toEqual(new Set([
    "location.read", "location.request", "lumina.index", "lumina.query", "video.capture.display", "midi.access", "midi.sysex",
  ]));
  expect(audit.fxViolations.some((record: any) => record.file.endsWith("helper.ts") && record.operation === "location.current")).toBe(true);
  expect(auditSynWareImports(root).undeclaredCapabilities).toEqual(audit.fxViolations);
  let error = "";
  expect(main([root, "--check"], { stdout: { write() {} }, stderr: { write(value: string) { error += value; } } })).toBe(1);
  expect(error).toContain("location.request");
});

it("accepts declared use and records actual operations, but ignores imports, comments and shadowed names", () => {
  const root = fixture(`import * as SDK from "@syndromatic/syncloudos/sdk";
import { useMIDI } from "@syndromatic/syncloudos/sdk";
import { MEFXTime } from "@syndromatic/syncloudos/fx/media";
function fake(useMIDI: () => any) { useMIDI().requestAuthorization({sysex:true}); }
// SDK.useSCOS().lumina.createIndex().delete("x", "y");
export function Root() { const manager = SDK.useLocation(); return manager.current(); }
void MEFXTime;`, ["location.read", "location.request"]);
  const audit = auditSynWareCapabilityUsage(root);
  expect(audit.fxViolations).toEqual([]);
  expect(audit.fxUsage.map((record: any) => record.operation)).toEqual(expect.arrayContaining(["location.createManager", "location.current"]));
  expect(audit.fxUsage.every((record: any) => record.family === "location")).toBe(true);
});

it("rejects indeterminate permissions and computed authority while allowing passive MIDI inspection and pure values", () => {
  const root = fixture(`import { useSCOS, useMIDI } from "@syndromatic/syncloudos/sdk";
const key = unknownKey();
export function Root() { const app = useSCOS(); app[key](); const midi = useMIDI(); midi.getCapabilities(); midi.requestAuthorization(options); }`);
  const audit = auditSynWareCapabilityUsage(root);
  expect(audit.fxViolations.some((record: any) => record.reason.includes("computed"))).toBe(true);
  expect(audit.fxViolations.some((record: any) => record.missing.includes("midi.sysex"))).toBe(true);
  expect(audit.fxViolations.some((record: any) => record.operation.endsWith("getCapabilities"))).toBe(false);
});

it("follows lazy production helpers and re-exported hooks, and fails unresolved manifest permission expressions", () => {
  const root = fixture(`import { locate } from "./bridge";
export const action = () => locate().current();
void import("./lazy");`, [], {
    "bridge.ts": 'export { useLocation as locate } from "@syndromatic/syncloudos/sdk";',
    "lazy.ts": 'import { useVideo } from "@syndromatic/syncloudos/sdk"; useVideo().requestCamera();',
    "Info.ts": 'const permissions = getPermissions(); export default {id:"com.example.fx",permissions};',
  });
  const violations = auditSynWareCapabilityUsage(root).fxViolations;
  expect(violations.some((record: any) => record.file.endsWith("lazy.ts") && record.missing.includes("video.capture.camera"))).toBe(true);
  expect(violations.some((record: any) => record.missing.includes("location.request"))).toBe(true);
  expect(violations.some((record: any) => record.reason.includes("statically"))).toBe(true);
});

it("tracks literal dynamic SDK imports and namespace helper re-exports", () => {
  const root = fixture(`import * as hooks from "./bridge";
export async function Root() {
  const { useVideo } = await import("@syndromatic/syncloudos/sdk");
  useVideo().requestCamera();
  hooks.locate().current();
}`, [], { "bridge.ts": 'export { useLocation as locate } from "@syndromatic/syncloudos/sdk";' });
  const violations = auditSynWareCapabilityUsage(root).fxViolations;
  expect(violations.some((record: any) => record.missing.includes("video.capture.camera"))).toBe(true);
  expect(violations.some((record: any) => record.missing.includes("location.request"))).toBe(true);
});

it("check mode is read-only and allows a single declared Lumina acquisition permission", () => {
  const root = fixture('import {useLumina} from "@syndromatic/syncloudos/sdk"; useLumina().createIndex().query({text:"x"});', ["lumina.query"]);
  expect(auditSynWareCapabilityUsage(root).fxViolations).toEqual([]);
  expect(main([root, "--check"], { stdout: { write() {} }, stderr: { write() {} } })).toBe(0);
  expect(existsSync(join(root, "docs"))).toBe(false);
});

it("does not require capture or MIDI authorization for passive inspection, and keeps SysEx opt-in", () => {
  const root = fixture(`import {useVideo, useMIDI} from "@syndromatic/syncloudos/sdk";
useVideo().enumerateDevices(); useMIDI().getEndpoints();
useMIDI().requestAuthorization({sysex:false});`, ["midi.access"]);
  expect(auditSynWareCapabilityUsage(root).fxViolations).toEqual([]);
});
