import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { auditSynWareIdioms } from "../../scripts/synware/idiom-audit.mjs";

let root: string;
function put(path: string, text: string) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}
function audit(source: string) {
  put("Example.app/Contents/index.tsx", 'import { NSEApplication } from "@syndromatic/syncloudos";\nexport default class Example extends NSEApplication {}\n' + source);
  return auditSynWareIdioms({ root, applications: [{ directory: join(root, "Example.app"), bundleIdentifier: "test.example" }] });
}
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "syncloudos-idiom-audit-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("integrated idiom audit", () => {
  it("reports definite misuse as errors and preserves legitimate NSE controls", () => {
    expect(audit('const view = <button>Save</button>;').findings).toContainEqual(expect.objectContaining({ rule: "idiom.nse-controls", severity: "error" }));
    expect(audit('const view = <NSEButton title="Save" />;').findings).toEqual([]);
  });
  it("suppresses only the adjacent rule with a reason and lists every opt-out", () => {
    const result = audit('// syncloudos-allow idiom.nse-controls: vendor accessibility bridge\nconst view = <button>Save</button>;\nconst other = <button>Open</button>;');
    expect(result.findings.filter(f => f.rule === "idiom.nse-controls")).toHaveLength(1);
    expect(result.idiomAudit.optOuts).toEqual([expect.objectContaining({ rule: "idiom.nse-controls", reason: "vendor accessibility bridge", line: 3, suppressed: 1 })]);
  });
  it("rejects a missing reason and does not treat strings as opt-outs", () => {
    const result = audit('// syncloudos-allow idiom.nse-controls:\nconst view = <button>Save</button>;\nconst text = "// syncloudos-allow idiom.nse-controls: fake";');
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "idiom.opt-out", severity: "error" }));
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "idiom.nse-controls", severity: "error" }));
    expect(result.idiomAudit.optOuts).toHaveLength(1);
  });
  it("lists malformed opt-outs instead of silently dropping them", () => {
    const result = audit('// syncloudos-allow\nconst view = <NSEButton />;');
    expect(result.idiomAudit.optOuts).toHaveLength(1);
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "idiom.opt-out", severity: "error" }));
  });
  it("exempts renderer-owned files and reports the exemption", () => {
    const result = audit('import * as THREE from "three";\nconst renderer = new THREE.WebGLRenderer({canvas});\nconst view = <canvas ref={canvasRef} />;\nconst sprite = "#ff0000";\nrequestAnimationFrame(render);');
    expect(result.findings.filter(f => f.severity === "error")).toEqual([]);
    expect(result.idiomAudit.rendererExemptions).toContain("Example.app/Contents/index.tsx");
  });
  it("does not exempt ordinary UI merely because Three.js is imported", () => {
    const result = audit('import * as THREE from "three";\nconst view = <button>Save</button>;');
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "idiom.nse-controls", severity: "error" }));
  });
  it("audits Webspring entry graphs without requiring an application", () => {
    const entry = put("src/Webspring/Contents/index.tsx", 'import "./BoardView";');
    put("src/Webspring/Contents/BoardView.tsx", 'export const view = <button>Open</button>;');
    const result = auditSynWareIdioms({ root, applications: [], entries: [entry] });
    expect(result.findings).toContainEqual(expect.objectContaining({ file: "src/Webspring/Contents/BoardView.tsx", rule: "idiom.nse-controls", severity: "error" }));
  });
  it("allows a developer theme without demanding Atmo", () => {
    const result = audit('const themeName = "Atmo-Onyx";\nconst view = <NSEButton title="Save" />;');
    expect(result.findings).toEqual([]);
    expect(result.idiomAudit).toMatchObject({ errors: 0, warnings: 0, idiomatic: true });
  });
  it("keeps token opt-outs local even when another line repeats the token", () => {
    put("sdk/neutral.css", ":root { --nse-app-accent: CanvasText; }");
    put("app.css", '/* // syncloudos-allow idiom.nse-token: local experiment */\n.a { color: var(--nse-experiment); }\n.b { color: var(--nse-experiment); }');
    const result = auditSynWareIdioms({ root, applications: [], sdkRoot: join(root, "sdk") });
    expect(result.findings.filter(f => f.rule === "idiom.nse-token")).toEqual([expect.objectContaining({ file: "app.css", line: 3 })]);
    expect(result.idiomAudit.optOuts[0].suppressed).toBe(1);
  });
});
