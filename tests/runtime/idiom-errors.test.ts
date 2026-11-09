import { describe, expect, it } from "vitest";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { inspectIdiomErrors, inspectStyleErrors, rendererOwnedRegions } from "../../scripts/synware/idiom-errors.mjs";
import { IDIOM_REPLACEMENTS } from "../../scripts/synware/idiom-replacements.mjs";
import { synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";

const pairs = [
  ["raw button", "idiom.nse-controls", '<button>Run</button>', '<NSEButton title="Run" />'],
  ["raw input", "idiom.nse-controls", '<input type="range" />', '<NSESlider />'],
  ["raw select", "idiom.nse-controls", '<select />', '<NSEPopUpButton />'],
  ["raw textarea", "idiom.nse-controls", '<textarea />', '<NSETextView />'],
  ["interactive table", "idiom.nse-controls", '<table><tbody><tr onClick={selectRow}><td>Row</td></tr></tbody></table>', '<NSETableView />'],
  ["system icon", "idiom.system-image", '<img className="back-icon" src="arrow-back.svg" />', '<NSEImageView image={NSEImage.named(NSEImage.goBackTemplateName)} />'],
  ["UI colour", "idiom.ui-colour", '<NSEButton style={{ color: "#fff" }} />', '<NSEButton style={{ color: "var(--nse-app-label)" }} />'],
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
    expect(inspectStyleErrors({file:"view.css", text:'.lab .nse-button__label { font-size: 20px; }'})).toContainEqual(expect.objectContaining({rule:"idiom.control-internals", severity:"error"}));
    expect(inspectStyleErrors({file:"view.css", text:'.lab-label { font-size: 20px; }'})).toEqual([]);
    expect(inspectStyleErrors({file:"view.css", text:'.label[data-copy=".nse-button"] { font-size: 20px; }'})).toEqual([]);
  });
  it("warns about CSS scrolling without failing legitimate code samples", () => {
    expect(inspectStyleErrors({file:"view.css", text:'pre { overflow: auto; }'})).toEqual([expect.objectContaining({rule: "idiom.scroll-view", severity: "warning"})]);
    expect(inspectStyleErrors({file:"view.css", text:'.pane { min-height: 0; }'})).toEqual([]);
  });
  it("warns about inline scrolling inside a document view without emitting errors", () => {
    const findings = inspectIdiomErrors({file:"view.tsx", text:'<NSEScrollView><pre style={{overflow: "auto"}}>A code sample</pre></NSEScrollView>'});
    expect(findings).toEqual([expect.objectContaining({rule: "idiom.scroll-view", severity: "warning"})]);
    expect(inspectIdiomErrors({file:"view.tsx", text:'<NSEScrollView><pre>A code sample</pre></NSEScrollView>'})).toEqual([]);
  });
  it.each([
    '<table><caption>Results</caption><tbody><tr><th>Sample</th><td>42</td></tr></tbody></table>',
    '<table />',
    '<div><table /><NSEButton title="Save" /></div>',
    '<table><tbody><tr><td>42<input type="hidden" name="id" /></td></tr></tbody></table>',
  ])("accepts a static content table: %s", text => {
    expect(inspectIdiomErrors({file:"view.tsx", text})).toEqual([]);
  });
  it.each([
    '<table onClick={selectRow}><tbody><tr><td>Row</td></tr></tbody></table>',
    '<table onClickCapture={selectRow}><tbody><tr><td>Row</td></tr></tbody></table>',
    '<table><tbody><tr aria-selected={selected}><td>Row</td></tr></tbody></table>',
    '<table><tbody><tr><td><NSEButton title="Edit" /></td></tr></tbody></table>',
    '<table><tbody><tr><td><a href="/edit">Edit</a></td></tr></tbody></table>',
  ])("rejects an interactive table: %s", text => {
    expect(inspectIdiomErrors({file:"view.tsx", text})).toContainEqual(expect.objectContaining({rule: "idiom.nse-controls", severity: "error", message: expect.stringContaining("NSETableView")}));
  });
  it("checks a raw HUD button beside the renderer surface in the same file", () => {
    const renderer = 'import * as THREE from "three"; const renderer = new THREE.WebGLRenderer({canvas}); renderer.render(scene, camera);';
    expect(inspectIdiomErrors({file:"scene.tsx", text: renderer + 'const view=<main><canvas /><div><button>Reset</button></div></main>;'})).toEqual([expect.objectContaining({rule: "idiom.nse-controls", severity: "error"})]);
    expect(inspectIdiomErrors({file:"scene.tsx", text: renderer + 'const view=<main><canvas /><div><NSEButton title="Reset" /></div></main>;'})).toEqual([]);
  });
  it.each([
    ['import { Canvas } from "@react-three/fiber";', 'Canvas'],
    ['import { Stage } from "react-konva";', 'Stage'],
  ])("exempts only the imported renderer subtree: %s", (imports, surface) => {
    const body = `${imports} const view=<><${surface}><button>Surface-owned</button></${surface}><button>HUD</button></>;`;
    expect(inspectIdiomErrors({file:"scene.tsx", text:body})).toEqual([expect.objectContaining({rule:"idiom.nse-controls", severity:"error"})]);
    expect(inspectIdiomErrors({file:"scene.tsx", text:`${imports} const view=<main><${surface}/><button>HUD</button></main>;`})).toEqual([expect.objectContaining({rule:"idiom.nse-controls", severity:"error"})]);
  });
  it("does not share renderer handles across lexical bindings", () => {
    const source = 'import * as THREE from "three"; function scene(canvas) { const renderer = new THREE.WebGLRenderer({canvas}); return renderer; } function ui(renderer) { return renderer.render(<button>Save</button>); }';
    expect(inspectIdiomErrors({file:"scene.tsx", text:source})).toEqual([expect.objectContaining({rule:"idiom.nse-controls", severity:"error"})]);
    const loop = 'import * as THREE from "three"; const renderer = new THREE.WebGLRenderer({canvas}); for (let renderer of views) { renderer.render(<button>HUD</button>); }';
    expect(inspectIdiomErrors({file:"scene.tsx", text:loop})).toEqual([expect.objectContaining({rule:"idiom.nse-controls", severity:"error"})]);
  });
  it("rejects CSS UI colours but accepts semantic values and theme value provisioning", () => {
    expect(inspectStyleErrors({file:"view.css", text:'.label { color: #123456; }'})).toContainEqual(expect.objectContaining({rule:"idiom.ui-colour", severity:"error"}));
    expect(inspectStyleErrors({file:"view.css", text:'.label { color: var(--nse-app-label); }'})).toEqual([]);
    expect(inspectStyleErrors({file:"custom.css", text:'[data-nse-theme="custom"] { --nse-app-label: #123456; }'})).toEqual([]);
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
    expect(rendererOwnedRegions({file:"scene.tsx", text:source}).some(region => region.kind === "surface")).toBe(true);
    expect(inspectIdiomErrors({file:"scene.tsx", text:source})).toEqual([]);
    const unused = 'import * as THREE from "three"; const view=<button>Run</button>;';
    expect(rendererOwnedRegions({file:"view.tsx", text:unused})).toEqual([]);
    expect(inspectIdiomErrors({file:"view.tsx", text:unused})).not.toEqual([]);
  });
  it("ignores comments, strings and locally shadowed browser names", () => {
    expect(inspectIdiomErrors({file:"util.ts", text:'// navigator.bluetooth\nconst prose="localStorage"; function task(navigator) { return navigator.bluetooth; }'})).toEqual([]);
  });
  it("finds colour attributes, gradients and border colours without flagging custom theme definitions", () => {
    expect(inspectIdiomErrors({file:"view.tsx", text:'<NSEButton textColour="#123456" />'}).some(x => x.rule === "idiom.ui-colour")).toBe(true);
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
