import { describe, expect, it } from "vitest";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { inspectIdiomErrors, inspectStyleErrors, rendererOwnedSource } from "../../scripts/synware/idiom-errors.mjs";
import { IDIOM_REPLACEMENTS } from "../../scripts/synware/idiom-replacements.mjs";
import { synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";

const pairs = [
  ["raw button", "idiom.nse-controls", '<button>Run</button>', '<NSEButton title="Run" />'],
  ["raw input", "idiom.nse-controls", '<input type="range" />', '<NSESlider />'],
  ["raw select", "idiom.nse-controls", '<select />', '<NSEPopUpButton />'],
  ["raw textarea", "idiom.nse-controls", '<textarea />', '<NSETextView />'],
  ["raw table", "idiom.nse-controls", '<table />', '<NSETableView />'],
  ["system icon", "idiom.system-image", '<img className="back-icon" src="arrow-back.svg" />', '<NSEImageView image={NSEImage.named(NSEImage.goBackTemplateName)} />'],
  ["UI colour", "idiom.ui-colour", '<NSEButton style={{ color: "#fff" }} />', '<NSEButton style={{ color: "var(--nse-app-label)" }} />'],
  ["scroll view", "idiom.scroll-view", '<div style={{overflowY: "auto"}} />', '<NSEScrollView />'],
  ["storage", "idiom.preferences", 'localStorage.setItem("theme", "dark")', 'defaults.set("dark", "theme")'],
  ["Bluetooth", "idiom.device-fx", 'navigator.bluetooth.requestDevice({})', 'central.scanForPeripherals()'],
  ["NFC", "idiom.device-fx", 'new NDEFReader()', 'new NFXNDEFReaderSession()'],
  ["location", "idiom.device-fx", 'navigator.geolocation.getCurrentPosition(onPosition)', 'manager.current()'],
  ["camera", "idiom.device-fx", 'navigator.mediaDevices.getUserMedia({video: true})', 'capture.requestCamera()'],
  ["contacts", "idiom.device-fx", 'navigator.contacts.select(["name"])', 'new CNFXContactPickerViewController()'],
  ["MIDI", "idiom.device-fx", 'navigator.requestMIDIAccess()', 'midi.requestAccess()'],
  ["XR", "idiom.device-fx", 'navigator.xr.requestSession("immersive-vr")', 'new XRFXSession()'],
  ["haptics", "idiom.device-fx", 'navigator.vibrate(10)', 'new HFXHapticEngine()'],
  ["button glyph", "idiom.button-glyph", '<NSEButton title="‹ Sections" />', '<NSEButton title="Sections" image={backImage} />'],
  ["system artwork", "idiom.system-artwork", '<svg aria-label="Back"><path d="M 10 2 L 2 10 L 10 18" /></svg>', '<svg aria-label="Company logo"><path d="M 10 2 L 2 10 L 10 18" /></svg>'],
  ["eyebrow", "idiom.eyebrow", '<header><p>WORKSPACE</p><h1>Field Lab</h1></header>', '<header><p>Workspace</p><h1>Field Lab</h1></header>'],
  ["appearance", "idiom.appearance", '<NSEButton appearance="aqua" />', '<NSEView appearance={customAppearance}><NSEButton /></NSEView>'],
] as const;

describe("definite authoring errors", () => {
  it("distinguishes global APIs from object keys and scopes local browser names", () => {
    expect(inspectIdiomErrors({ file: "utility.ts", text: 'const prefs = { localStorage: false, speechSynthesis: false }; object.localStorage;' })).toEqual([]);
    const findings = inspectIdiomErrors({ file: "view.ts", text: 'function custom(navigator) { return navigator.bluetooth; }\nnavigator.bluetooth.requestDevice({});' });
    expect(findings).toEqual([expect.objectContaining({ line: 2, rule: "idiom.device-fx" })]);
  });
  it("keeps mathematical button titles and supplies custom-image guidance for other glyphs", () => {
    expect(inspectIdiomErrors({ file: "view.tsx", text: '<><NSEButton title="< 10 MB" /><NSEButton title="−5 °C" /></>' })).toEqual([]);
    const findings = inspectIdiomErrors({ file: "view.tsx", text: '<NSEButton title="⚙ Settings" />' });
    expect(findings).toContainEqual(expect.objectContaining({ rule: "idiom.button-glyph", message: expect.stringContaining("bundled image URL") }));
  });
  it.each(pairs)("reports %s and accepts its replacement", (_name, rule, fail, pass) => {
    const failed = inspectIdiomErrors({ file: "view.tsx", text: fail });
    expect(failed.some(finding => finding.rule === rule)).toBe(true);
    expect(failed.every(finding => finding.severity === "error" && finding.message.includes("@syndromatic/syncloudos"))).toBe(true);
    expect(inspectIdiomErrors({ file: "view.tsx", text: pass })).toEqual([]);
  });
  it("rejects class selectors into NSE internals but accepts an app class", () => {
    expect(inspectStyleErrors({file:"view.css", text:'.lab .nse-button__label { font-size: 20px; }'}).some(x => x.rule === "idiom.control-internals")).toBe(true);
    expect(inspectStyleErrors({file:"view.css", text:'.lab-label { font-size: 20px; }'})).toEqual([]);
    expect(inspectStyleErrors({file:"view.css", text:'.label[data-copy=".nse-button"] { font-size: 20px; }'})).toEqual([]);
  });
  it("rejects hand-rolled CSS scrolling and accepts framework layout", () => {
    expect(inspectStyleErrors({file:"view.css", text:'.pane { overflow-y: auto; }'}).some(x => x.rule === "idiom.scroll-view")).toBe(true);
    expect(inspectStyleErrors({file:"view.css", text:'.pane { min-height: 0; }'})).toEqual([]);
  });
  it("rejects CSS UI colours but accepts semantic values and theme value provisioning", () => {
    expect(inspectStyleErrors({file:"view.css", text:'.label { color: #123456; }'}).some(x => x.rule === "idiom.ui-colour")).toBe(true);
    expect(inspectStyleErrors({file:"view.css", text:'.label { color: var(--nse-app-label); }'})).toEqual([]);
    expect(inspectStyleErrors({file:"custom.css", text:'[data-nse-appearance="custom"] { --nse-app-label: #123456; }'})).toEqual([]);
  });
  it("does not mistake a photo, file input, section header or ordinary browser API for misuse", () => {
    const source = '<><img src="holiday.jpg" alt="The beach"/><input type="file"/><section role="group"><h2>FOLDERS</h2></section></>; fetch("/data"); Math.sin(1); navigator.clipboard.writeText("x");';
    expect(inspectIdiomErrors({file:"view.tsx", text:source})).toEqual([]);
  });
  it("does not invent a video-player or NSEColor equivalent", () => {
    expect(inspectIdiomErrors({file:"view.tsx", text:'<video src="movie.mp4" />'})).toEqual([]);
  });
  it("exempts a Three.js canvas surface but not an unused renderer import", () => {
    const source = 'import * as THREE from "three"; const renderer = new THREE.WebGLRenderer({canvas}); renderer.setClearColor("#000"); const view=<canvas style={{background:"#fff"}}/>;';
    expect(rendererOwnedSource(source)).toBe(true);
    expect(inspectIdiomErrors({file:"scene.tsx", text:source})).toEqual([]);
    const unused = 'import * as THREE from "three"; const view=<button>Run</button>;';
    expect(rendererOwnedSource(unused)).toBe(false);
    expect(inspectIdiomErrors({file:"view.tsx", text:unused})).not.toEqual([]);
  });
  it("ignores comments, strings and locally shadowed browser names", () => {
    expect(inspectIdiomErrors({file:"util.ts", text:'// navigator.bluetooth\nconst prose="localStorage"; function task(navigator) { return navigator.bluetooth; }'})).toEqual([]);
  });
  it("finds colour attributes, gradients and border colours without flagging custom theme definitions", () => {
    expect(inspectIdiomErrors({file:"view.tsx", text:'<NSEButton textColor="#123456" />'}).some(x => x.rule === "idiom.ui-colour")).toBe(true);
    expect(inspectStyleErrors({file:"view.css", text:'.label { border: 1px solid #123456; background: linear-gradient(#fff, #eee); }'}).filter(x => x.rule === "idiom.ui-colour")).toHaveLength(2);
  });
  it("allows source-list group headers and rejects explicit forced system appearance objects", () => {
    expect(inspectIdiomErrors({file:"view.tsx", text:'<NSEOutlineView><div role="group"><p>FOLDERS</p><h2>Saved</h2></div></NSEOutlineView>'})).toEqual([]);
    expect(inspectIdiomErrors({file:"view.tsx", text:'<NSEView appearance={new NSEAppearance("darkAqua")} />'}).some(x => x.rule === "idiom.appearance")).toBe(true);
    expect(inspectIdiomErrors({file:"view.tsx", text:'<NSEView appearance={new NSEAppearance("aqua", {theme: customTheme})} />'})).toEqual([]);
  });
  it("names only actual public symbols at their exact SDK entry", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const entries = [...new Set(Object.values(IDIOM_REPLACEMENTS).map(value => value.entry))];
    const paths = entries.map(entry => resolve(root, synWareSdkEntries[entry]));
    const program = ts.createProgram(paths, {target: ts.ScriptTarget.ESNext, module:ts.ModuleKind.ESNext, moduleResolution:ts.ModuleResolutionKind.Bundler, jsx:ts.JsxEmit.ReactJSX, skipLibCheck:true, noEmit:true});
    const checker = program.getTypeChecker();
    for (const replacement of Object.values(IDIOM_REPLACEMENTS)) {
      const source = program.getSourceFile(resolve(root, synWareSdkEntries[replacement.entry]));
      const module = checker.getSymbolAtLocation(source!);
      const names = new Set(checker.getExportsOfModule(module!).map(symbol => symbol.name));
      const required = replacement.symbol.match(/\b(?:NSE|BTFX|NFX|LFX|VFX|CNFX|MIFX|XRFX|HFX|AUFX|SPFX)[A-Za-z0-9]+|defineNSEAppearance/gu) ?? [];
      for (const name of required) expect(names.has(name), `${name} must be public in ${replacement.entry}`).toBe(true);
    }
  });
});
