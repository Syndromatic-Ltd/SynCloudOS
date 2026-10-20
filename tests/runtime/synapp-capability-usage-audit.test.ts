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

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — Task 2 introduces this executable ESM audit module.
import { auditSynWareCapabilityUsage } from "../../scripts/synware/audit-capability-usage.mjs";

const temporaryRoots: string[] = [];
function fixtureRoot(label: string) {
  const root = mkdtempSync(path.join(tmpdir(), `synapp-capabilities-${label}-`));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, source: string) {
  const target = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source);
}

function capabilityFixture() {
  const root = fixtureRoot("fixture");
  write(root, "src/SynWare/Example.app/Contents/Info.ts", 'export default { id: "example" };\n');
  write(root, "src/SynWare/Example.app/Contents/index.ts", [
    'import { inspectRuntime } from "./helpers";',
    'import "./styles.css";',
    "export function Example({ runtime }: { runtime: unknown }) {",
    "  const alias = runtime;",
    "  const { persistence } = alias as any;",
    "  const { getPreference } = persistence;",
    '  getPreference("example.theme", "dark");',
    "  inspectRuntime(runtime);",
    '  window.matchMedia("(min-width: 1px)");',
    '  window.addEventListener("resize", () => {});',
    "  const viewport = window.innerWidth + window.devicePixelRatio;",
    "  const online = navigator.onLine;",
    "  const identifier = crypto.randomUUID();",
    "  setTimeout(() => {}, 1);",
    "  requestAnimationFrame(() => {});",
    '  window.history.pushState({}, "", "/example");',
    '  window.location.assign("/example");',
    '  new Notification("example");',
    '  localStorage.getItem("example.theme");',
    '  void fetch("/example.json");',
    '  const canvas = document.createElement("canvas");',
    '  canvas.getContext("2d");',
    '  canvas.addEventListener("pointerdown", () => {});',
    "  return { identifier, online, viewport };",
    "}",
    "",
  ].join("\n"));
  write(root, "src/SynWare/Example.app/Contents/styles.css", ".window.nse-window-titlebar { display: block; }\n");
  write(root, "src/SynWare/Example.app/Contents/helpers.ts", [
    "export function inspectRuntime(received: unknown) {",
    "  const runtime = received as any;",
    "  const { presentation } = runtime;",
    "  return presentation.getSnapshot();",
    "}",
    "",
  ].join("\n"));
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe("first-party SynWare capability authority audit", () => {
  it("tracks imported mounted SDK hooks while excluding shadowed browser names", () => {
    const root = fixtureRoot("mounted-hooks");
    write(root, "src/SynWare/Example.app/Contents/Info.ts", 'export default { id: "example" };\n');
    write(root, "src/SynWare/Example.app/Contents/index.ts", [
      'import { useSCOS as useApp, useNSEMenuPort } from "@syndromatic/syncloudos/sdk";',
      'export function Example() {',
      '  const app = useApp();',
      '  const menus = useNSEMenuPort();',
      '  const window = { bounds: { width: 500 }, id: "owned" };',
      '  app.scheduler.setTimeout(() => {}, 0);',
      '  menus.scheduler!.clearTimeout(null);',
      '  return window.bounds.width + window.id.length;',
      '}',
      'export function NativeBrowserUI() { window.print(); return window.visualViewport?.width; }',
    ].join("\n"));
    const audit = auditSynWareCapabilityUsage(root);
    expect(audit.unresolved).toEqual([]);
    expect(audit.apps).toEqual(expect.arrayContaining([
      expect.objectContaining({ receiver: "runtime.scheduler", member: "setTimeout", disposition: "existing-client" }),
      expect.objectContaining({ receiver: "runtime.scheduler", member: "clearTimeout", disposition: "existing-client" }),
    ]));
    expect(audit.browserAuthority).toEqual(expect.arrayContaining([
      expect.objectContaining({ receiver: "window", member: "print", disposition: "browser-owned", target: "printing" }),
      expect.objectContaining({ receiver: "window.visualViewport", member: "width", disposition: "browser-owned", target: "visual-viewport" }),
    ]));
    expect(audit.browserAuthority.some((record: { receiver: string; member: string }) => record.receiver === "window.bounds" || record.member === "id" || record.receiver === "window.id")).toBe(false);
  });

  it("rejects an empty consumer scan", () => {
    const root = fixtureRoot("empty");
    const result = spawnSync(process.execPath, ["scripts/synware/audit-capability-usage.mjs", root, "--check"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No SynWare applications");
  });

  it("fails the command on forbidden browser network access", () => {
    const root = fixtureRoot("forbidden");
    write(root, "src/SynWare/Example.app/Contents/index.ts", 'export function Example() { return fetch("/private"); }');
    const result = spawnSync(process.execPath, ["scripts/synware/audit-capability-usage.mjs", root, "--check"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"disposition": "forbidden"');
  });

  it("tracks runtime aliases, destructuring, transitive helpers, and ambient browser authority", () => {
    const root = capabilityFixture();
    const audit = auditSynWareCapabilityUsage(root);

    expect(audit.apps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        app: "example",
        file: "src/SynWare/Example.app/Contents/index.ts",
        receiver: "runtime.persistence",
        member: "getPreference",
        disposition: "existing-client",
        target: "preferences",
      }),
      expect.objectContaining({
        app: "example",
        file: "src/SynWare/Example.app/Contents/helpers.ts",
        receiver: "runtime.presentation",
        member: "getSnapshot",
        disposition: "existing-client",
        target: "presentation",
      }),
    ]));
    expect(audit.passThroughs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        app: "example",
        receiver: "runtime",
        member: "pass-through",
        target: "inspectRuntime",
      }),
    ]));
    expect(audit.browserAuthority).toEqual(expect.arrayContaining([
      expect.objectContaining({ receiver: "window", member: "matchMedia", target: "media-query" }),
      expect.objectContaining({ receiver: "window", member: "addEventListener", target: "global-listener" }),
      expect.objectContaining({ receiver: "window", member: "innerWidth", target: "work-area" }),
      expect.objectContaining({ receiver: "window", member: "devicePixelRatio", target: "work-area" }),
      expect.objectContaining({ receiver: "navigator", member: "onLine", target: "connectivity" }),
      expect.objectContaining({ receiver: "crypto", member: "randomUUID", target: "scheduler" }),
      expect.objectContaining({ receiver: "globalThis", member: "setTimeout", target: "scheduler" }),
      expect.objectContaining({ receiver: "globalThis", member: "requestAnimationFrame", target: "scheduler" }),
      expect.objectContaining({ receiver: "window.history", member: "pushState", target: "route" }),
      expect.objectContaining({ receiver: "window.location", member: "assign", target: "route" }),
      expect.objectContaining({ receiver: "Notification", member: "construct", target: "notifications" }),
      expect.objectContaining({ receiver: "localStorage", member: "getItem", target: "storage" }),
      expect.objectContaining({ receiver: "globalThis", member: "fetch", target: "network" }),
    ]));
    expect(audit.browserAuthority).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ receiver: "document", member: "createElement" }),
      expect.objectContaining({ receiver: "canvas", member: "getContext" }),
      expect.objectContaining({ receiver: "canvas", member: "addEventListener" }),
    ]));
    expect(audit.unresolved).toEqual([]);
  });

  it("keeps unmapped authority visible and makes the command fail closed", () => {
    const root = fixtureRoot("unresolved");
    write(root, "src/SynWare/Example.app/Contents/Info.ts", 'export default { id: "example" };\n');
    write(root, "src/SynWare/Example.app/Contents/index.ts", [
      "export function Example({ runtime }: { runtime: unknown }) {",
      "  return (runtime as any).experimental.launch();",
      "}",
      "",
    ].join("\n"));

    const audit = auditSynWareCapabilityUsage(root);
    expect(audit.unresolved).toEqual(expect.arrayContaining([
      expect.objectContaining({ app: "example", receiver: "runtime.experimental", member: "launch" }),
    ]));

    const command = spawnSync(process.execPath, ["scripts/synware/audit-capability-usage.mjs", root], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(command.status).toBe(1);
    expect(command.stderr).toContain("unresolved");
  });


});
