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

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import ts from "typescript";
// @ts-expect-error Plain ESM build tooling.
import { discoverSynWareProject } from "../../scripts/synware/vite-plugin.mjs";
// @ts-expect-error Plain ESM shared derivation.
import * as derivation from "../../scripts/synware/project-derivation.mjs";
import * as webspring from "../../src/Webspring/public";
import { NSEPreferencePane } from "../../src/SynCloudOS/Preferences";
import type { SynCloudOSProjectComposition } from "../../src/SynCloudOSReact/projectComposition";

const info = { bundleIdentifier: "com.example.site", displayName: "Example Site", version: "2.0.0" };
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "scos-ws-discovery-")); roots.push(root);
  const modules = new Map<string, unknown>();
  function put(path: string, source: string, module?: unknown) {
    const file = resolve(root, path); mkdirSync(resolve(file, ".."), { recursive: true }); writeFileSync(file, source);
    if (module) modules.set(file.replaceAll("\\", "/"), module);
  }
  put("package.json", JSON.stringify({ version: "1.0.0" }));
  function project(options: object = {}): SynCloudOSProjectComposition {
    const discovered = discoverSynWareProject(root, options);
    const code = ts.transpileModule(discovered.code.replaceAll("import.meta.env.DEV", "true"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: false } }).outputText;
    const exports = {} as SynCloudOSProjectComposition;
    const require = (id: string) => {
      if (id === "@syndromatic/syncloudos/webspring") return webspring;
      if (id.endsWith("project-derivation.mjs")) return derivation;
      const path = id.replace(/^\/@fs\//u, "").split("?")[0];
      if (id.endsWith("?url")) return { default: path };
      if (id.endsWith("?raw")) return { default: readFileSync(path, "utf8") };
      if (modules.has(path)) return modules.get(path);
      throw new Error(`Unexpected import ${id}`);
    };
    new Function("require", "exports", code)(require, exports);
    return exports;
  }
  return { put, project };
}

function widget(id: string, order = 0) {
  return class extends webspring.WSWidget<string> {
    static override id = id;
    static override title = id;
    static override order = order;
    static override whenEmpty = "hide" as const;
    override load() { return id; }
    override renderView() { return null; }
  };
}

function pane(id: string, order: number) {
  return class extends NSEPreferencePane {
    static override id = id;
    static override title = id;
    static override order = order;
    override renderView() { return null; }
  };
}

const infoSource = `export default ${JSON.stringify(info)};`;

describe("Webspring discovery", () => {
  it("pairs Info.ts with the WSApplication subclass index.tsx default-exports", () => {
    const f = fixture();
    class Site extends webspring.WSApplication {}
    f.put("src/Webspring/Contents/Info.ts", infoSource, { default: info });
    f.put("src/Webspring/Contents/index.tsx", "export default class Site extends WSApplication {}", { default: Site });
    const { webspring: definition } = f.project();
    expect(definition?.application).toBe(Site);
    expect(definition?.info).toMatchObject({ ...info, homeRoute: "/" });
  });

  it("pairs Info.ts alone with the base WSApplication", () => {
    const f = fixture();
    f.put("src/Webspring/Contents/Info.ts", infoSource, { default: info });
    const { webspring: definition } = f.project();
    expect(definition?.application).toBe(webspring.WSApplication);
    expect(definition?.info.bundleIdentifier).toBe("com.example.site");
  });

  it("gives the neutral identity when the project declares no Webspring", () => {
    const { webspring: definition } = fixture().project();
    expect(definition?.application).toBe(webspring.WSApplication);
    expect(definition?.info).toMatchObject({ bundleIdentifier: "org.syncloudos.webspring", displayName: "SynCloudOS", version: "1.0.0" });
  });

  it("gives no Webspring when webspringEntry is false", () => {
    const f = fixture();
    f.put("src/Webspring/Contents/Info.ts", infoSource, { default: info });
    expect(f.project({ webspringEntry: false }).webspring).toBeNull();
  });

  it("names index.tsx when its default export is not a WSApplication subclass", () => {
    const f = fixture();
    f.put("src/Webspring/Contents/Info.ts", infoSource, { default: info });
    f.put("src/Webspring/Contents/index.tsx", "export default function Site() { return null; }", { default: () => null });
    expect(() => f.project()).toThrow(/Webspring[\\/]Contents[\\/]index\.tsx.*WSApplication subclass/u);
  });

  it("requires Info.ts beside index.tsx", () => {
    const f = fixture();
    class Site extends webspring.WSApplication {}
    f.put("src/Webspring/Contents/index.tsx", "export default class Site extends WSApplication {}", { default: Site });
    expect(() => f.project()).toThrow(/Info\.ts/u);
  });

  it("discovers widgets in order, then ID, and names a .widget that exports anything else", () => {
    const f = fixture();
    f.put("src/Widgets/A.widget/index.tsx", "export default class A extends WSWidget {}", { default: widget("late", 5) });
    f.put("src/Widgets/B.widget/index.tsx", "export default class B extends WSWidget {}", { default: widget("zeta") });
    f.put("src/Widgets/News.widget/index.tsx", "export default class News extends WSWidget {}", { default: widget("alpha") });
    const { webspring: definition, widgets } = f.project();
    expect(widgets.map(entry => entry.id)).toEqual(["alpha", "zeta", "late"]);
    expect(definition?.widgets.map(entry => entry.id)).toEqual(["alpha", "zeta", "late"]);

    const bad = fixture();
    bad.put("src/Widgets/News.widget/index.tsx", "export default {};", { default: {} });
    expect(() => bad.project()).toThrow(/News\.widget.*WSWidget subclass/u);
  });

  it("discovers preference panes in order, then ID, and names a .prefPane that exports anything else", () => {
    const f = fixture();
    f.put("src/Preferences/Billing.prefPane/index.tsx", "export default class Billing extends NSEPreferencePane {}", { default: pane("billing", 700) });
    f.put("src/Preferences/Alerts.prefPane/index.tsx", "export default class Alerts extends NSEPreferencePane {}", { default: pane("alerts", 700) });
    f.put("src/Preferences/Early.prefPane/index.tsx", "export default class Early extends NSEPreferencePane {}", { default: pane("early", 10) });
    const { webspring: definition, preferences } = f.project();
    expect(preferences.map(entry => entry.id)).toEqual(["early", "alerts", "billing"]);
    expect(definition?.preferences.panes.map(entry => entry.id)).toEqual(["early", "alerts", "billing"]);

    const bad = fixture();
    bad.put("src/Preferences/Billing.prefPane/index.tsx", "export default {};", { default: {} });
    expect(() => bad.project()).toThrow(/Billing\.prefPane.*NSEPreferencePane subclass/u);
  });
});
