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
  put("Example.app/Contents/index.tsx", 'import { NSEApplication } from "@syndromatic/syncloudos";\nexport default class Example extends NSEApplication { mainMenu = null; }\n' + source);
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
  it("exempts renderer regions and reports their locations", () => {
    const result = audit('import * as THREE from "three";\nconst renderer = new THREE.WebGLRenderer({canvas});\nconst view = <canvas ref={canvasRef} />;\nconst sprite = "#ff0000";\nrequestAnimationFrame(render);');
    expect(result.findings.filter(f => f.severity === "error")).toEqual([]);
    expect(result.idiomAudit.rendererExemptions).toContainEqual(expect.objectContaining({file:"Example.app/Contents/index.tsx", kind:"surface"}));
  });
  it("still checks HUD controls and animation warnings beside a renderer", () => {
    const renderer = 'import * as THREE from "three";\nconst renderer = new THREE.WebGLRenderer({canvas});\nconst view = <><canvas /><button>Reset</button></>;\nnew AFXAnimation({ duration: 1, reducedMotion: "never" });';
    const result = audit(renderer);
    expect(result.findings).toContainEqual(expect.objectContaining({rule:"idiom.nse-controls", severity:"error"}));
    expect(result.findings).toContainEqual(expect.objectContaining({rule:"idiom.reduced-motion", severity:"warning"}));
    expect(result.idiomAudit.applications[0].rawControls).toBe(1);
    const supported = audit(renderer.replace('<button>Reset</button>', '<NSEButton title="Reset" />'));
    expect(supported.idiomAudit.errors).toBe(0);
  });
  it("keeps static tables and overflow samples free of errors", () => {
    put("samples.css", 'pre { overflow: auto; }');
    const result = audit('const view = <NSEScrollView><pre style={{overflowY:"scroll"}}>Sample</pre><table><tbody><tr><td>42</td></tr></tbody></table></NSEScrollView>;');
    expect(result.idiomAudit.errors).toBe(0);
    expect(result.idiomAudit.applications[0].rawControls).toBe(0);
    expect(result.findings.filter(f => f.rule === "idiom.scroll-view")).toHaveLength(2);
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
    put("sdk/neutral.css", ":root { --nse-colour-control-accent: CanvasText; }");
    put("app.css", '/* // syncloudos-allow idiom.nse-token: local experiment */\n.a { color: var(--nse-experiment); }\n.b { color: var(--nse-experiment); }');
    const result = auditSynWareIdioms({ root, applications: [], sdkRoot: join(root, "sdk") });
    expect(result.findings.filter(f => f.rule === "idiom.nse-token")).toEqual([expect.objectContaining({ file: "app.css", line: 3 })]);
    expect(result.idiomAudit.optOuts[0].suppressed).toBe(1);
  });
  it("requires mainMenu or an application-menu trigger unless opted out or backgroundService", () => {
    const bare = (body: string, manifest?: Record<string, unknown>) => {
      put("Bare.app/Contents/index.tsx", body);
      return auditSynWareIdioms({ root, applications: [{ directory: join(root, "Bare.app"), bundleIdentifier: "test.bare", ...(manifest ? { manifest } : {}) }] });
    };
    const missing = bare('import { NSEApplication } from "@syndromatic/syncloudos";\nexport default class Bare extends NSEApplication {}');
    expect(missing.findings).toContainEqual(expect.objectContaining({ rule: "idiom.application-menu", severity: "error" }));
    const withMainMenu = bare('import { NSEApplication } from "@syndromatic/syncloudos";\nexport default class Bare extends NSEApplication { applicationDidFinishLaunching() { this.mainMenu = menu; } }');
    expect(withMainMenu.findings.filter(f => f.rule === "idiom.application-menu")).toEqual([]);
    const withToolbarTrigger = bare('import { NSEApplication, NSEToolbarItem } from "@syndromatic/syncloudos";\nexport default class Bare extends NSEApplication { static items = [NSEToolbarItem.applicationMenu("gear")]; }');
    expect(withToolbarTrigger.findings.filter(f => f.rule === "idiom.application-menu")).toEqual([]);
    const withContentTrigger = bare('import { NSEApplication, useApplicationMenuTrigger } from "@syndromatic/syncloudos";\nexport default class Bare extends NSEApplication {}\nexport function Trigger() { return useApplicationMenuTrigger(); }');
    expect(withContentTrigger.findings.filter(f => f.rule === "idiom.application-menu")).toEqual([]);
    const background = bare('import { NSEApplication } from "@syndromatic/syncloudos";\nexport default class Bare extends NSEApplication {}', { runtime: { presentation: "backgroundService" } });
    expect(background.findings.filter(f => f.rule === "idiom.application-menu")).toEqual([]);
    const optedOut = bare('/* License */\nimport { NSEApplication } from "@syndromatic/syncloudos";\n// syncloudos-allow idiom.application-menu: kiosk display with no chrome\nexport default class Bare extends NSEApplication {}');
    expect(optedOut.findings.filter(f => f.rule === "idiom.application-menu")).toEqual([]);
    expect(optedOut.idiomAudit.optOuts).toContainEqual(expect.objectContaining({ rule: "idiom.application-menu", suppressed: 1 }));
  });
  it("flags duplicate window chrome and duplicate application-menu triggers across an app", () => {
    const customTitlebar = audit('const view = <header className="custom-titlebar">Title</header>;');
    expect(customTitlebar.findings).toContainEqual(expect.objectContaining({ rule: "idiom.duplicate-chrome", severity: "error" }));
    const borderless = audit('const opts = { styleMask: ["closable", "resizable"] }; const view = <header className="custom-titlebar">Title</header>;');
    expect(borderless.findings.filter(f => f.rule === "idiom.duplicate-chrome")).toEqual([]);
    const duplicateToolbar = audit('this.window.toolbar = toolbar; const view = <div role="toolbar" />;');
    expect(duplicateToolbar.findings).toContainEqual(expect.objectContaining({ rule: "idiom.duplicate-chrome", severity: "error" }));
    const duplicateAppMenu = audit('const a = NSEToolbarItem.applicationMenu("gear"); const b = useApplicationMenuTrigger();');
    expect(duplicateAppMenu.findings).toContainEqual(expect.objectContaining({ rule: "idiom.duplicate-window-action", severity: "warning" }));
  });
});
